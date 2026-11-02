// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, verify } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ACTIONS_BOT_ID, OWNER, REPOSITORY, digest, renderAcceptance } from "../discussion-draft.mjs";
import {
    BUILD_CONTROL_PATHS, BUILD_LIMITS, BUILD_WORKFLOW, applyCandidateFiles, authorizeBuild, blobHash, buildBranch,
    buildCommand, checkBuildPublication, collectCandidate, findBuildArtifact, freezeBuild, parseAcceptedWork,
    parseBuildCommand, patchForDetection, prepareBuild, publishBuild, requiredChecks, scanBinding, validateCandidate,
    validateCompletion, verifyBuildArtifact, verifyBuildAuthorization, verifyBuildStart,
} from "../issue-implementation.mjs";
import { IMPLEMENTATION_APP, IMPLEMENTATION_PERMISSIONS, validateAppGrant, withImplementationApp } from "../implementation-app.mjs";
import { TEST_IMAGE, sandboxArguments, sandboxDockerfile } from "../implementation-sandbox.mjs";

const SHA = "a".repeat(40);
const POLICY = "b".repeat(40);
const TREE = "c".repeat(40);
const COMMIT = "d".repeat(40);
const NOW = new Date("2026-11-02T00:10:00Z");
const clock = () => new Date(NOW);
const repo = { id: REPOSITORY.id, full_name: "microsoft/TypeChat", private: false, default_branch: "main" };
const target = { kind: "issue", number: 75, id: "I_75", url: "https://github.com/microsoft/TypeChat/issues/75" };
const original = "export const value = 1;\n";

function fixture() {
    const policyText = "The project direction owner is **@robgruen**.\nPreserve schema accuracy.\n";
    const fingerprints = Object.fromEntries(BUILD_CONTROL_PATHS.map(file => [file, blobHash(file)]));
    fingerprints["GOALS.md"] = blobHash(policyText);
    const body = renderAcceptance({
        target, producer: { runId: 50, attempt: 1, commit: POLICY }, marker: "e".repeat(64),
        draft: { proposal: { goal: "Preserve correct values.", scope: ["Fix the agreed value."], nonGoals: ["No other behavior changes."] },
            suggestedCriteria: ["A deterministic test verifies the value."], pullRequests: [] },
    });
    const owner = { __typename: "User", login: OWNER.login, id: "OWNER" };
    const bot = { __typename: "Bot", login: "github-actions", id: ACTIONS_BOT_ID };
    function comment(id, content, author, createdAt) {
        return { id: `IC_${id}`, url: `${target.url}#issuecomment-${id}`, body: content, author,
            createdAt, updatedAt: createdAt, lastEditedAt: null, isMinimized: false };
    }
    const approval = comment(40, `/typechat accept 500:${digest(body)}`, owner, "2026-11-01T23:00:00Z");
    const acceptance = comment(41, body, bot, "2026-11-01T23:01:00Z");
    const command = comment(42, buildCommand(41, digest(body)), owner, "2026-11-02T00:00:00Z");
    const state = {
        head: SHA, fingerprints, comments: [approval, acceptance, command], artifacts: new Map(),
        target: { ...target, title: "Preserve a value", body: "An agreed issue.", state: "OPEN", locked: false,
            lastEditedAt: null, author: owner, repository: { nameWithOwner: "microsoft/TypeChat", isPrivate: false } },
        baseline: [...Object.entries(fingerprints).map(([file, sha]) => ({ path: file, type: "blob", mode: "100644", sha })),
            { path: "typescript/src/value.ts", type: "blob", mode: "100644", sha: blobHash(original) }],
        ref: null, pr: null, competitors: [], linked: [], writes: [], createdEntries: [], persistPrError: false, prError: null,
    };
    const context = {
        eventName: "issue_comment", actor: OWNER.login, sha: SHA, runId: 100,
        payload: { action: "created", repository: repo, sender: { type: "User", id: OWNER.id },
            issue: { number: 75, node_id: target.id, html_url: target.url },
            comment: { id: 42, node_id: command.id, html_url: command.url, body: command.body,
                created_at: command.createdAt, user: { type: "User", id: OWNER.id } } },
    };
    const env = {
        GITHUB_TRIGGERING_ACTOR: OWNER.login, GITHUB_RUN_ATTEMPT: "1", GITHUB_REF: "refs/heads/main",
        GITHUB_WORKFLOW_REF: `microsoft/TypeChat/${BUILD_WORKFLOW}@refs/heads/main`, TYPECHAT_IMPLEMENTATION_ENABLED: "true",
    };
    const proof = {
        appId: IMPLEMENTATION_APP.id, installationId: 123, repositoryId: REPOSITORY.id,
        permissions: { ...IMPLEMENTATION_PERMISSIONS }, verifiedAt: NOW.toISOString(),
    };
    const github = {
        graphql: async query => {
            if (query.includes("DiscussionPilotThread")) {
                return { repository: { target: { ...structuredClone(state.target), comments: {
                    totalCount: state.comments.length, pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: structuredClone(state.comments),
                } } } };
            }
            assert.ok(query.includes("ImplementationContributions"));
            return { repository: { issue: { timelineItems: {
                pageInfo: { hasNextPage: false, endCursor: null }, nodes: structuredClone(state.linked),
            } } } };
        },
        rest: {
            repos: {
                get: async () => ({ data: repo }),
                getBranch: async () => ({ data: { commit: { sha: state.head } } }),
                getContent: async () => ({ data: { type: "file", sha: state.fingerprints["GOALS.md"], size: policyText.length,
                    encoding: "base64", content: Buffer.from(policyText).toString("base64") } }),
                compareCommitsWithBasehead: async () => ({ data: { status: "ahead", merge_base_commit: { sha: POLICY } } }),
            },
            issues: {
                get: async () => ({ data: { number: 75, node_id: target.id, html_url: target.url } }),
                getComment: async ({ comment_id }) => {
                    const value = state.comments.find(item => item.id === `IC_${comment_id}`);
                    return { data: { node_id: value.id, body: value.body, html_url: value.url, user: { id: OWNER.id, type: "User" } } };
                },
            },
            pulls: {
                list: async input => ({ data: structuredClone(input.state === "all" ? state.pr ? [state.pr] : [] : state.competitors) }),
                get: async () => { throw new Error("No contribution fetch expected."); },
            },
            git: {
                getTree: async ({ tree_sha }) => ({ data: { truncated: false, tree: structuredClone(tree_sha === TREE ? state.createdEntries :
                    state.baseline.map(entry => ({ ...entry, sha: state.fingerprints[entry.path] ?? entry.sha }))) } }),
                getRef: async () => {
                    if (!state.ref) throw Object.assign(new Error("Not found"), { status: 404 });
                    return { data: state.ref };
                },
                getCommit: async () => ({ data: { sha: SHA, tree: { sha: POLICY } } }),
            },
            actions: {
                listArtifactsForRepo: async ({ name, per_page }) => {
                    const artifacts = [...state.artifacts.values()].filter(item => item.name === name);
                    return { data: { total_count: artifacts.length, artifacts: structuredClone(artifacts.slice(0, per_page)) } };
                },
                listWorkflowRunArtifacts: async ({ name }) => {
                    const artifacts = [...state.artifacts.values()].filter(item => item.name === name);
                    return { data: { total_count: artifacts.length, artifacts: structuredClone(artifacts) } };
                },
                getArtifact: async ({ artifact_id }) => ({ data: structuredClone(state.artifacts.get(artifact_id)) }),
            },
        },
    };
    const writer = { rest: { git: {
        createBlob: async input => {
            state.writes.push("blob");
            return { data: { sha: blobHash(Buffer.from(input.content, "base64")) } };
        },
        createTree: async input => {
            state.writes.push("tree");
            const entries = new Map(state.baseline.map(entry => [entry.path, entry]));
            for (const change of input.tree) {
                if (change.sha === null) entries.delete(change.path);
                else entries.set(change.path, change);
            }
            state.createdEntries = [...entries.values()];
            return { data: { sha: TREE } };
        },
        createCommit: async input => {
            state.writes.push("commit");
            assert.deepEqual(input.parents, [SHA]);
            assert.match(input.message, /Co-authored-by: Copilot/);
            return { data: { sha: COMMIT, tree: { sha: input.tree }, parents: [{ sha: SHA }] } };
        },
        createRef: async input => {
            state.writes.push("branch");
            state.ref = { ref: input.ref, object: { sha: input.sha } };
            return { data: state.ref };
        },
    }, pulls: {
        create: async input => {
            state.writes.push("pr");
            const pr = { number: 600, html_url: "https://github.com/microsoft/TypeChat/pull/600", body: input.body,
                user: { id: IMPLEMENTATION_APP.botId, type: "Bot" },
                head: { ref: input.head, sha: COMMIT, repo: { id: REPOSITORY.id } },
                base: { ref: input.base, sha: SHA, repo: { id: REPOSITORY.id } } };
            if (!state.prError || state.persistPrError) state.pr = pr;
            if (state.prError) throw state.prError;
            return { data: pr };
        },
    } } };
    function artifact(id, name) {
        const value = { id, name, expired: false, size_in_bytes: 1000, created_at: NOW.toISOString(),
            expires_at: "2026-12-01T00:00:00Z",
            workflow_run: { id: context.runId, repository_id: REPOSITORY.id, head_repository_id: REPOSITORY.id, head_sha: context.sha } };
        state.artifacts.set(id, value);
        return value;
    }
    return { state, context, env, github, writer, proof, artifact };
}

async function preparedFixture() {
    const f = fixture();
    const plan = await prepareBuild(f.github, f.context, f.env, clock);
    f.prepared = freezeBuild(plan, f.proof, clock);
    f.candidate = { version: 1, contextHash: digest(f.prepared), baseSha: SHA, summary: "Correct the agreed value.", limitations: [],
        files: [{ path: "typescript/src/value.ts", previousSha: blobHash(original), content: "export const value = 2;\n" }] };
    f.scan = scanBinding(f.prepared, f.candidate, "full exact patch", 100, 1);
    f.checks = { version: 1, binding: f.scan, commands: requiredChecks(f.candidate), conclusion: "success" };
    f.evidence = { agent: "success", outputs: "noop", detection: "success", detectionRan: "true",
        detectionConclusion: "success", tests: "success", mainCredits: "12.5", detectionCredits: "3.25", limitsExceeded: "false" };
    f.artifact(500, plan.startName);
    f.publish = async () => {
        const result = await checkBuildPublication(f.github, f.context, f.env, f.prepared, f.candidate, f.scan, f.checks, f.evidence, clock);
        f.artifact(501, result.intentName);
        return publishBuild(f.github, f.writer, f.proof, f.context, f.env, f.prepared, f.candidate, f.scan, f.checks, f.evidence, 501, clock);
    };
    return f;
}

test("the public durable acceptance generates an exact, copyable Issue command", async () => {
    const f = fixture();
    f.context.eventName = "workflow_dispatch";
    f.context.payload.inputs = { issue: "75", acceptance: "41" };
    delete f.env.TYPECHAT_IMPLEMENTATION_ENABLED;
    const result = await prepareBuild(f.github, f.context, f.env, clock);
    assert.equal(result.mode, "command");
    assert.equal(result.enabled, false);
    assert.deepEqual(parseBuildCommand(result.command), { acceptanceId: 41, bodyHash: digest(f.state.comments[1].body) });
    assert.equal(f.state.artifacts.size, 0);
    assert.equal(f.state.writes.length, 0);
    assert.equal(parseAcceptedWork(f.state.comments[1].body, target).terms.goal, "Preserve correct values.");
});

for (const body of ["/typechat build 1:abc", `/typechat build 1:${"f".repeat(64)}\nAdd another feature`,
    `/typechat accept 1:${"f".repeat(64)}`, `/typechat build 9007199254740993:${"f".repeat(64)}`]) {
    test(`reject unsupported build syntax: ${body.slice(0, 40)}`, () => assert.throws(() => parseBuildCommand(body)));
}

for (const [name, mutate] of [
    ["another sender", f => { f.context.payload.sender.id = 1; }],
    ["a bot", f => { f.context.payload.sender.type = "Bot"; }],
    ["another triggering actor", f => { f.env.GITHUB_TRIGGERING_ACTOR = "someone-else"; }],
    ["a PR comment", f => { f.context.payload.issue.pull_request = {}; }],
    ["a Discussion", f => { f.context.eventName = "discussion_comment"; }],
    ["a nondefault ref", f => { f.env.GITHUB_REF = "refs/heads/feature"; }],
    ["an untrusted workflow", f => { f.env.GITHUB_WORKFLOW_REF = "other/workflow@refs/heads/main"; }],
    ["another repository", f => { f.context.payload.repository = { ...repo, id: 1 }; }],
    ["an edited event", f => { f.context.payload.action = "edited"; }],
]) {
    test(`owner authorization rejects ${name}`, () => {
        const f = fixture(); mutate(f);
        assert.throws(() => authorizeBuild(f.context, f.env));
    });
}

for (const [name, mutate] of [
    ["an edited acceptance", f => { f.state.comments[1].lastEditedAt = NOW.toISOString(); }],
    ["a missing acceptance", f => { f.state.comments.splice(1, 1); }],
    ["a wrong acceptance hash", f => {
        f.state.comments[1].body += "\nchanged";
    }],
    ["a copied record from another bot", f => { f.state.comments[1].author.id = "OTHER_BOT"; }],
    ["an edited prior approval", f => { f.state.comments[0].lastEditedAt = NOW.toISOString(); }],
    ["a withdrawn command", f => { f.state.comments.splice(2, 1); }],
    ["a hidden command", f => { f.state.comments[2].isMinimized = true; }],
    ["an edited command", f => { f.state.comments[2].lastEditedAt = NOW.toISOString(); }],
    ["a closed Issue", f => { f.state.target.state = "CLOSED"; }],
    ["a disabled pilot", f => { f.env.TYPECHAT_IMPLEMENTATION_ENABLED = "false"; }],
    ["retry spending", f => { f.env.GITHUB_RUN_ATTEMPT = "2"; }],
    ["a changed source", f => { f.state.head = COMMIT; }],
    ["a linked open contribution", f => { f.state.linked.push({ source: { number: 76, state: "OPEN" } }); }],
    ["an unlinked competing PR", f => { f.state.competitors.push({ number: 77, title: "Implement #75", body: "" }); }],
    ["a nondefault policy proposal", f => {
        f.github.rest.repos.compareCommitsWithBasehead = async () => ({ data: { status: "diverged", merge_base_commit: { sha: COMMIT } } });
    }],
]) {
    test(`preflight blocks ${name} without spending or writing`, async () => {
        const f = fixture(); mutate(f);
        await assert.rejects(() => prepareBuild(f.github, f.context, f.env, clock));
        assert.equal(f.state.artifacts.size, 0);
        assert.equal(f.state.writes.length, 0);
    });
}

test("spending reservations survive retries and expire after the authorization window", async () => {
    const f = await preparedFixture();
    await verifyBuildStart(f.github, f.context, f.env, f.prepared, 500, clock);
    await assert.rejects(() => prepareBuild(f.github, f.context, f.env, clock), /reserved/);
    f.env.GITHUB_RUN_ATTEMPT = "2";
    await assert.rejects(() => verifyBuildStart(f.github, f.context, f.env, f.prepared, 500, clock), /different command/);
    f.env.GITHUB_RUN_ATTEMPT = "1";
    await assert.rejects(() => verifyBuildStart(f.github, f.context, f.env, f.prepared, 500,
        () => new Date(NOW.getTime() + 16 * 60000)), /too old/);
    await assert.rejects(() => verifyBuildAuthorization(f.github, f.context, f.env, f.prepared,
        () => new Date("2026-11-03T01:00:00Z")), /expired/);
});

test("final authorization detects changed discussion, policy, and accepted terms", async () => {
    for (const mutate of [
        f => { f.state.target.body = "Changed agreed scope."; },
        f => { f.state.comments[1].body += "\nNew scope"; },
        f => { f.state.fingerprints["GOALS.md"] = COMMIT; },
        f => { f.state.head = COMMIT; },
        f => { f.state.comments[0].lastEditedAt = NOW.toISOString(); },
    ]) {
        const f = await preparedFixture(); mutate(f);
        await assert.rejects(() => verifyBuildAuthorization(f.github, f.context, f.env, f.prepared, clock));
    }
});

test("artifact handoffs require the exact run, attempt name, repository, revision, and retained lifetime", async () => {
    const f = await preparedFixture();
    const artifact = f.artifact(600, "typechat-build-candidate-1");
    assert.equal(await findBuildArtifact(f.github, f.context, f.env, artifact.name, 65536, clock), 600);
    for (const mutate of [
        value => { value.workflow_run.id++; }, value => { value.workflow_run.head_repository_id++; },
        value => { value.workflow_run.head_sha = COMMIT; }, value => { value.expired = true; },
        value => { value.size_in_bytes = 9999999; }, value => { value.name = "typechat-build-candidate-2"; },
    ]) {
        const bad = structuredClone(artifact); mutate(bad); f.state.artifacts.set(600, bad);
        await assert.rejects(() => verifyBuildArtifact(f.github, f.context, 600, artifact.name, 65536, NOW));
    }
    f.state.artifacts.set(600, artifact);
    f.artifact(601, artifact.name);
    await assert.rejects(() => findBuildArtifact(f.github, f.context, f.env, artifact.name, 65536, clock), /ambiguous/);
});

for (const filename of [
    ".github/workflows/test.yml", "tools/issue-implementation.mjs", "GOALS.md", "AUTOMATION.md",
    "typescript/package.json", "python/pyproject.toml", "python/conftest.py", "site/.eleventy.js",
    "typescript/tsconfig.json", "typescript/src/../../GOALS.md", "typescript/src/AGENTS.md", "typescript/src/help.instructions.md",
    "typescript/node_modules/attack.js", "typescript/src/secret:stream", "typescript/src/nul.txt",
]) {
    test(`reject protected or unsafe patch path ${filename}`, async () => {
        const f = await preparedFixture();
        f.candidate.files = [{ path: filename, previousSha: null, content: "unapproved\n" }];
        assert.throws(() => validateCandidate(f.candidate, f.prepared, { truncated: false, tree: f.state.baseline }));
    });
}

test("candidate validation rejects wrong origin, symlinks, executable modes, binary data, collisions, and oversize output", async () => {
    for (const mutate of [
        f => { f.candidate.baseSha = COMMIT; },
        f => { f.candidate.contextHash = "0".repeat(64); },
        f => { f.candidate.files[0].previousSha = COMMIT; },
        f => { f.state.baseline.at(-1).mode = "120000"; },
        f => { f.state.baseline.at(-1).mode = "100755"; },
        f => { f.candidate.files[0].content = "\0"; },
        f => { f.candidate.files[0].content = "\ud800"; },
        f => { f.candidate.files[0].content = "x".repeat(65537); },
        f => { f.candidate.files.push({ path: "typescript/src/VALUE.ts", previousSha: null, content: "collision" }); },
        f => { f.candidate.files = Array.from({ length: 21 }, (_, index) => ({ path: `typescript/src/new${index}.ts`, previousSha: null, content: "x" })); },
        f => { f.candidate.files[0].content = original; },
    ]) {
        const f = await preparedFixture(); mutate(f);
        assert.throws(() => validateCandidate(f.candidate, f.prepared, { truncated: false, tree: f.state.baseline }));
    }
});

test("native completion, exact scan, deterministic checks, and actual separate usage are mandatory", async () => {
    const f = await preparedFixture();
    assert.deepEqual(validateCompletion(f.prepared, f.candidate, f.scan, f.checks, f.evidence), { mainCredits: 12.5, detectionCredits: 3.25 });
    for (const change of [
        { outputs: "" }, { outputs: "noop,report_incomplete" }, { agent: "failure" }, { detection: "skipped" },
        { detectionRan: "false" }, { detectionConclusion: "failure" }, { tests: "failure" },
        { mainCredits: "" }, { mainCredits: "1000.01" }, { detectionCredits: "400.01" }, { detectionCredits: "0" },
        { limitsExceeded: "true" },
    ]) {
        assert.throws(() => validateCompletion(f.prepared, f.candidate, f.scan, f.checks, { ...f.evidence, ...change }));
    }
    assert.throws(() => validateCompletion(f.prepared, f.candidate, { ...f.scan, candidateHash: "0".repeat(64) }, f.checks, f.evidence));
    assert.throws(() => validateCompletion(f.prepared, f.candidate, f.scan, { ...f.checks, commands: ["npm test"] }, f.evidence));
    assert.throws(() => validateCompletion(f.prepared, f.candidate, f.scan, { ...f.checks, binding: { ...f.scan, attempt: 2 } }, f.evidence));
});

test("one verified patch creates one owned branch and PR, with truthful checks and contributor scope", async () => {
    const f = await preparedFixture();
    const result = await f.publish();
    assert.equal(result.mode, "published");
    assert.equal(result.branch, buildBranch(f.prepared.target, f.prepared.acceptance));
    assert.deepEqual(f.state.writes, ["blob", "tree", "commit", "branch", "pr"]);
    assert.ok(f.state.pr.body.includes(f.prepared.acceptance.body));
    assert.match(f.state.pr.body, /12\.5 \/ 1000 AI credits/);
    assert.match(f.state.pr.body, /3\.25 \/ 400 AI credits/);
    assert.match(f.state.pr.body, /CI and Copilot review have not yet been verified/);
    f.env.GITHUB_RUN_ATTEMPT = "2";
    const retry = await prepareBuild(f.github, f.context, f.env, clock);
    assert.equal(retry.mode, "existing");
    assert.equal(retry.url, result.url);
    assert.equal(f.state.writes.length, 5);
});

test("unknown branch ownership and unresolved publication block further coding", async () => {
    const f = fixture();
    f.state.ref = { ref: "some prior branch" };
    await assert.rejects(() => prepareBuild(f.github, f.context, f.env, clock), /inspect the earlier write/);
    const g = await preparedFixture();
    const plan = await checkBuildPublication(g.github, g.context, g.env, g.prepared, g.candidate, g.scan, g.checks, g.evidence, clock);
    g.artifact(501, plan.intentName);
    await assert.rejects(() => prepareBuild(g.github, g.context, g.env, clock), /publication is unresolved/);
    assert.equal(g.state.writes.length, 0);
});

test("unexpected tree mutations cannot publish a branch or PR", async () => {
    const f = await preparedFixture();
    const createTree = f.writer.rest.git.createTree;
    f.writer.rest.git.createTree = async input => {
        const result = await createTree(input);
        f.state.createdEntries.find(entry => entry.path === "GOALS.md").sha = COMMIT;
        return result;
    };
    await assert.rejects(() => f.publish(), /outside the exact scanned patch/);
    assert.equal(f.state.writes.includes("branch"), false);
});

test("freshness is checked again after Git object creation and immediately before the PR", async () => {
    const f = await preparedFixture();
    const createRef = f.writer.rest.git.createRef;
    f.writer.rest.git.createRef = async input => {
        const result = await createRef(input);
        f.state.comments[2].lastEditedAt = NOW.toISOString();
        return result;
    };
    await assert.rejects(() => f.publish(), /partial or uncertain/);
    assert.equal(f.state.writes.includes("pr"), false);
    assert.ok(f.state.ref);
});

for (const persisted of [false, true]) {
    test(`uncertain PR writes are not blindly retried (persisted: ${persisted})`, async () => {
        const f = await preparedFixture();
        f.state.prError = new Error("Connection lost");
        f.state.persistPrError = persisted;
        await assert.rejects(() => f.publish(), /partial or uncertain/);
        if (persisted) assert.equal((await prepareBuild(f.github, f.context, f.env, clock)).mode, "existing");
        else await assert.rejects(() => prepareBuild(f.github, f.context, f.env, clock), /without a confirmed PR/);
        assert.equal(f.state.writes.filter(value => value === "branch").length, 1);
        assert.equal(f.state.writes.filter(value => value === "pr").length, 1);
    });
}

test("the full scan patch and collector include modified, added, and deleted files", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-patch-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.mkdirSync(path.join(directory, "typescript", "src"), { recursive: true });
    const file = path.join(directory, "typescript", "src", "value.ts");
    fs.writeFileSync(file, original);
    fs.writeFileSync(path.join(directory, "typescript", "src", "deleted.ts"), "old\n");
    const git = args => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git(["init", "--quiet"]);
    git(["add", "--all"]);
    git(["-c", "user.name=TypeChat Test", "-c", "user.email=typechat-test@example.invalid", "-c", "commit.gpgsign=false",
        "commit", "--quiet", "-m", "Fixture", "-m", "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"]);
    const prepared = { source: { commit: git(["rev-parse", "HEAD"]).trim() } };
    const candidate = { files: [
        { path: "typescript/src/value.ts", previousSha: blobHash(original), content: "export const value = 2;\n" },
        { path: "typescript/src/added.ts", previousSha: null, content: "new\n" },
        { path: "typescript/src/deleted.ts", previousSha: blobHash("old\n"), content: null },
    ] };
    const patch = patchForDetection(candidate, prepared, directory);
    for (const content of ["-export const value = 1;", "+export const value = 2;", "+new", "-old"]) assert.ok(patch.includes(content));
    const collected = collectCandidate(prepared, directory, "A complete patch.");
    assert.equal(collected.files.length, 3);
    assert.equal(collected.files.find(entry => entry.path.endsWith("deleted.ts")).content, null);
    assert.throws(() => applyCandidateFiles(candidate, directory), /differs from/);
});

test("test containers expose only read-only input data, no network, host workspace, socket, or credential environment", () => {
    const input = path.resolve(os.tmpdir(), "bounded-input");
    const args = sandboxArguments("typechat-check:abcd", "typechat-check-abcd", input);
    assert.ok(args.includes("--network=none"));
    assert.ok(args.includes("--cap-drop=ALL"));
    assert.ok(args.includes("--user=1000:1000"));
    assert.ok(args.includes(`type=bind,source=${input},target=/input,readonly`));
    assert.ok(!args.some(value => /docker\.sock|--env|--privileged|\/work:/.test(value)));
    const dockerfile = sandboxDockerfile({ files: [{ path: "python/src/typechat/test.py" }, { path: "typescript/src/test.ts" }] });
    assert.ok(dockerfile.includes(TEST_IMAGE));
    assert.ok(dockerfile.includes("npm ci --ignore-scripts"));
    assert.ok(dockerfile.includes("hatch env create"));
    assert.ok(!dockerfile.includes("TOKEN"));
    assert.deepEqual(requiredChecks({ files: [{ path: "README.md" }] }), ["git diff --check"]);
});

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKey = keyPair.privateKey.export({ type: "pkcs8", format: "pem" });
function appFixture() {
    const state = { revoked: 0, requests: [], secrets: [], grant: {
        token: "synthetic-installation-token-not-a-credential", expires_at: "2026-11-02T01:10:00Z",
        permissions: { contents: "write", pull_requests: "write", metadata: "read" },
    }, repositories: { total_count: 1, repositories: [{ id: REPOSITORY.id, full_name: "microsoft/TypeChat" }] } };
    function getOctokit(token, options) {
        assert.equal(options.baseUrl, "https://api.github.com");
        assert.equal(options.request.retries, 0);
        if (token !== state.grant.token) {
            const [header, payload, signature] = token.split(".");
            assert.equal(JSON.parse(Buffer.from(header, "base64url")).alg, "RS256");
            const claims = JSON.parse(Buffer.from(payload, "base64url"));
            assert.equal(claims.iss, IMPLEMENTATION_APP.id);
            assert.equal(claims.exp - claims.iat, 360);
            assert.ok(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), keyPair.publicKey, Buffer.from(signature, "base64url")));
        }
        return { rest: { apps: {
            getAuthenticated: async () => ({ data: { id: IMPLEMENTATION_APP.id, slug: IMPLEMENTATION_APP.slug } }),
            getRepoInstallation: async () => ({ data: { id: 123, app_id: IMPLEMENTATION_APP.id,
                account: { login: "microsoft" }, target_type: "Organization", suspended_at: null } }),
            createInstallationAccessToken: async request => { state.requests.push(request); return { data: state.grant }; },
            listReposAccessibleToInstallation: async () => ({ data: state.repositories }),
            revokeInstallationAccessToken: async () => { state.revoked++; },
        } } };
    }
    return { state, getOctokit, core: { setSecret: value => state.secrets.push(value) },
        credentials: { appId: String(IMPLEMENTATION_APP.id), privateKey } };
}

test("App tokens request only TypeChat contents/PR rights, use short-lived JWTs, mask credentials, and are revoked", async () => {
    const f = appFixture();
    const proof = await withImplementationApp(f.getOctokit, f.core, f.credentials, async (_writer, proof) => proof, clock);
    assert.deepEqual(f.state.requests, [{ installation_id: 123, repository_ids: [REPOSITORY.id],
        permissions: { contents: "write", pull_requests: "write" } }]);
    assert.equal(f.state.revoked, 1);
    assert.equal(f.state.secrets.length, 3);
    for (const secret of f.state.secrets) assert.ok(!JSON.stringify(proof).includes(secret));
    await assert.rejects(() => withImplementationApp(f.getOctokit, f.core, f.credentials, async () => { throw new Error("Stopped"); }, clock), /Stopped/);
    assert.equal(f.state.revoked, 2);
});

for (const [name, mutate] of [
    ["vulnerability-alert permission", f => { f.state.grant.permissions.vulnerability_alerts = "write"; }],
    ["missing content permission", f => { delete f.state.grant.permissions.contents; }],
    ["weak PR permission", f => { f.state.grant.permissions.pull_requests = "read"; }],
    ["an additional repository", f => { f.state.repositories.total_count = 2; }],
    ["the wrong repository", f => { f.state.repositories.repositories[0].id = 1; }],
    ["a long-lived token", f => { f.state.grant.expires_at = "2026-11-03T00:00:00Z"; }],
]) {
    test(`block App use with ${name} and revoke the minted token`, async () => {
        const f = appFixture(); mutate(f);
        let calls = 0;
        await assert.rejects(() => withImplementationApp(f.getOctokit, f.core, f.credentials, async () => { calls++; }, clock));
        assert.equal(calls, 0);
        assert.equal(f.state.revoked, 1);
        assert.throws(() => validateAppGrant(f.state.grant, f.state.repositories, NOW));
    });
}
