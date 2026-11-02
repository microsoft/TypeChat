// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";
import { BUILD_LIMITS } from "../issue-implementation.mjs";

const workflows = new URL("../../.github/workflows/", import.meta.url);
const markdown = fs.readFileSync(new URL("issue-implementation.md", workflows), "utf8");
const source = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)[1]);
const compiled = parse(fs.readFileSync(new URL("issue-implementation.lock.yml", workflows), "utf8"));
const ci = parse(fs.readFileSync(new URL("agent-workflow-check.yml", workflows), "utf8"));

test("coding is inactive by default and only an owner Issue comment can activate inference", () => {
    assert.deepEqual(Object.keys(source.on.workflow_dispatch.inputs), ["issue", "acceptance"]);
    assert.equal(source.on.reaction, "none");
    assert.equal(source.on["status-comment"], false);
    assert.match(source.if, /TYPECHAT_IMPLEMENTATION_ENABLED == 'true'/);
    assert.match(source.if, /!github\.event\.issue\.pull_request/);
    assert.match(source.if, /sender\.id == 25374553/);
    assert.match(source.if, /triggering_actor == 'robgruen'/);
    assert.ok(compiled.jobs.agent.if.includes("needs.prepare.outputs.should_build == 'true'"));
    assert.equal(source.concurrency["cancel-in-progress"], false);
    assert.equal(source.concurrency["job-discriminator"], "${{ github.run_id }}");
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

test("App secrets exist only in trusted preflight and publication steps, never coding, detection, or generated checks", () => {
    assert.deepEqual(compiled.permissions, {});
    for (const [id, job] of Object.entries(compiled.jobs)) {
        const serialized = JSON.stringify(job);
        if (!["prepare", "publish"].includes(id)) assert.ok(!serialized.includes("DEPENDABOT_APP_PRIVATE_KEY"), id);
        for (const [permission, value] of Object.entries(job.permissions ?? {})) {
            assert.ok(value === "read" || permission === "copilot-requests" && ["agent", "detection"].includes(id) && value === "write",
                `${id} must not receive repository-write authority: ${permission}:${value}`);
        }
        for (const step of job.steps ?? []) {
            if (step.uses?.startsWith("actions/checkout@")) {
                assert.equal(step.with["persist-credentials"], false, `${id} must not retain Git credentials`);
            }
        }
    }
    assert.equal(source.jobs.publish.permissions["copilot-requests"], undefined);
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
