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
const scan = source["safe-outputs"]["threat-detection"];
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

test("draft requests use the native eyes acknowledgment without public status comments", () => {
    assert.equal(source.on.reaction, "eyes");
    assert.equal(source.on["status-comment"], false);
    assert.equal(source.on["github-token"], "${{ secrets.GITHUB_TOKEN }}");
    const activation = compiled.jobs.activation;
    const reaction = activation.steps.find(step => step.name === "Add eyes reaction for immediate feedback");
    assert.ok(reaction);
    assert.equal(reaction.env.GH_AW_REACTION, "eyes");
    assert.equal(reaction.with["github-token"], "${{ secrets.GITHUB_TOKEN }}");
    assert.match(reaction.with.script, /require\(path\.join\(actionsDir, 'add_reaction\.cjs'\)\)/);
    for (const event of ["issue_comment", "discussion_comment"]) {
        assert.ok(reaction.if.includes(`github.event_name == '${event}'`));
    }
    assert.ok(activation.if.includes(source.if));
    assert.ok(!activation.steps.some(step => /status.*comment/i.test(step.name ?? "")));
    assert.deepEqual(activation.permissions, {
        actions: "read", contents: "read", discussions: "write", issues: "write", "pull-requests": "write",
    });
    assert.ok(activation.if.includes("!github.event.issue.pull_request"));
    assert.equal(compiled.on.pull_request, undefined);
});

test("drafting reuses the proven tools and model without enabling the future build budget", () => {
    assert.deepEqual(source.imports, ["shared/read-only-analysis.md"]);
    for (const key of Object.keys(shared)) {
        if (key === "safe-outputs") {
            assert.deepEqual(Object.keys(source[key]), ["report-missing-tool", "threat-detection"]);
            assert.equal(source[key]["report-missing-tool"], shared[key]["report-missing-tool"]);
        } else {
            assert.equal(Object.hasOwn(source, key), false, `Do not override shared ${key} controls`);
        }
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

test("only the main agent and detector can infer, and reaction writes stay in trusted activation", () => {
    assert.deepEqual(compiled.permissions, {});
    for (const [name, job] of Object.entries(compiled.jobs)) {
        const permissions = job.permissions ?? compiled.permissions;
        assert.equal(typeof permissions, "object", `${name} must inherit no permissions or declare them explicitly`);
        for (const [scope, level] of Object.entries(permissions)) {
            if (name === "activation" && ["issues", "discussions", "pull-requests"].includes(scope)) {
                assert.equal(level, "write");
            } else if (scope === "copilot-requests") {
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

test("file-only candidates are explicit inputs to the pinned detector", () => {
    const detection = compiled.jobs.detection;
    const download = detection.steps.findIndex(step => step.name === "Download candidate for detection");
    const stage = detection.steps.findIndex(step => step.id === "stage_candidate");
    const setup = detection.steps.findIndex(step => step.id === "detection_setup");
    const execute = detection.steps.findIndex(step => step.id === "detection_agentic_execution");
    const record = detection.steps.findIndex(step => step.id === "candidate_scan");
    const upload = detection.steps.findIndex(step => step.name === "Upload candidate scan binding");
    const conclude = detection.steps.findIndex(step => step.id === "detection_conclusion");
    assert.ok(download >= 0 && download < stage && stage < setup && setup < execute &&
        execute < record && record < upload && upload < conclude);
    const candidateName = "typechat-discussion-candidate-${{ github.run_attempt }}";
    assert.equal(detection.steps[download].with.name, candidateName);
    assert.equal(sourceSeal.find(step => step.name === "Download candidate").with.name, candidateName);
    assert.equal(source["post-steps"].find(step => step.name === "Upload candidate draft").with.name, candidateName);
    assert.equal(detection.steps[stage].env.TYPECHAT_DETECTION_DIRECTORY, "/tmp/gh-aw/threat-detection");
    assert.equal(detection.steps[record].env.TYPECHAT_CANDIDATE_SHA256, "${{ steps.stage_candidate.outputs.sha256 }}");
    assert.equal(detection.steps[record].env.TYPECHAT_SCAN_OUTCOME, "${{ steps.detection_agentic_execution.outcome }}");
    assert.ok(detection.steps[record].if.includes("steps.detection_agentic_execution.outcome == 'success'"));
    assert.ok(detection.steps[record].if.includes("steps.stage_candidate.outcome == 'success'"));
    assert.equal(detection.steps[upload].with.name, "typechat-discussion-scan-${{ github.run_attempt }}");
    assert.equal(sourceSeal.find(step => step.name === "Download candidate scan binding").with.name,
        detection.steps[upload].with.name);
    assert.equal(scan["continue-on-error"], false);
    assert.equal(scan["report-as-issue"], false);
    assert.equal(detectionCommand.env.GH_AW_DETECTION_CONTINUE_ON_ERROR, "false");
});

test("draft preparation must not pre-complete the model with a native noop", () => {
    assert.equal(source["pre-agent-steps"], undefined);
    assert.ok(!agent.steps.some(step => step.id === "require_candidate_detection"));
    const collector = agent.steps.find(step => step.id === "collect_output");
    assert.ok(agent.steps.indexOf(agentCommand) < agent.steps.indexOf(collector));
    const handler = compiled.jobs.safe_outputs.steps.find(step => step.id === "process_safe_outputs");
    const config = JSON.parse(handler.env.GH_AW_SAFE_OUTPUTS_HANDLER_CONFIG);
    assert.deepEqual(config.noop, { max: 2, "report-as-issue": "false" });
    assert.ok(Object.hasOwn(config, "report_incomplete"));
    const text = fs.readFileSync(new URL("discussion-draft.md", directory), "utf8");
    assert.ok(text.includes("After writing `discussion-draft.json`, call `safeoutputs-noop`"));
});

test("the compiled detection guard accepts collected outputs but never treats a missing signal as success", () => {
    const working = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-detection-guard-"));
    try {
        const githubOutput = path.join(working, "github-output");
        const guard = compiled.jobs.detection.steps.find(step => step.id === "detection_guard");
        assert.equal(guard.env.OUTPUT_TYPES, "${{ needs.agent.outputs.output_types }}");
        assert.equal(agent.outputs.output_types, "${{ steps.collect_output.outputs.output_types }}");
        let bash = "bash";
        if (process.platform === "win32") {
            const git = spawnSync("git", ["--exec-path"], { encoding: "utf8" });
            assert.equal(git.status, 0, git.error?.message ?? git.stderr);
            bash = path.resolve(git.stdout.trim(), "..", "..", "..", "bin", "bash.exe");
        }
        for (const outputTypes of ["noop", "report_incomplete", ""]) {
            fs.writeFileSync(githubOutput, "");
            const result = spawnSync(bash, ["--noprofile", "--norc", "-c", guard.run], {
                cwd: working, encoding: "utf8",
                env: {
                    ...process.env, OUTPUT_TYPES: outputTypes, HAS_PATCH: "false",
                    GITHUB_OUTPUT: githubOutput.replaceAll("\\", "/"),
                },
            });
            assert.equal(result.status, 0, result.error?.message ?? result.stderr);
            assert.equal(fs.readFileSync(githubOutput, "utf8").trim(), `run_detection=${outputTypes !== ""}`);
        }
    }
    finally {
        fs.rmSync(working, { recursive: true });
    }
});

test("sealing requires an executed successful scan, not just a successful detection job", () => {
    const condition = compiled.jobs.seal.if.replace(/^\$\{\{\s*|\s*\}\}$/g, "");
    const canSeal = new Function("needs", `return (${condition});`);
    const needs = {
        agent: { result: "success" },
        detection: {
            result: "success",
            outputs: { run_detection: "true", detection_success: "true", detection_conclusion: "success" },
        },
    };
    assert.equal(canSeal(needs), true);
    for (const [field, values] of Object.entries({
        run_detection: ["false", ""],
        detection_success: ["false", ""],
        detection_conclusion: ["skipped", "warning", "failure", ""],
    })) {
        for (const value of values) {
            const changed = structuredClone(needs);
            changed.detection.outputs[field] = value;
            assert.equal(canSeal(changed), false, `${field}=${value} must not seal a draft`);
        }
    }
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
                for (const step of [...source.jobs.prepare.steps, ...sourceSeal, ...scan.steps, ...scan["post-steps"], ...publishSteps]) {
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
    const uploads = [...source.jobs.prepare.steps, ...sourceSeal, ...source["post-steps"], ...scan["post-steps"], ...publishSteps]
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
