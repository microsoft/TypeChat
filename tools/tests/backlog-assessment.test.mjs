// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";

const workflowDirectory = new URL("../../.github/workflows/", import.meta.url);
const markdown = fs.readFileSync(new URL("backlog-assessment.md", workflowDirectory), "utf8");
const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
assert.ok(frontmatter, "The assessment must have YAML frontmatter");
const localSource = parse(frontmatter[1]);
const sharedMarkdown = fs.readFileSync(new URL("shared/read-only-analysis.md", workflowDirectory), "utf8");
const sharedFrontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(sharedMarkdown);
assert.ok(sharedFrontmatter);
assert.equal(sharedMarkdown.slice(sharedFrontmatter[0].length).trim(), "", "Shared controls must not change workflow prompts");
const sharedSource = parse(sharedFrontmatter[1]);
assert.deepEqual(localSource.imports, ["shared/read-only-analysis.md"]);
assert.deepEqual(Object.keys(sharedSource).toSorted(), ["engine", "graders", "safe-outputs", "tools"]);
for (const key of Object.keys(sharedSource)) {
    assert.equal(Object.hasOwn(localSource, key), false, `Do not override shared controls: ${key}`);
}
const source = { ...sharedSource, ...localSource };
const compiled = parse(fs.readFileSync(new URL("backlog-assessment.lock.yml", workflowDirectory), "utf8"));
const checks = parse(fs.readFileSync(new URL("agent-workflow-check.yml", workflowDirectory), "utf8"));
const steps = Object.values(compiled.jobs).flatMap(job => job.steps ?? []);
const defaultToken = "${{ secrets.GITHUB_TOKEN }}";
const githubReaders = [
    "get_discussion",
    "get_discussion_comments",
    "get_file_contents",
    "issue_read",
    "list_issues",
    "list_pull_requests",
    "pull_request_read",
    "search_issues",
    "search_pull_requests",
];
const availableTools = [
    "apply_patch", "glob", "rg", "view",
    ...githubReaders.map(name => `github-${name}`),
    "safeoutputs-noop", "safeoutputs-report_incomplete", "safeoutputs-report_missing_data",
];
const availableToolsArgument = `--available-tools=${availableTools.join(",")}`;

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

test("report instructions favor plain language without dropping evidence", () => {
    const style = /## Writing style\r?\n([\s\S]*?)\r?\n## Report/.exec(markdown);
    assert.ok(style, "Keep explicit writing guidance for the report");
    const guidance = style[1].replace(/\s+/g, " ");
    for (const requirement of [
        "English is not their first language",
        "short sentences and paragraphs",
        "Explain technical terms and abbreviations on first use",
        "Preserve facts, evidence links, uncertainty, and existing maintainer decisions",
    ]) {
        assert.ok(guidance.includes(requirement), `Missing writing guidance: ${requirement}`);
    }

    const report = markdown.split(/\r?\n## Report\r?\n/)[1].replace(/\s+/g, " ");
    assert.ok(report.includes("One linked subsection per discovered open issue"));
    assert.ok(report.includes("Keep contributor-reported results separate from checks actually observed"));
    assert.ok(report.includes("No proposal is accepted by this report"));
    assert.ok(!report.includes("One row per discovered open issue"));

    const prompt = compiled.jobs.activation.steps.find(step => step.name === "Create prompt with built-in context");
    assert.ok(prompt);
    assert.ok(Object.values(prompt.env).includes("{{#runtime-import .github/workflows/backlog-assessment.md}}\n"),
        "The workflow must load the report instructions at runtime");
});

test("project direction names its owner and separates consideration from approval", () => {
    const goals = fs.readFileSync(new URL("../../GOALS.md", workflowDirectory), "utf8");
    for (const heading of ["Goals", "Non-goals", "Under consideration", "Who decides", "Approval and enforcement"]) {
        assert.match(goals, new RegExp(`^## ${heading}$`, "m"));
    }
    assert.ok(goals.includes("The project direction owner is **@robgruen**"));
    const links = [...goals.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
    assert.ok(links.some(([, url]) => url === "https://github.com/microsoft/TypeChat.net"),
        "Keep a link to the existing TypeChat.NET project");
    assert.ok(goals.replace(/\s+/g, " ").includes("Under consideration is not approval to implement"));
    assert.ok(goals.replace(/\s+/g, " ").includes("Every change to this document requires explicit owner approval"));

    for (const file of ["../../README.md", "../../AUTOMATION.md", "../copilot-instructions.md"]) {
        const guidance = fs.readFileSync(new URL(file, workflowDirectory), "utf8");
        assert.match(guidance, /\]\((?:\.\/|\.\.\/)GOALS\.md(?:#[^)]+)?\)/, file);
        assert.ok(guidance.includes("@robgruen"), `${file} must name the current project owner`);
    }
});

test("assessment applies the run's direction policy before recommending work", () => {
    const section = /## Project direction\r?\n([\s\S]*?)\r?\n## Boundaries/.exec(markdown);
    assert.ok(section, "Load project direction before assessing community proposals");
    const guidance = section[1].replace(/\s+/g, " ");
    for (const requirement of [
        "Read GOALS.md at `${{ env.TYPECHAT_POLICY_COMMIT }}`",
        "primary repository policy for product scope",
        "Do not use proposed policy edits in an issue or PR as the active policy",
        "Only the human project owner named in GOALS.md",
        "For every issue and PR",
        "In scope",
        "Needs owner decision",
        "Conflicts with direction",
        "If GOALS.md cannot be read or its revision cannot be established",
        "do not recommend implementation or acceptance",
    ]) {
        assert.ok(guidance.includes(requirement), `Missing direction safeguard: ${requirement}`);
    }
    const report = markdown.split(/\r?\n## Report\r?\n/)[1].replace(/\s+/g, " ");
    assert.ok(report.includes("Include its direction classification and policy citation"));
    assert.ok(report.includes("Include each PR's direction classification and policy citation"));
});

test("policy revision is wired from the trusted run commit into the prompt", () => {
    assert.deepEqual(source.env, { TYPECHAT_POLICY_COMMIT: "${{ github.sha }}" });
    assert.equal(compiled.env.TYPECHAT_POLICY_COMMIT, "${{ github.sha }}");
    for (const name of ["Create prompt with built-in context", "Interpolate variables and render templates", "Substitute placeholders"]) {
        const step = compiled.jobs.activation.steps.find(step => step.name === name);
        assert.ok(step);
        assert.equal(step.env.GH_AW_ENV_TYPECHAT_POLICY_COMMIT, "${{ env.TYPECHAT_POLICY_COMMIT }}", name);
    }
    const substitute = compiled.jobs.activation.steps.find(step => step.name === "Substitute placeholders");
    assert.match(substitute.with.script,
        /^\s*GH_AW_ENV_TYPECHAT_POLICY_COMMIT: process\.env\.GH_AW_ENV_TYPECHAT_POLICY_COMMIT,$/m);
});

test("direction ownership protects the policy and automation controls", () => {
    const owners = fs.readFileSync(new URL("../CODEOWNERS", workflowDirectory), "utf8")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"))
        .map(line => line.split(/\s+/));
    assert.deepEqual(owners, [
        ["/GOALS.md", "@robgruen"],
        ["/AUTOMATION.md", "@robgruen"],
        ["AGENTS.md", "@robgruen"],
        ["/.github/", "@robgruen"],
        ["/tools/", "@robgruen"],
    ]);
    for (const event of ["push", "pull_request"]) {
        for (const file of ["GOALS.md", "AUTOMATION.md", "README.md", ".github/CODEOWNERS", ".github/copilot-instructions.md"]) {
            assert.ok(checks.on[event].paths.includes(file), `${event} must check changes to ${file}`);
        }
    }
});

test("assessment pins its model and max effort without overriding detection effort", () => {
    assert.deepEqual(source.engine, {
        id: "copilot",
        model: "gpt-6.1-sol",
        args: ["--reasoning-effort", "max", availableToolsArgument],
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
    assert.ok(agent.run.includes(availableToolsArgument), "The main agent must receive the exact tool-availability filter");
    assert.equal((agent.run.match(/--available-tools(?:=|\s)/g) ?? []).length, 1);
    assert.ok(!detection.run.includes(availableToolsArgument), "Do not apply the assessment's tools to threat detection");
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

test("assessment configures scoped GitHub readers and local report editing", () => {
    assert.equal(source.checkout, false);
    assert.deepEqual(source.tools.bash, []);
    assert.equal(source.tools["cli-proxy"], false);
    assert.ok(Object.hasOwn(source.tools, "edit"));
    assert.deepEqual(Object.keys(source.tools).sort(), ["bash", "cli-proxy", "edit", "github"]);
    assert.equal(source.tools.github.mode, "local");
    assert.deepEqual(source.tools.github["allowed-repos"], ["${{ github.repository }}"]);
    assert.equal(source.tools.github["min-integrity"], "none");
    assert.deepEqual(source.tools.github.allowed.toSorted(), githubReaders);
    assert.equal(source.tools.github["github-token"], defaultToken);
    assert.equal(source.on["github-token"], defaultToken);
    assert.equal(source["safe-outputs"]["github-token"], defaultToken);
});

test("policy-based access denials cannot authorize alternate retrieval", () => {
    const boundaries = /## Boundaries\r?\n([\s\S]*?)\r?\n## Assessment/.exec(markdown);
    assert.ok(boundaries);
    assert.ok(boundaries[1].replace(/\s+/g, " ").includes(
        "Do not retry through another tool, path, revision, endpoint, or credential"));
});

const nativeMetrics = ["native-tool-failure-count", "native-tool-success-rate", "native-repeated-tool-calls"];

function nativeEvent(type, id, data, session = "session-1", component = "agent") {
    return {
        type,
        provenance: { component, phase: component, path: `${session}/events.jsonl` },
        data: { toolCallId: id, ...data },
    };
}

function nativeStart(id, input = { issue_number: id }, session = "session-1") {
    return nativeEvent("tool.execution_start", id, { toolName: "github-issue_read", input }, session);
}

function nativeComplete(id, success = true, session = "session-1") {
    return nativeEvent("tool.execution_complete", id, { success }, session);
}

function runNativeMetric(session, id) {
    const input = structuredClone(session);
    function freeze(value) {
        if (value && typeof value === "object") {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
    }
    freeze(input);
    const grader = source.graders[id];
    const result = runInNewContext(`"use strict"; (() => {\n${grader.script}\n})()`, {
        session: input,
        config: grader.config,
    }, { timeout: 1000 });
    assert.deepEqual(input, session, "Metrics must not mutate the recorded evidence");
    return result;
}

test("native metrics explicitly replace the transport-derived tool metrics", () => {
    const disabled = ["tool-success-rate", "tool-failure-count", "loops", "trajectory-efficiency"];
    assert.deepEqual(Object.keys(source.graders).toSorted(), [...disabled, ...nativeMetrics].toSorted());
    for (const id of disabled) {
        assert.deepEqual(source.graders[id], { enabled: false });
    }
    assert.deepEqual(nativeMetrics.map(id => source.graders[id].config.metric),
        ["failures", "success-rate", "repeated"]);
    for (const id of nativeMetrics) {
        assert.equal(source.graders[id].script, source.graders["native-tool-failure-count"].script);
    }
});

test("native metric code runs only in the isolated read-only grader job", () => {
    const job = compiled.jobs.graders;
    assert.ok(job);
    assert.deepEqual(job.permissions, { contents: "read" });
    assert.deepEqual(job.needs, ["activation", "conclusion"]);
    assert.equal(job.if, "always() && needs.conclusion.result == 'success'");
    assert.equal(job.environment, undefined);
    assert.equal(job["timeout-minutes"], 10);

    const worker = job.steps.find(step => step.name === "Run isolated custom graders");
    assert.ok(worker);
    const chunkCount = Number(worker.env.GH_AW_CUSTOM_GRADER_MANIFEST_CHUNKS);
    assert.ok(Number.isInteger(chunkCount) && chunkCount > 0);
    const manifest = JSON.parse(Array.from({ length: chunkCount },
        (_, i) => worker.env[`GH_AW_CUSTOM_GRADER_MANIFEST_${i}`]).join(""));
    assert.deepEqual(manifest.graders.map(grader => grader.id).toSorted(), nativeMetrics.toSorted());
    for (const grader of manifest.graders) {
        assert.equal(grader.enabled, true);
        assert.equal(grader.script, source.graders[grader.id].script);
        assert.deepEqual(grader.config, source.graders[grader.id].config);
    }

    const collect = compiled.jobs.conclusion.steps.find(step => step.env?.GH_AW_GRADER_MANIFEST_0);
    assert.ok(collect);
    const metadata = JSON.parse(collect.env.GH_AW_GRADER_MANIFEST_0);
    assert.deepEqual(metadata.customGraders.toSorted(), nativeMetrics.toSorted());
    assert.ok(metadata.graders.every(grader => grader.script === undefined),
        "Conclusion must not receive executable custom metric code");
});

test("native metrics ignore transport records and count failed or unfinished calls once", () => {
    const session = [
        nativeStart("one"),
        { type: "mcp.rpc.request", data: { method: "tools/call" } },
        { type: "mcp.rpc.response", data: {} },
        nativeComplete("one"),
        nativeStart("two"),
        nativeComplete("two", false),
        nativeStart("unfinished"),
        nativeEvent("tool.execution_start", "detector", {}, "detector", "detection"),
        nativeEvent("tool.execution_complete", "detector", { success: false }, "detector", "detection"),
    ];
    assert.equal(runNativeMetric(session, nativeMetrics[0]), 2);
    assert.equal(runNativeMetric(session, nativeMetrics[1]), 1 / 3);
    assert.equal(runNativeMetric(session, nativeMetrics[2]), 0);
});

test("native metrics scope reused call IDs to their original sessions", () => {
    const session = [
        nativeStart("same", {}, "first"), nativeComplete("same", true, "first"),
        nativeStart("same", {}, "second"), nativeComplete("same", false, "second"),
    ];
    assert.equal(runNativeMetric(session, nativeMetrics[0]), 1);
    assert.equal(runNativeMetric(session, nativeMetrics[1]), 0.5);
    assert.equal(runNativeMetric(session, nativeMetrics[2]), 0);
});

test("repeated requests compare canonical arguments within each session", () => {
    const session = [
        nativeStart("one", { a: 1, b: [2, 3] }), nativeComplete("one"),
        nativeStart("other", { a: 1, b: [2, 3] }, "other"), nativeComplete("other", true, "other"),
        { type: "mcp.rpc.request", data: { method: "tools/call" } },
        nativeStart("two", { b: [2, 3], a: 1 }), nativeComplete("two"),
        nativeStart("three", { a: 2, b: [2, 3] }), nativeComplete("three"),
        nativeStart("four", { b: [2, 3], a: 2 }), nativeComplete("four"),
    ];
    assert.equal(runNativeMetric(session, nativeMetrics[2]), 2);
});

for (const [name, session] of [
    ["absent native evidence", []],
    ["transport-only evidence", [{ type: "mcp.rpc.response", data: {} }]],
    ["missing provenance", [{ type: "tool.execution_start", data: { toolCallId: "one" } }]],
    ["empty component", [nativeStart("valid"), nativeComplete("valid"), {
        ...nativeStart("unknown"), provenance: { component: "", phase: "agent", path: "session-1/events.jsonl" },
    }]],
    ["empty phase", [nativeStart("valid"), nativeComplete("valid"), {
        ...nativeStart("unknown"), provenance: { component: "agent", phase: "", path: "session-1/events.jsonl" },
    }]],
    ["missing identity", [nativeEvent("tool.execution_start", "", {})]],
    ["unknown outcome", [nativeStart("one"), nativeEvent("tool.execution_complete", "one", {})]],
    ["completion without a start", [nativeComplete("one")]],
    ["duplicate starts", [nativeStart("one"), nativeStart("one"), nativeComplete("one")]],
    ["duplicate completions", [nativeStart("one"), nativeComplete("one"), nativeComplete("one")]],
]) {
    test(`native metrics report ${name} as unavailable, not zero failures`, () => {
        for (const id of nativeMetrics) {
            const result = runNativeMetric(session, id);
            assert.equal(result.value, null);
            assert.equal(typeof result.message, "string");
            assert.ok(result.message.length > 0);
        }
    });
}

test("missing arguments do not become identical empty requests", () => {
    const session = [
        nativeEvent("tool.execution_start", "one", { toolName: "view" }), nativeComplete("one"),
        nativeEvent("tool.execution_start", "two", { toolName: "view" }), nativeComplete("two"),
    ];
    assert.equal(runNativeMetric(session, nativeMetrics[0]), 0);
    assert.equal(runNativeMetric(session, nativeMetrics[1]), 1);
    const repeated = runNativeMetric(session, nativeMetrics[2]);
    assert.equal(repeated.value, null);
    assert.match(repeated.message, /arguments or names are unavailable/);
});

test("native metrics handle a thousand distinct requests without counting transport duplicates", () => {
    const session = Array.from({ length: 1000 }, (_, i) => [
        nativeStart(String(i)), { type: "mcp.rpc.response", data: {} }, nativeComplete(String(i)),
    ]).flat();
    assert.equal(runNativeMetric(session, nativeMetrics[0]), 0);
    assert.equal(runNativeMetric(session, nativeMetrics[1]), 1);
    assert.equal(runNativeMetric(session, nativeMetrics[2]), 0);
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

test("the compiler runtime action pin is cached for reproducible compilation", () => {
    const compile = checks.jobs.compile.steps.find(step => step.name === "Validate and compile agent workflows");
    assert.ok(compile);
    const actionTag = /--action-tag\s+([a-f0-9]{40})(?:\s|$)/.exec(compile.run);
    assert.ok(actionTag, "Compilation must select an immutable runtime");
    const repo = "github/gh-aw/actions/setup";
    const reference = `${repo}@${actionTag[1]}`;
    const cache = JSON.parse(fs.readFileSync(new URL("../aw/actions-lock.json", workflowDirectory), "utf8"));
    const entry = cache.entries[reference];
    assert.ok(entry, "Commit the compiler runtime pin with the generated workflow");
    assert.equal(entry.repo, repo);
    assert.equal(entry.version, actionTag[1]);
    assert.equal(entry.sha, actionTag[1]);

    const setupSteps = steps.filter(step => step.uses?.startsWith(`${repo}@`));
    assert.ok(setupSteps.length > 0);
    for (const step of setupSteps) {
        assert.equal(step.uses, reference);
    }
});

test("generated helper jobs respect the slim runner time limit", () => {
    for (const [name, job] of Object.entries(compiled.jobs)) {
        if (job["runs-on"] === "ubuntu-slim" && typeof job["timeout-minutes"] === "number") {
            assert.ok(job["timeout-minutes"] <= 15, `${name} exceeds the slim runner's 15-minute limit`);
        }
    }
});

test("the assessment has a 400-credit budget separate from detection", () => {
    assert.equal(source["max-ai-credits"], 400);
    assert.equal(source.on.workflow_dispatch?.inputs, undefined);
    assert.deepEqual(Object.keys(compiled.on.workflow_dispatch.inputs), ["aw_context"],
        "Only the compiler's reserved context input is enabled; budget overrides remain future work");
    const info = compiled.jobs.activation.steps.find(step => step.name === "Generate agentic run info");
    assert.ok(info);
    assert.equal(info.env.GH_AW_INFO_MAX_AI_CREDITS, "400");

    const agent = compiled.jobs.agent.steps.find(step => step.name === "Execute GitHub Copilot CLI");
    assert.ok(agent);
    assert.match(agent.run, /^\s*GH_AW_MAX_AI_CREDITS="400"$/m);
    const detection = compiled.jobs.detection.steps.find(step => step.name === "Execute threat detection with AWF");
    assert.ok(detection);
    assert.equal(detection.env.GH_AW_MAX_AI_CREDITS,
        "${{ vars.GH_AW_DEFAULT_DETECTION_MAX_AI_CREDITS || '400' }}");

    const budgetSteps = steps.filter(step => step !== detection && step.env?.GH_AW_MAX_AI_CREDITS !== undefined);
    assert.ok(budgetSteps.length > 0, "Generated budget checks and reporting must include the assessment limit");
    for (const step of budgetSteps) {
        assert.equal(step.env.GH_AW_MAX_AI_CREDITS, "400", step.name);
    }
});

test("the assessment runtime allows 1000 model calls and 60 minutes", () => {
    assert.equal(source["timeout-minutes"], 60);
    assert.equal(source["max-turns"], 1000);
    assert.deepEqual(source.jobs, { agent: { "timeout-minutes": 100 } });
    const agent = compiled.jobs.agent.steps.find(step => step.name === "Execute GitHub Copilot CLI");
    assert.ok(agent);
    assert.equal(agent["timeout-minutes"], 60);
    assert.equal(agent.env.GH_AW_TIMEOUT_MINUTES, 60);
    assert.equal(agent.env.GH_AW_MAX_TURNS, 1000);
    assert.equal(compiled.jobs.agent["timeout-minutes"], 100,
        "Keep the existing 40-minute allowance for setup and post-processing");
    const maxRuns = /\\"maxRuns\\":(\d+)(?=,|\})/.exec(agent.run);
    assert.ok(maxRuns, "The API proxy must enforce the model-call limit");
    assert.equal(Number(maxRuns[1]), 1000);
    const agentTimeout = /\\"agentTimeout\\":(\d+)(?=,|\})/.exec(agent.run);
    assert.ok(agentTimeout, "The firewall runtime must use the agent-execution timeout");
    assert.equal(Number(agentTimeout[1]), 60);
});

test("the run and its report have explicit bounds and no missing-file success", () => {
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
