// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

const workflowDirectory = new URL("../../.github/workflows/", import.meta.url);
const markdown = fs.readFileSync(new URL("backlog-assessment.md", workflowDirectory), "utf8");
const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
assert.ok(frontmatter, "The assessment must have YAML frontmatter");
const source = parse(frontmatter[1]);
const compiled = parse(fs.readFileSync(new URL("backlog-assessment.lock.yml", workflowDirectory), "utf8"));
const checks = parse(fs.readFileSync(new URL("agent-workflow-check.yml", workflowDirectory), "utf8"));
const steps = Object.values(compiled.jobs).flatMap(job => job.steps ?? []);
const defaultToken = "${{ secrets.GITHUB_TOKEN }}";

function checkPermissions(workflow) {
    assert.deepEqual(workflow.permissions, {}, "Unspecified job permissions must default to none");
    for (const [name, job] of Object.entries(workflow.jobs)) {
        const permissions = job.permissions ?? workflow.permissions;
        assert.equal(typeof permissions, "object", `${name} must use explicit permission scopes`);
        assert.ok(permissions !== null && !Array.isArray(permissions));
        for (const [scope, level] of Object.entries(permissions)) {
            if (scope === "copilot-requests") {
                assert.ok(["agent", "detection"].includes(name), `${name} must not request inference access`);
                assert.equal(level, "write");
            }
            else {
                assert.ok(["read", "none"].includes(level), `${name} grants ${scope}: ${level}`);
            }
        }
    }
}

test("assessment is manual and restricted to a user on the default branch", () => {
    assert.deepEqual(Object.keys(compiled.on), ["workflow_dispatch"]);
    assert.deepEqual(Object.keys(source.on).sort(), ["github-token", "roles", "workflow_dispatch"]);
    assert.deepEqual(source.on.roles, ["admin", "maintain", "write"]);
    assert.equal(source.if, "github.event.sender.type == 'User' && github.ref == format('refs/heads/{0}', github.event.repository.default_branch)");
    assert.ok(compiled.jobs.activation.if.includes(source.if));
});

test("assessment pins its model and max effort without overriding detection effort", () => {
    assert.deepEqual(source.engine, {
        id: "copilot",
        model: "gpt-6.1-sol",
        args: ["--reasoning-effort", "max"],
    });
    const info = compiled.jobs.activation.steps.find(step => step.name === "Generate agentic run info");
    assert.ok(info);
    assert.equal(info.env.GH_AW_INFO_MODEL, "gpt-6.1-sol");

    const agent = compiled.jobs.agent.steps.find(step => step.name === "Execute GitHub Copilot CLI");
    const detection = compiled.jobs.detection.steps.find(step => step.name === "Execute threat detection with AWF");
    for (const step of [agent, detection]) {
        assert.ok(step);
        assert.equal(step.env.COPILOT_MODEL, "gpt-6.1-sol");
        assert.equal(step.env.GH_AW_MODEL_FALLBACK, undefined);
        assert.equal(step.env.GH_AW_MODEL_ROUTING, undefined);
    }
    assert.match(agent.run, /--reasoning-effort max(?:\s|$)/);
    assert.doesNotMatch(detection.run, /--(?:reasoning-)?effort(?:\s|=)/);
});

test("all generated jobs deny repository writes, including reporting helpers", () => {
    checkPermissions(compiled);
});

test("permission checks reject escalation in every generated job", () => {
    for (const name of Object.keys(compiled.jobs)) {
        for (const scope of ["contents", "issues", "pull-requests", "actions", "id-token"]) {
            const escalated = structuredClone(compiled);
            escalated.jobs[name].permissions = { ...escalated.jobs[name].permissions, [scope]: "write" };
            assert.throws(() => checkPermissions(escalated), undefined, `${name}: ${scope}`);
        }
    }
    assert.throws(() => checkPermissions({ ...compiled, permissions: "write-all" }));
});

test("agent has only scoped GitHub readers and local report editing", () => {
    assert.equal(source.checkout, false);
    assert.deepEqual(source.tools.bash, []);
    assert.equal(source.tools["cli-proxy"], false);
    assert.ok(Object.hasOwn(source.tools, "edit"));
    assert.deepEqual(Object.keys(source.tools).sort(), ["bash", "cli-proxy", "edit", "github"]);
    assert.equal(source.tools.github.mode, "local");
    assert.deepEqual(source.tools.github["allowed-repos"], ["${{ github.repository }}"]);
    assert.equal(source.tools.github["min-integrity"], "none");
    assert.deepEqual(source.tools.github.allowed.toSorted(), [
        "get_discussion",
        "get_discussion_comments",
        "get_file_contents",
        "issue_read",
        "list_issues",
        "list_pull_requests",
        "pull_request_read",
    ]);
    assert.equal(source.tools.github["github-token"], defaultToken);
    assert.equal(source.on["github-token"], defaultToken);
    assert.equal(source["safe-outputs"]["github-token"], defaultToken);
});

test("automatic issue creation and all reporting fallbacks are disabled", () => {
    assert.deepEqual(source["safe-outputs"], {
        "github-token": defaultToken,
        "runs-on": "ubuntu-latest",
        "create-issue": false,
        "report-failure-as-issue": false,
        "report-failed-jobs": false,
        "report-missing-tool": false,
        "report-missing-data": { "create-issue": false },
        "report-incomplete": { "create-issue": false },
    });
    for (const step of steps) {
        const incompleteIssue = step.env?.GH_AW_REPORT_INCOMPLETE_CREATE_ISSUE;
        if (incompleteIssue !== undefined) {
            assert.equal(incompleteIssue, "false");
        }
        const token = step.with?.["github-token"];
        if (token !== undefined) {
            assert.ok([defaultToken, "${{ github.token }}"].includes(token), `Unexpected token in ${step.name}`);
        }
    }
});

test("every remote action and reusable workflow is pinned to a full commit", () => {
    for (const workflow of [compiled, checks]) {
        for (const job of Object.values(workflow.jobs)) {
            for (const entry of [job, ...(job.steps ?? [])]) {
                if (entry.uses) {
                    assert.match(entry.uses, /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/, entry.uses);
                }
            }
        }
    }
});

test("generated helper jobs respect the slim runner time limit", () => {
    for (const [name, job] of Object.entries(compiled.jobs)) {
        if (job["runs-on"] === "ubuntu-slim" && typeof job["timeout-minutes"] === "number") {
            assert.ok(job["timeout-minutes"] <= 15, `${name} exceeds the slim runner's 15-minute limit`);
        }
    }
});

test("the run and its report have explicit bounds and no missing-file success", () => {
    assert.equal(source["timeout-minutes"], 20);
    assert.equal(source["max-turns"], 120);
    assert.equal(source["max-ai-credits"], 200);
    assert.deepEqual(source.concurrency, { group: "backlog-assessment", "cancel-in-progress": false });
    const verify = compiled.jobs.agent.steps.find(step => step.name === "Verify draft report");
    const upload = compiled.jobs.agent.steps.find(step => step.name === "Upload draft report");
    assert.ok(verify);
    assert.ok(upload);
    assert.equal(verify.if, "success()");
    assert.equal(upload.if, "success()");
    assert.equal(upload.with.name, "backlog-assessment");
    assert.equal(upload.with.path, "backlog-assessment.md");
    assert.equal(upload.with["if-no-files-found"], "error");
    assert.equal(upload.with["retention-days"], "${{ vars.GH_AW_DEFAULT_ARTIFACT_RETENTION_DAYS || '7' }}");
    assert.equal(verify.shell, "node {0}");
});

for (const scenario of [
    { name: "missing file", status: 1 },
    { name: "empty file", bytes: 0, status: 1 },
    { name: "small report", bytes: 1, status: 0 },
    { name: "exactly 1 MiB", bytes: 1048576, status: 0 },
    { name: "over 1 MiB", bytes: 1048577, status: 1 },
    { name: "directory", directory: true, status: 1 },
    { name: "symbolic link", link: true, status: 1 },
]) {
    test(`report validation: ${scenario.name}`, t => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-backlog-"));
        t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
        const report = path.join(directory, "backlog-assessment.md");
        if (scenario.bytes !== undefined) {
            fs.writeFileSync(report, Buffer.alloc(scenario.bytes, "a"));
        }
        if (scenario.directory) {
            fs.mkdirSync(report);
        }
        if (scenario.link) {
            const target = path.join(directory, "target");
            fs.mkdirSync(target);
            fs.symlinkSync(target, report, "junction");
        }
        const verify = compiled.jobs.agent.steps.find(step => step.name === "Verify draft report");
        assert.ok(verify);
        const result = spawnSync(process.execPath, ["--input-type=commonjs", "--eval", verify.run], {
            cwd: directory,
            encoding: "utf8",
        });
        assert.ifError(result.error);
        assert.equal(result.status, scenario.status, result.stderr);
        if (scenario.status !== 0) {
            assert.match(result.stderr, /::error::/);
        }
    });
}
