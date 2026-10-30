// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

const directory = new URL("../../.github/workflows/", import.meta.url);
function markdown(name) {
    const text = fs.readFileSync(new URL(name, directory), "utf8");
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    assert.ok(header);
    return parse(header[1]);
}
const source = markdown("discussion-draft.md");
const shared = markdown("shared/read-only-analysis.md");
const compiled = parse(fs.readFileSync(new URL("discussion-draft.lock.yml", directory), "utf8"));
const publisher = parse(fs.readFileSync(new URL("publish-discussion-draft.yml", directory), "utf8"));
const checks = parse(fs.readFileSync(new URL("agent-workflow-check.yml", directory), "utf8"));
const agent = compiled.jobs.agent;
const agentCommand = agent.steps.find(step => step.name === "Execute GitHub Copilot CLI");
const detectionCommand = compiled.jobs.detection.steps.find(step => step.name === "Execute threat detection with AWF");
const sourceSeal = source.jobs.seal.steps;
const publishSteps = publisher.jobs.publish_issue.steps;

test("discussion commands are created-comment events guarded by owner and trusted branch", () => {
    const triggers = { issue_comment: { types: ["created"] }, discussion_comment: { types: ["created"] } };
    assert.deepEqual(compiled.on, triggers);
    assert.deepEqual(publisher.on, triggers);
    assert.deepEqual(source.on.roles, ["admin", "maintain", "write"]);
    assert.equal(source.on["github-token"], "${{ secrets.GITHUB_TOKEN }}");
    const conditions = [source.if, source.jobs.prepare.if, ...Object.values(publisher.jobs).map(job => job.if)];
    for (const condition of conditions) {
        for (const guard of [
            "github.repository == 'microsoft/TypeChat'",
            "github.event.sender.type == 'User'",
            "github.event.sender.id == 25374553",
            "github.event.comment.user.id == 25374553",
            "github.triggering_actor == 'robgruen'",
            "github.ref == format('refs/heads/{0}', github.event.repository.default_branch)",
        ]) {
            assert.ok(condition.includes(guard), `Missing owner/branch guard: ${guard}`);
        }
    }
    assert.ok(source.if.includes("!github.event.issue.pull_request"));
    assert.ok(source.if.includes("startsWith(github.event.comment.body, '/typechat draft')"));
    assert.ok(compiled.jobs.activation.if.includes(source.if));
    assert.ok(publisher.jobs.publish_issue.if.includes("!github.event.issue.pull_request"));
    assert.ok(publisher.jobs.publish_issue.if.includes("github.event_name == 'issue_comment'"));
    assert.ok(publisher.jobs.publish_discussion.if.includes("github.event_name == 'discussion_comment'"));
    for (const job of Object.values(publisher.jobs)) {
        assert.ok(job.if.includes("startsWith(github.event.comment.body, '/typechat publish ')"));
    }
});

test("drafting reuses the proven tools and model without enabling the future build budget", () => {
    assert.deepEqual(source.imports, ["shared/read-only-analysis.md"]);
    for (const key of Object.keys(shared)) {
        assert.equal(Object.hasOwn(source, key), false, `Do not override shared ${key} controls`);
    }
    assert.equal(shared.engine.model, "gpt-6.1-sol");
    assert.equal(source["max-ai-credits"], 50);
    assert.equal(source["max-turns"], 1000);
    assert.equal(source["timeout-minutes"], 60);
    assert.equal(agent["timeout-minutes"], 100);
    assert.equal(agentCommand["timeout-minutes"], 60);
    assert.match(agentCommand.run, /^\s*GH_AW_MAX_AI_CREDITS="50"$/m);
    assert.equal(agentCommand.env.GH_AW_MAX_TURNS, 1000);
    assert.equal(agentCommand.env.GH_AW_TIMEOUT_MINUTES, 60);
    const maxRuns = /\\"maxRuns\\":(\d+)(?=,|\})/.exec(agentCommand.run);
    assert.ok(maxRuns);
    assert.equal(Number(maxRuns[1]), 1000);
    assert.match(agentCommand.run, /--reasoning-effort max(?:\s|$)/);
    const filter = shared.engine.args.find(value => value.startsWith("--available-tools="));
    assert.ok(filter);
    assert.equal(filter.slice("--available-tools=".length).split(",").length, 16);
    assert.ok(agentCommand.run.includes(filter));
    assert.ok(!detectionCommand.run.includes("--available-tools="));
    assert.ok(!detectionCommand.run.includes("--reasoning-effort"));
    assert.equal(detectionCommand.env.GH_AW_MAX_AI_CREDITS, "${{ vars.GH_AW_DEFAULT_DETECTION_MAX_AI_CREDITS || '400' }}");
    assert.equal(agentCommand.env.COPILOT_MODEL, "gpt-6.1-sol");
    assert.equal(detectionCommand.env.COPILOT_MODEL, "gpt-6.1-sol");
    const info = compiled.jobs.activation.steps.find(step => step.name === "Generate agentic run info");
    assert.equal(info.env.GH_AW_INFO_MAX_AI_CREDITS, "50");
    assert.equal(source.checkout, false);
    assert.ok(!agent.steps.some(step => step.uses?.startsWith("actions/checkout@")));
});

test("only the main agent and detector can infer, and no drafting job can publish", () => {
    assert.deepEqual(compiled.permissions, {});
    for (const [name, job] of Object.entries(compiled.jobs)) {
        const permissions = job.permissions ?? compiled.permissions;
        assert.equal(typeof permissions, "object", `${name} must inherit no permissions or declare them explicitly`);
        for (const [scope, level] of Object.entries(permissions)) {
            if (scope === "copilot-requests") {
                assert.ok(["agent", "detection"].includes(name));
                assert.equal(level, "write");
            } else {
                assert.ok(["read", "none"].includes(level), `${name} has an unexpected ${scope}: ${level}`);
            }
        }
    }
    assert.deepEqual(publisher.permissions, {});
    assert.deepEqual(Object.keys(publisher.jobs).sort(), ["publish_discussion", "publish_issue"]);
    for (const [kind, scope] of [["issue", "issues"], ["discussion", "discussions"]]) {
        const job = publisher.jobs[`publish_${kind}`];
        assert.deepEqual(job.permissions, {
            contents: "read", actions: "read", "pull-requests": "read", [scope]: "write",
        });
        assert.equal(job.env.TYPECHAT_PUBLISH_KIND, kind);
    }
});

test("trusted preparation gates the model and successful detection gates sealing", () => {
    assert.ok([compiled.jobs.prepare.needs].flat().includes("activation"));
    assert.ok(agent.needs.includes("prepare"));
    assert.ok(compiled.jobs.prepare.if.includes(source.if));
    for (const dependency of ["prepare", "agent", "detection"]) {
        assert.ok(compiled.jobs.seal.needs.includes(dependency));
    }
    assert.ok(compiled.jobs.seal.if.includes("needs.agent.result == 'success'"));
    assert.ok(compiled.jobs.seal.if.includes("needs.detection.result == 'success'"));
    assert.ok(compiled.jobs.seal.if.includes("needs.detection.outputs.detection_success == 'true'"));
    const contextId = "${{ needs.prepare.outputs.context_artifact_id }}";
    const modelDownload = agent.steps.find(step => step.name === "Download frozen discussion context");
    const trustedDownload = sourceSeal.find(step => step.name === "Download original context");
    assert.equal(modelDownload.with["artifact-ids"], contextId);
    assert.equal(trustedDownload.with["artifact-ids"], contextId);
    assert.equal(source.jobs.prepare.outputs.context_artifact_id, "${{ steps.context_artifact.outputs.artifact-id }}");
    assert.ok(trustedDownload.with.path.startsWith("${{ runner.temp }}/"));
    assert.equal(sourceSeal.find(step => step.name === "Download candidate").with.name,
        "typechat-discussion-candidate-${{ github.run_attempt }}");
    const sealedUpload = sourceSeal.find(step => step.id === "review_artifact");
    assert.equal(sealedUpload.with.name, "typechat-discussion-draft-${{ github.run_attempt }}");
    assert.equal(sealedUpload.with.path, "${{ steps.seal.outputs.path }}");
    assert.equal(sealedUpload.with["retention-days"], 7);
    assert.ok(sourceSeal.indexOf(sealedUpload) < sourceSeal.findIndex(step => step.name === "Show the exact preview and approval command"));
});

test("publication authenticates provenance before download and reserves intent before its only write", () => {
    const identify = publishSteps.findIndex(step => step.id === "identify");
    const download = publishSteps.findIndex(step => step.name === "Download the approved sealed draft");
    const check = publishSteps.findIndex(step => step.id === "check");
    const intent = publishSteps.findIndex(step => step.id === "intent_artifact");
    const publish = publishSteps.findIndex(step => step.id === "publish");
    assert.ok(identify >= 0 && identify < download && download < check && check < intent && intent < publish);
    assert.equal(publishSteps[download].with["artifact-ids"], "${{ steps.identify.outputs.artifact_id }}");
    assert.equal(publishSteps[download].with["run-id"], "${{ steps.identify.outputs.run_id }}");
    assert.ok(publishSteps[download].with.path.startsWith("${{ runner.temp }}/"));
    assert.equal(publishSteps[intent].with["retention-days"], 30);
    assert.equal(publishSteps[publish].env.TYPECHAT_INTENT_ARTIFACT_ID, "${{ steps.intent_artifact.outputs.artifact-id }}");
    assert.equal(publishSteps[publish].with.retries, 0);
    for (const index of [intent, publish]) {
        assert.equal(publishSteps[index].if, "success() && steps.check.outputs.should_post == 'true'");
    }
    assert.ok(publishSteps[publish].with.script.includes("await helper.publishDraft("));
    assert.ok(publishSteps[publish].with.script.includes("process.env.TYPECHAT_INTENT_ARTIFACT_ID"));
    assert.equal(publishSteps.filter(step => step.with?.script?.includes("await helper.publishDraft(")).length, 1);
});

test("only owner commands share the per-thread drafting and publishing queue", () => {
    const groups = [compiled, publisher].map(workflow => {
        assert.equal(workflow.concurrency["cancel-in-progress"], false);
        const group = workflow.concurrency.group;
        for (const guard of ["github.event.sender.type == 'User'", "github.event.sender.id == 25374553",
            "github.event.comment.user.id == 25374553", "github.triggering_actor == 'robgruen'"]) {
            assert.ok(group.includes(guard));
        }
        assert.ok(group.includes("github.run_id"), "Ignored events need their own group");
        const key = /format\('typechat-discussion-[^)]*\)/.exec(group);
        assert.ok(key);
        assert.ok(key[0].includes("github.repository_id"));
        assert.ok(key[0].includes("github.event_name"));
        assert.ok(key[0].includes("github.event.issue.number || github.event.discussion.number"));
        return key[0];
    });
    assert.equal(groups[0], groups[1]);
});

test("trusted scripts, actions, checkouts, and artifact uploads retain their safety settings", () => {
    for (const workflow of [compiled, publisher]) {
        for (const job of Object.values(workflow.jobs)) {
            for (const step of job.steps ?? []) {
                if (step.uses) assert.match(step.uses, /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/);
                if (step.uses?.startsWith("actions/checkout@")) {
                    assert.ok([undefined, "${{ github.sha }}"].includes(step.with.ref),
                        "Compiler-owned checkouts may use the guarded event SHA default");
                    assert.equal(step.with.repository, undefined);
                    assert.equal(step.with["persist-credentials"], false);
                }
                for (const step of [...source.jobs.prepare.steps, ...sourceSeal, ...publishSteps]) {
                    if (step.uses?.startsWith("actions/checkout@")) {
                        assert.equal(step.with.ref, "${{ github.sha }}");
                        assert.equal(step.with["persist-credentials"], false);
                    }
                }
                if (step.uses?.startsWith("actions/github-script@") && step.with?.script?.includes("discussion-draft.mjs")) {
                    assert.equal(step.with.retries, 0);
                    assert.equal(step.with["github-token"], "${{ github.token }}");
                    assert.ok(!step.with.script.includes("${{"), "Do not interpolate event data into executable JavaScript");
                }
            }
        }
    }
    const uploads = [...source.jobs.prepare.steps, ...sourceSeal, ...source["post-steps"], ...publishSteps]
        .filter(step => step.uses?.startsWith("actions/upload-artifact@"));
    for (const step of uploads) {
        assert.equal(step.with["if-no-files-found"], "error");
        assert.equal(step.with.overwrite, false);
    }
});

test("the candidate-file validator enforces the exact 64-KiB bound and safe JSON errors", () => {
    const validator = source["post-steps"].find(step => step.name === "Verify candidate draft file");
    const working = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-candidate-validator-"));
    const file = path.join(working, "discussion-draft.json");
    try {
        function check(contents) {
            if (contents !== undefined) fs.writeFileSync(file, contents);
            return spawnSync(process.execPath, ["--eval", validator.run], { cwd: working, encoding: "utf8" });
        }
        assert.notEqual(check().status, 0);
        assert.notEqual(check("").status, 0);
        assert.equal(check(JSON.stringify("a".repeat(65534))).status, 0);
        assert.notEqual(check(JSON.stringify("a".repeat(65535))).status, 0);
        const malformed = check('{"untrusted-value":broken}');
        assert.notEqual(malformed.status, 0);
        assert.ok(malformed.stderr.includes("not valid JSON"));
        assert.ok(!malformed.stderr.includes("untrusted-value"));
    }
    finally {
        fs.rmSync(working, { recursive: true });
    }
});

test("CI covers helper changes and compiles both workflows with the pinned runtime", () => {
    for (const event of ["push", "pull_request"]) {
        assert.ok(checks.on[event].paths.includes("tools/**"));
        assert.ok(checks.on[event].paths.includes(".github/workflows/**"));
    }
    const compile = checks.jobs.compile.steps.find(step => step.name === "Validate and compile agent workflows");
    assert.match(compile.run, /gh aw compile backlog-assessment discussion-draft --strict --no-check-update --no-logo/);
    assert.match(compile.run, /--action-tag 32ecafbc061c9af57e9361942099e381102ae304/);
});
