// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { STATUS_WORKFLOW, CONTROL_PATHS } from "../discussion-draft.mjs";

const directory = new URL("../../.github/workflows/", import.meta.url);
const workflow = parse(fs.readFileSync(new URL("discussion-status.yml", directory), "utf8"));
const sourceText = fs.readFileSync(new URL("discussion-draft.md", directory), "utf8");
const source = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(sourceText)[1]);
const compiled = parse(fs.readFileSync(new URL("discussion-draft.lock.yml", directory), "utf8"));

test("completion receipts wait for the full source outcome and have no inference permission", () => {
    assert.deepEqual(workflow.on, {
        workflow_run: { workflows: ["TypeChat discussion response"], types: ["completed"] },
    });
    assert.deepEqual(workflow.on.workflow_run.workflows, [source.name]);
    assert.equal(compiled.name, source.name);
    assert.deepEqual(workflow.permissions, {});
    assert.deepEqual(Object.keys(workflow.jobs), ["issue_status", "discussion_status"]);
    for (const kind of ["issue", "discussion"]) {
        const job = workflow.jobs[`${kind}_status`];
        assert.deepEqual(job.permissions, {
            contents: "read", actions: "read", "pull-requests": "read",
            [kind === "issue" ? "issues" : "discussions"]: "write",
        });
        assert.equal(job.env.TYPECHAT_STATUS_KIND, kind);
        assert.equal(job["timeout-minutes"], 15);
    }
    assert.ok(CONTROL_PATHS.includes(STATUS_WORKFLOW));
    assert.equal(source.on.reaction, "eyes");
    assert.equal(source.on["status-comment"], false, "Do not add another start comment");
});

test("the source title binds trusted event identifiers rather than user-supplied prose", () => {
    assert.equal(source["run-name"],
        "TypeChat response: ${{ github.event_name }} #${{ github.event.issue.number || github.event.discussion.number }} / comment ${{ github.event.comment.id }}");
    assert.equal(compiled["run-name"], source["run-name"]);
    assert.ok(!source["run-name"].includes("comment.body"));
    assert.ok(!source["run-name"].includes("issue.title"));
});

test("completion reporting does not weaken the successful native-completion seal guard", () => {
    const seal = source.jobs.seal.steps.find(step => step.id === "seal");
    const generated = compiled.jobs.seal.steps.find(step => step.id === "seal");
    assert.deepEqual(seal.env, { TYPECHAT_AGENT_OUTPUT_TYPES: "${{ needs.agent.outputs.output_types }}" });
    assert.equal(generated.with.script, seal.with.script);
    assert.ok(seal.with.script.indexOf('TYPECHAT_AGENT_OUTPUT_TYPES !== "noop"') <
        seal.with.script.indexOf("helper.sealDraft("));
    assert.ok(seal.with.script.includes('TYPECHAT_AGENT_OUTPUT_TYPES !== "noop"'));
});

test("owner completion jobs and their queue exclude other actors, triggers, and branches", () => {
    for (const kind of ["issue", "discussion"]) {
        const job = workflow.jobs[`${kind}_status`];
        const github = {
            repository: "microsoft/TypeChat", repository_id: 655948482, run_id: 300,
            run_attempt: 1, triggering_actor: "github-actions[bot]",
            event: { repository: { default_branch: "main" }, workflow_run: {
                actor: { type: "User", id: 25374553 }, event: `${kind}_comment`,
                head_branch: "main", display_title: `TypeChat response: ${kind}_comment #75 / comment 42`,
            } },
        };
        const allowed = new Function("github", `return (${job.if});`);
        assert.equal(allowed(github), true);
        const queue = new Function("github", "startsWith", "format",
            `return (${workflow.concurrency.group.trim().slice(3, -2)});`);
        const group = value => queue(value, (text, prefix) => text.startsWith(prefix),
            (text, ...values) => text.replace(/\{([0-9]+)\}/g, (_, index) => String(values[Number(index)])));
        const expected = group(github);
        assert.ok(expected.includes(github.event.workflow_run.display_title));
        for (const change of [
            value => { value.repository = "other/repository"; },
            value => { value.event.workflow_run.actor.id = 7; },
            value => { value.event.workflow_run.actor.type = "Bot"; },
            value => { value.event.workflow_run.event = "pull_request"; },
            value => { value.event.workflow_run.head_branch = "feature"; },
        ]) {
            const altered = structuredClone(github);
            change(altered);
            assert.equal(allowed(altered), false);
            assert.notEqual(group(altered), expected, "Ignored events cannot replace an owner's queued receipt");
        }
        assert.equal(allowed({ ...github, run_attempt: 2, triggering_actor: "other-user" }), false);
        assert.notEqual(group({ ...github, run_attempt: 2, triggering_actor: "other-user" }), expected);
        assert.equal(allowed({ ...github, run_attempt: 2, triggering_actor: "robgruen" }), true);
        assert.equal(group({ ...github, run_id: 301 }), expected, "Run IDs do not change the command's queue");
    }
    assert.equal(workflow.concurrency["cancel-in-progress"], false);
});

test("receipt publication authenticates before download and reserves a durable intent before writes", () => {
    const steps = workflow.jobs.issue_status.steps;
    const identify = steps.findIndex(step => step.id === "identify");
    const download = steps.findIndex(step => step.uses?.startsWith("actions/download-artifact@"));
    const check = steps.findIndex(step => step.id === "check");
    const intent = steps.findIndex(step => step.id === "intent");
    const publish = steps.findIndex(step => step.id === "publish");
    assert.ok(identify >= 0 && identify < download && download < check && check < intent && intent < publish);
    assert.equal(steps[download].with["run-id"], "${{ steps.identify.outputs.source_run_id }}");
    assert.equal(steps[download].with["artifact-ids"], "${{ steps.identify.outputs.artifact_id }}");
    assert.equal(steps[intent].with["retention-days"], 30);
    for (const index of [intent, publish]) {
        assert.equal(steps[index].if, "success() && steps.check.outputs.should_write == 'true'");
    }
    assert.equal(steps[publish].env.TYPECHAT_STATUS_INTENT_ID, "${{ steps.intent.outputs.artifact-id }}");
    for (const step of steps) {
        if (step.uses) assert.match(step.uses, /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/);
        if (step.uses?.startsWith("actions/checkout@")) {
            assert.equal(step.with.ref, "${{ github.sha }}");
            assert.equal(step.with["persist-credentials"], false);
        }
        if (step.uses?.startsWith("actions/github-script@")) {
            assert.equal(step.with.retries, 0);
            assert.equal(step.with["github-token"], "${{ github.token }}");
        }
        if (step.uses?.startsWith("actions/upload-artifact@")) {
            assert.equal(step.with.overwrite, false);
            assert.equal(step.with["if-no-files-found"], "error");
        }
    }
    assert.ok(steps[publish].with.script.includes('result.outcome === "unavailable"'));
    assert.ok(steps[publish].with.script.includes("core.setFailed("));
});
