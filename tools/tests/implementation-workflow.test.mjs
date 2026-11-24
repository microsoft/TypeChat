// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";
import { BUILD_LIMITS, blobHash, collectCandidate } from "../issue-implementation.mjs";

const workflows = new URL("../../.github/workflows/", import.meta.url);
const markdown = fs.readFileSync(new URL("issue-implementation.md", workflows), "utf8");
const source = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)[1]);
const compiled = parse(fs.readFileSync(new URL("issue-implementation.lock.yml", workflows), "utf8"));
const ci = parse(fs.readFileSync(new URL("agent-workflow-check.yml", workflows), "utf8"));

test("coding is inactive by default and only an owner Issue comment can activate inference", () => {
    assert.deepEqual(Object.keys(source.on.workflow_dispatch.inputs), ["issue", "acceptance"]);
    assert.equal(source.on.reaction, "rocket");
    assert.equal(source.on["status-comment"], false);
    assert.match(source.if, /TYPECHAT_IMPLEMENTATION_ENABLED == 'true'/);
    assert.match(source.if, /!github\.event\.issue\.pull_request/);
    assert.match(source.if, /sender\.id == 25374553/);
    assert.match(source.if, /triggering_actor == 'robgruen'/);
    assert.ok(compiled.jobs.agent.if.includes("needs.prepare.outputs.should_build == 'true'"));
    assert.equal(source.concurrency["cancel-in-progress"], false);
    assert.equal(source.concurrency["job-discriminator"], "${{ github.run_id }}");
});

test("sparse coding checkouts collect complete candidates offline with ignore rules", t => {
    const checkout = source.steps.find(step => step.uses?.startsWith("actions/checkout@"));
    const compiledCheckout = compiled.jobs.agent.steps.find(step => step.uses?.startsWith("actions/checkout@"));
    assert.equal(checkout.with["sparse-checkout-cone-mode"], false);
    assert.equal(compiledCheckout.with["sparse-checkout"], checkout.with["sparse-checkout"]);

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-sparse-collector-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const origin = path.join(directory, "origin");
    const coding = path.join(directory, "coding");
    const git = (cwd, args, options = {}) => execFileSync("git", ["-C", cwd, ...args],
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options });
    git(directory, ["init", "--quiet", origin]);
    git(origin, ["config", "core.autocrlf", "false"]);
    git(origin, ["config", "uploadpack.allowFilter", "true"]);
    fs.writeFileSync(path.join(origin, ".gitignore"), "node_modules/\n");
    fs.mkdirSync(path.join(origin, "python"), { recursive: true });
    const original = "value = 1\n";
    fs.writeFileSync(path.join(origin, "python", "value.py"), original);
    git(origin, ["add", "--all"]);
    git(origin, ["-c", "user.name=TypeChat Test", "-c", "user.email=typechat-test@example.invalid", "-c", "commit.gpgsign=false",
        "commit", "--quiet", "-m", "Sparse checkout fixture", "-m", "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"]);
    const prepared = { source: { commit: git(origin, ["rev-parse", "HEAD"]).trim() } };
    git(directory, ["clone", "--quiet", "--no-checkout", "--filter=blob:none", pathToFileURL(origin).href, coding]);
    assert.equal(git(coding, ["config", "--get", "remote.origin.promisor"]).trim(), "true");
    git(coding, ["config", "core.autocrlf", "false"]);
    git(coding, ["sparse-checkout", "set", "--no-cone", "--stdin"], { input: checkout.with["sparse-checkout"] });
    git(coding, ["checkout", "--quiet", prepared.source.commit]);
    git(coding, ["remote", "set-url", "origin", pathToFileURL(path.join(directory, "unavailable-origin")).href]);
    fs.writeFileSync(path.join(coding, "python", "value.py"), "value = 2\n");
    fs.writeFileSync(path.join(coding, "python", "added.py"), "added = True\n");
    fs.mkdirSync(path.join(coding, "python", "node_modules"));
    fs.writeFileSync(path.join(coding, "python", "node_modules", "ignored.py"), "not part of the candidate\n");

    const candidate = collectCandidate(prepared, coding, "Collect the complete offline patch.");
    assert.equal(candidate.baseSha, prepared.source.commit);
    assert.deepEqual(candidate.files, [
        { path: "python/added.py", previousSha: null, content: "added = True\n" },
        { path: "python/value.py", previousSha: blobHash(original), content: "value = 2\n" },
    ]);
});

test("native budgets, execution limits, exact completion, and separate usage are enforced", () => {
    assert.equal(source["max-ai-credits"], BUILD_LIMITS.mainCredits);
    assert.equal(source["max-turns"], BUILD_LIMITS.maxTurns);
    assert.equal(source["timeout-minutes"], BUILD_LIMITS.agentMinutes);
    assert.equal(source["safe-outputs"]["threat-detection"]["max-ai-credits"], BUILD_LIMITS.detectionCredits);
    assert.equal(source["safe-outputs"]["threat-detection"]["continue-on-error"], false);
    const main = compiled.jobs.agent.steps.find(step => step.name === "Execute GitHub Copilot CLI");
    const detection = compiled.jobs.detection.steps.find(step => step.name === "Execute threat detection with AWF");
    assert.match(main.run, /GH_AW_MAX_AI_CREDITS="1000"/);
    assert.match(detection.run, /GH_AW_MAX_AI_CREDITS="400"/);
    assert.equal(compiled.jobs.admission, undefined, "This pilot does not enable budget overrides");
    for (const id of ["checks", "publish"]) {
        assert.ok(compiled.jobs[id].needs.includes("detection"));
        assert.ok(compiled.jobs[id].if.includes("needs.detection.outputs.detection_success == 'true'"));
        assert.ok(compiled.jobs[id].if.includes("needs.agent.outputs.output_types == 'noop'"));
        const evaluate = new Function("needs", `return ${compiled.jobs[id].if.slice(3, -2)};`);
        const needs = { agent: { outputs: { output_types: "noop" } }, checks: { result: "success" },
            detection: { result: "success", outputs: { detection_success: "true" } } };
        assert.equal(evaluate(needs), true);
        for (const result of ["failure", "cancelled", "skipped"]) {
            assert.equal(evaluate({ ...needs, detection: { ...needs.detection, result } }), false);
        }
        assert.equal(evaluate({ ...needs, detection: { result: "success", outputs: { detection_success: "false" } } }), false);
    }
    assert.equal(source.jobs.publish.env.TYPECHAT_MAIN_CREDITS, "${{ needs.agent.outputs.aic }}");
    assert.equal(source.jobs.publish.env.TYPECHAT_DETECTION_CREDITS, "${{ needs.detection.outputs.aic }}");
});

test("failed prerequisites cannot authorize detector inference", () => {
    const job = compiled.jobs.detection;
    const eligible = new Function("needs", "always", `return ${job.if};`);
    const needs = { prepare: { result: "success" }, agent: { result: "success", outputs: { output_types: "noop" } } };
    assert.equal(eligible(needs, () => true), true);
    for (const result of ["failure", "cancelled", "skipped"]) {
        assert.equal(eligible({ ...needs, prepare: { result } }, () => true), false);
        assert.equal(eligible({ ...needs, agent: { ...needs.agent, result } }, () => true), false);
    }
    assert.equal(eligible({ ...needs, agent: { result: "success", outputs: { output_types: "noop,report_incomplete" } } }, () => true), false);

    const engine = job.steps.find(step => step.id === "detection_agentic_execution");
    const gate = "${{ job.status == 'success' && steps.stage_patch.outcome == 'success' && github.token || '' }}";
    assert.equal(engine.env.COPILOT_GITHUB_TOKEN, gate);
    assert.equal(engine.env.COPILOT_MODEL, "gpt-6.1-sol");
    assert.deepEqual(Object.entries(engine.env).filter(([, value]) =>
        typeof value === "string" && /github\.token|secrets\.GITHUB_TOKEN/.test(value)),
    [["COPILOT_GITHUB_TOKEN", gate]]);
    assert.ok(!/github\.token|secrets\.GITHUB_TOKEN/.test(engine.run));
    const credential = new Function("steps", "github", "job", `return ${gate.slice(3, -2)};`);
    for (const outcome of [undefined, "", "failure", "cancelled", "skipped"]) {
        assert.equal(credential({ stage_patch: { outcome } }, { token: "synthetic-authority" }, { status: "success" }), "");
    }
    for (const status of [undefined, "", "failure", "cancelled"]) {
        assert.equal(credential({ stage_patch: { outcome: "success" } }, { token: "synthetic-authority" }, { status }), "");
    }
    assert.equal(credential({ stage_patch: { outcome: "success" } }, { token: "synthetic-authority" }, { status: "success" }), "synthetic-authority");
    for (const env of [compiled.env, job.env, engine.env]) {
        assert.equal(env?.GH_TOKEN, undefined);
        assert.equal(env?.GITHUB_TOKEN, undefined);
        assert.equal(env?.GH_AW_GITHUB_TOKEN, undefined);
    }
    assert.equal(compiled.env.COPILOT_GITHUB_TOKEN, undefined);
    assert.equal(job.env.COPILOT_GITHUB_TOKEN, undefined);
});

test("only trusted activation can acknowledge commands; App secrets remain confined to preflight and publication", () => {
    assert.deepEqual(compiled.permissions, {});
    for (const [id, job] of Object.entries(compiled.jobs)) {
        const serialized = JSON.stringify(job);
        if (!["prepare", "publish"].includes(id)) assert.ok(!serialized.includes("DEPENDABOT_APP_PRIVATE_KEY"), id);
        for (const [permission, value] of Object.entries(job.permissions ?? {})) {
            const reactionPermission = id === "activation" && ["issues", "pull-requests"].includes(permission);
            assert.ok(value === "read" || value === "write" &&
                (reactionPermission || permission === "copilot-requests" && ["agent", "detection"].includes(id)),
                `${id} must not receive repository-write authority: ${permission}:${value}`);
        }
        assert.deepEqual(Object.entries(compiled.jobs.activation.permissions).filter(([, value]) => value === "write"),
            [["issues", "write"], ["pull-requests", "write"]]);
        const reaction = compiled.jobs.activation.steps.find(step => step.id === "react");
        assert.equal(reaction.name, "Add rocket reaction for immediate feedback");
        assert.ok(!reaction.if.includes("workflow_dispatch"));
        assert.equal(reaction.env.GH_AW_REACTION, "rocket");
        for (const step of job.steps ?? []) {
            if (step.uses?.startsWith("actions/checkout@")) {
                assert.equal(step.with["persist-credentials"], false, `${id} must not retain Git credentials`);
            }
        }
    }
    assert.equal(source.jobs.publish.permissions["copilot-requests"], undefined);
    for (const permission of ["contents", "actions", "issues", "pull-requests"]) {
        assert.equal(compiled.jobs.detection.permissions[permission], "read", `Detection needs ${permission} evidence access`);
    }
    assert.deepEqual([...new Set(JSON.stringify(compiled.jobs.agent).match(/secrets\.[A-Z0-9_]+/g))], ["secrets.GITHUB_TOKEN"]);
    const modelSteps = source["post-steps"];
    assert.ok(!JSON.stringify(modelSteps).includes("import("));
    assert.ok(!JSON.stringify(modelSteps).includes("TYPECHAT_APP"));
    assert.ok(source.jobs.prepare.steps.find(step => step.id === "prepare").env.TYPECHAT_APP_PRIVATE_KEY.includes("github.event_name == 'issue_comment'"));
});

test("publication never checks out or executes generated code and preserves intents before mutations", () => {
    const steps = source.jobs.publish.steps;
    const intent = steps.findIndex(step => step.id === "intent");
    const writer = steps.findIndex(step => step.id === "publish");
    assert.ok(intent > 0 && writer > intent);
    assert.equal(steps[intent].with["overwrite"], false);
    assert.equal(steps[intent].with["retention-days"], 30);
    assert.equal(steps[writer].with.retries, 0);
    for (const step of steps) {
        assert.equal(step.run, undefined, "The App publisher must not run shell commands or generated code");
        if (step.uses?.startsWith("actions/checkout@")) assert.equal(step.with.ref, "${{ github.sha }}");
    }
    const prepareSteps = source.jobs.prepare.steps;
    assert.equal(prepareSteps.find(step => step.id === "start").with["overwrite"], false);
    const preAgent = source["pre-agent-steps"][0].with.script;
    assert.ok(preAgent.includes("verifyBuildStart"));
});

test("candidate and scan discovery use authoritative same-run metadata rather than unsupported native outputs", () => {
    for (const job of [compiled.jobs.checks, compiled.jobs.publish, compiled.jobs.detection]) {
        assert.ok(!JSON.stringify(job).includes("needs.agent.outputs.candidate_id"));
        assert.ok(!JSON.stringify(job).includes("needs.detection.outputs.scan_id"));
    }
    const detection = source["safe-outputs"]["threat-detection"];
    assert.ok(detection.steps.find(step => step.id === "candidate_input").with.script.includes("findBuildArtifact"));
    assert.ok(detection.steps.find(step => step.id === "stage_patch").with.script.includes("stageBuildDetection"));
    assert.match(detection.prompt, /entire implementation-full-patch/);
});

test("all actions are pinned and CI compiles this workflow and executes the real sandbox smoke test", () => {
    for (const workflow of [compiled, ci]) {
        for (const job of Object.values(workflow.jobs)) {
            for (const step of job.steps ?? []) if (step.uses && !step.uses.startsWith("./")) assert.match(step.uses, /@[a-f0-9]{40}$/);
        }
    }
    assert.ok(ci.jobs.compile.steps.find(step => step.name === "Validate and compile agent workflows").run.includes("issue-implementation --strict"));
    assert.ok(ci.jobs["implementation-sandbox"].steps.at(-1).run.includes("implementation-sandbox.integration.test.mjs"));
    assert.equal(ci.jobs["implementation-sandbox"].steps.at(-1).env.TYPECHAT_SANDBOX_SMOKE, "true");
});

test("every authored inline script is valid and the post-agent hook reads data rather than executing the candidate", async () => {
    for (const job of Object.values(source.jobs)) {
        for (const step of job.steps ?? []) {
            if (step.with?.script) new Function(`return async function () { ${step.with.script}\n };`)();
        }
    }
    const script = source["post-steps"][0].run;
    let read = false;
    const fakeFs = { lstatSync: () => ({ isFile: () => true, isSymbolicLink: () => false, size: 2 }),
        readFileSync: filename => { assert.equal(filename, "implementation-candidate.json"); read = true; return "{}"; } };
    runInNewContext(script, { require: name => { assert.equal(name, "node:fs"); return fakeFs; } });
    assert.equal(read, true);
    for (const file of [{ isFile: () => false }, { isFile: () => true, isSymbolicLink: () => true },
        { isFile: () => true, isSymbolicLink: () => false, size: 65537 }]) {
        assert.throws(() => runInNewContext(script, { require: () => ({ ...fakeFs, lstatSync: () => file }) }));
    }
});
