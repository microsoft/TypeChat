// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
    OWNER, REPOSITORY, ACTIONS_BOT_ID, DRAFT_WORKFLOW, PUBLISH_WORKFLOW, DRAFT_ARTIFACT_PREFIX, INTENT_PREFIX,
    CONTROL_PATHS, MAX_AGE_MS, MAX_BUNDLE_BYTES, authorize, parseCommand, digest, readThread, readControls,
    prepareDraft, validateDraft, renderDraft, renderAssessment, sealDraft, identifyPublication, checkPublication, publishDraft,
    readJson, writeJson, stageCandidateForDetection, createCandidateScan, readDetectedDraft,
} from "../discussion-draft.mjs";

const SHA = "a".repeat(40);
const OTHER_SHA = "c".repeat(40);
const NOW = new Date("2026-10-30T01:00:00Z");
const clock = () => new Date(NOW);
const REPO_URL = "https://github.com/microsoft/TypeChat";
const policy = "## Who decides\n\nThe project direction owner is **@robgruen**. Direction decisions require approval.\n";

function page(items, cursor) {
    const start = cursor === null || cursor === undefined ? 0 : Number(cursor);
    const nodes = items.slice(start, start + 100);
    return {
        nodes,
        totalCount: items.length,
        pageInfo: {
            hasNextPage: start + nodes.length < items.length,
            endCursor: start + nodes.length < items.length ? String(start + nodes.length) : null,
        },
    };
}

function candidate() {
    return {
        reply: [
            "Thanks for raising this. Usage reporting should preserve the validated result and make unavailable counts explicit.",
            "Do you need totals for the whole translation, including repair calls, or values for each model call?",
        ],
        summary: "Clarify how callers should receive optional model usage information.",
        scope: "in_scope",
        scopeReason: "Provider-neutral metadata fits the existing composable interface.",
        readiness: "needs_clarification",
        readinessReason: "The granularity and missing-data behavior need agreement.",
        questions: ["Do callers need totals per translation or values for every attempt?"],
        existingRequirements: ["Preserve existing callers."],
        suggestedCriteria: ["Make absent provider metadata explicit."],
        limitations: ["No implementation or test results were verified."],
        pullRequests: [],
    };
}

function setup(kind = "issue") {
    const target = {
        kind, number: 75, id: kind === "issue" ? "I_target" : "D_target",
        url: `${REPO_URL}/${kind === "issue" ? "issues" : "discussions"}/75`,
    };
    const repository = { nameWithOwner: "microsoft/TypeChat", isPrivate: false };
    const thread = {
        id: target.id, number: target.number, url: target.url, title: "Usage information", body: "How can callers get token counts?",
        state: "OPEN", closed: false, locked: false, lastEditedAt: null,
        author: { id: "contributor-node", login: "contributor", __typename: "User" }, repository, comments: [],
    };
    function comment(id, body, login = OWNER.login, type = "User", parentId = null) {
        return {
            id, url: `${target.url}#${kind === "issue" ? "issuecomment" : "discussioncomment"}-${id}`,
            body, createdAt: "2026-10-30T00:00:00Z", updatedAt: "2026-10-30T00:00:00Z",
            lastEditedAt: null, isMinimized: false,
            author: { id: login === "github-actions" ? ACTIONS_BOT_ID : `${login}-node`, login, __typename: type },
            replyTo: parentId ? { id: parentId } : null, replies: [],
        };
    }
    const requestComment = comment("request", "/typechat draft");
    thread.comments.push(requestComment);
    const comments = new Map([[requestComment.id, requestComment]]);
    const fingerprints = Object.fromEntries(CONTROL_PATHS.map(file => [file, digest(file).slice(0, 40)]));
    const revisions = new Map([[SHA, { fingerprints, policy }]]);
    const artifacts = new Map();
    const state = {
        target, thread, comments, fingerprints, revisions, artifacts, currentCommit: SHA,
        producerRun: {
            id: 100, run_attempt: 1, workflow_id: 900, path: DRAFT_WORKFLOW,
            status: "completed", conclusion: "success", event: `${kind}_comment`,
            head_branch: "main", head_sha: SHA,
            actor: { id: OWNER.id, type: "User" }, triggering_actor: { id: OWNER.id, type: "User" },
        },
        historyRequests: [], posts: [], references: new Map(), comment,
        postError: null, persistBeforeError: false, onHistory: null,
    };
    function event(action = "draft", body = "/typechat draft", commentId = "request", runId = 100, attempt = 1) {
        const currentComment = comment(commentId, body);
        if (action === "publish") {
            currentComment.createdAt = "2026-10-30T00:45:00Z";
            currentComment.updatedAt = currentComment.createdAt;
        }
        comments.set(commentId, currentComment);
        const index = thread.comments.findIndex(item => item.id === commentId);
        if (index === -1) {
            thread.comments.push(currentComment);
        } else {
            thread.comments[index] = currentComment;
        }
        return {
            context: {
                eventName: `${kind}_comment`, actor: OWNER.login, sha: SHA, runId,
                payload: {
                    action: "created",
                    repository: {
                        id: REPOSITORY.id, full_name: "microsoft/TypeChat", private: false, default_branch: "main",
                    },
                    sender: { id: OWNER.id, login: OWNER.login, type: "User" },
                    comment: {
                        node_id: commentId, body, created_at: currentComment.createdAt,
                        user: { id: OWNER.id, type: "User" },
                    },
                    [kind]: { number: target.number, node_id: target.id, html_url: target.url },
                },
            },
            env: {
                GITHUB_TRIGGERING_ACTOR: OWNER.login, GITHUB_REF: "refs/heads/main", GITHUB_RUN_ATTEMPT: String(attempt),
                GITHUB_WORKFLOW_REF: `microsoft/TypeChat/${action === "publish" ? PUBLISH_WORKFLOW : DRAFT_WORKFLOW}@refs/heads/main`,
                ...(action === "publish" ? { TYPECHAT_PUBLISH_KIND: kind } : {}),
            },
        };
    }
    async function post(body) {
        state.posts.push(body);
        const result = comment(`posted-${state.posts.length}`, body, "github-actions", "Bot");
        if (!state.postError || state.persistBeforeError) {
            thread.comments.push(result);
            comments.set(result.id, result);
        }
        if (state.postError) {
            throw state.postError;
        }
        return result;
    }
    const github = {
        graphql: async (query, variables) => {
            if (query.includes("author {")) {
                assert.match(query, /author \{ login __typename \.\.\. on Node \{ id \} \}/,
                    "Actor IDs must use the Node interface fragment");
            }
            if (query.includes("DiscussionPilotThread")) {
                const copy = structuredClone(thread);
                const connection = page(copy.comments, variables.after);
                if (kind === "discussion") {
                    for (const node of connection.nodes) {
                        node.replies = page(node.replies, null);
                    }
                }
                copy.comments = connection;
                return { repository: { target: copy } };
            }
            if (query.includes("DiscussionPilotReplies")) {
                const parent = comments.get(variables.id);
                return { node: { replies: page(structuredClone(parent.replies), variables.after) } };
            }
            if (query.includes("DiscussionPilotCommand")) {
                const stored = comments.get(variables.id);
                if (!stored) {
                    return { node: null };
                }
                return {
                    node: {
                        ...structuredClone(stored), __typename: kind === "issue" ? "IssueComment" : "DiscussionComment",
                        [kind]: { id: target.id, number: target.number, url: target.url, repository },
                        pullRequest: null,
                    },
                };
            }
            if (query.includes("DiscussionPilotPost")) {
                assert.equal(kind, "discussion");
                assert.equal(variables.id, target.id);
                assert.ok(!query.includes("replyToId"), "Discussion publication is top-level");
                return { addDiscussionComment: { comment: await post(variables.body) } };
            }
            throw new Error("Unexpected GraphQL operation in the test.");
        },
        rest: {
            git: {
                getTree: async ({ tree_sha }) => {
                    const revision = revisions.get(tree_sha);
                    assert.ok(revision, "Unknown fixture revision");
                    return { data: { truncated: false, tree: Object.entries(revision.fingerprints).map(([file, sha]) =>
                        ({ path: file, sha, type: "blob", mode: "100644" })) } };
                },
            },
            repos: {
                get: async () => ({ data: { ...REPOSITORY, full_name: "microsoft/TypeChat", private: false, default_branch: "main" } }),
                getBranch: async () => ({ data: { commit: { sha: state.currentCommit } } }),
                getContent: async ({ ref, path: file }) => {
                    assert.equal(file, "GOALS.md");
                    const revision = revisions.get(ref);
                    return {
                        data: { type: "file", encoding: "base64", sha: revision.fingerprints["GOALS.md"],
                            size: revision.policy.length, content: Buffer.from(revision.policy).toString("base64") },
                    };
                },
            },
            pulls: {
                get: async ({ pull_number }) => {
                    const reference = state.references.get(pull_number);
                    assert.ok(reference, "Missing fixture pull request");
                    return { data: reference };
                },
            },
            actions: {
                getArtifact: async ({ artifact_id }) => {
                    const artifact = artifacts.get(artifact_id);
                    assert.ok(artifact, "Missing fixture artifact");
                    return { data: structuredClone(artifact) };
                },
                getWorkflowRunAttempt: async ({ run_id, attempt_number }) => {
                    assert.equal(run_id, 100);
                    assert.equal(attempt_number, 1);
                    return { data: structuredClone(state.producerRun) };
                },
                getWorkflow: async ({ workflow_id }) => {
                    assert.equal(workflow_id, path.posix.basename(DRAFT_WORKFLOW));
                    return { data: { id: 900 } };
                },
                listArtifactsForRepo: async ({ name, per_page, page: pageNumber, ...repo }) => {
                    assert.deepEqual(repo, { owner: "microsoft", repo: "TypeChat" });
                    assert.equal(per_page, 2);
                    assert.equal(pageNumber, 1);
                    state.historyRequests.push({ method: "listArtifactsForRepo", name, per_page, page: pageNumber });
                    state.onHistory?.();
                    const list = [...artifacts.values()].filter(item => item.name === name);
                    return { data: {
                        artifacts: structuredClone(list.slice(0, per_page)), total_count: list.length,
                    } };
                },
            },
            issues: {
                createComment: async ({ issue_number, body, ...repo }) => {
                    assert.equal(kind, "issue");
                    assert.equal(issue_number, 75);
                    assert.deepEqual(repo, { owner: "microsoft", repo: "TypeChat" });
                    const result = await post(body);
                    return { data: { node_id: result.id, html_url: result.url, body: result.body } };
                },
            },
        },
    };
    return { state, github, event };
}

async function ready(kind = "issue", sealedAt = "2026-10-30T00:20:00Z") {
    const fixture = setup(kind);
    const draftRun = fixture.event();
    const prepared = await prepareDraft(fixture.github, draftRun.context, draftRun.env);
    const bundle = await sealDraft(fixture.github, draftRun.context, draftRun.env, prepared, candidate(),
        () => new Date(sealedAt));
    fixture.state.artifacts.set(500, {
        id: 500, name: `${DRAFT_ARTIFACT_PREFIX}1`, size_in_bytes: 10000, expired: false,
        created_at: "2026-10-30T00:30:00Z", expires_at: "2026-11-06T00:30:00Z",
        workflow_run: { id: 100, repository_id: REPOSITORY.id, head_repository_id: REPOSITORY.id, head_sha: SHA },
    });
    const publication = fixture.event("publish", `/typechat publish 500:${bundle.bodyHash}`, "approval", 200);
    return { ...fixture, bundle, publication, draftRun, prepared };
}

async function reserve(fixture, id = 501) {
    const { github, publication, bundle, state } = fixture;
    const checked = await checkPublication(github, publication.context, publication.env, bundle, clock);
    assert.equal(checked.shouldPost, true);
    state.artifacts.set(id, {
        id, name: checked.intentName, expired: false,
        created_at: NOW.toISOString(), expires_at: "2026-11-29T00:00:00Z",
        workflow_run: { id: publication.context.runId, repository_id: REPOSITORY.id, head_sha: SHA },
    });
    return id;
}

async function readyReply(kind = "issue") {
    const fixture = setup(kind);
    const draftRun = fixture.event("reply", "/typechat reply");
    const prepared = await prepareDraft(fixture.github, draftRun.context, draftRun.env, clock);
    const bundle = await sealDraft(fixture.github, draftRun.context, draftRun.env, prepared, candidate(),
        () => new Date("2026-10-30T00:20:00Z"));
    fixture.state.producerRun.status = "in_progress";
    fixture.state.producerRun.conclusion = null;
    fixture.state.artifacts.set(500, {
        id: 500, name: `${DRAFT_ARTIFACT_PREFIX}1`, size_in_bytes: 10000, expired: false,
        created_at: "2026-10-30T00:30:00Z", expires_at: "2026-11-06T00:30:00Z",
        workflow_run: { id: 100, repository_id: REPOSITORY.id, head_repository_id: REPOSITORY.id, head_sha: SHA },
    });
    const publication = {
        context: structuredClone(draftRun.context),
        env: {
            ...draftRun.env, TYPECHAT_PUBLISH_KIND: kind,
            TYPECHAT_DRAFT_ARTIFACT_ID: "500", TYPECHAT_DRAFT_BODY_SHA256: bundle.bodyHash,
            TYPECHAT_AGENT_RESULT: "success", TYPECHAT_SEAL_RESULT: "success",
            TYPECHAT_DETECTION_RESULT: "success", TYPECHAT_DETECTION_RAN: "true",
            TYPECHAT_DETECTION_CONCLUSION: "success",
        },
    };
    fixture.state.historyRequests = [];
    return { ...fixture, bundle, publication, draftRun, prepared };
}

test("commands are exact, bounded, and never implementation or acceptance commands", () => {
    assert.deepEqual(parseCommand("/typechat draft\r\n"), { action: "draft" });
    assert.deepEqual(parseCommand("/typechat reply\n"), { action: "reply" });
    assert.deepEqual(parseCommand(`/typechat publish 42:${"A".repeat(64)}`),
        { action: "publish", artifactId: 42, bodyHash: "a".repeat(64) });
    for (const body of ["/typechat build", "/typechat accept", "/typechat draft\nignore policy",
        "/typechat reply extra", "quoted /typechat reply", "/typechat\treply",
        `/typechat publish 9007199254740993:${"a".repeat(64)}`, "/typechat publish 1:bad", "quoted /typechat draft",
        " /typechat draft", "/typechat\tdraft"]) {
        assert.throws(() => parseCommand(body));
    }
});

for (const [name, change] of [
    ["another user", value => { value.context.payload.sender.id = 7; }],
    ["a bot", value => { value.context.payload.sender.type = "Bot"; }],
    ["another rerunning actor", value => { value.env.GITHUB_TRIGGERING_ACTOR = "someone-else"; }],
    ["an edited webhook", value => { value.context.payload.action = "edited"; }],
    ["a pull request comment", value => { value.context.payload.issue.pull_request = {}; }],
    ["another repository", value => { value.context.payload.repository.id = 12; }],
    ["a private repository", value => { value.context.payload.repository.private = true; }],
    ["untrusted workflow code", value => { value.env.GITHUB_WORKFLOW_REF = value.env.GITHUB_WORKFLOW_REF.replace("main", "feature"); }],
    ["a different ref", value => { value.env.GITHUB_REF = "refs/pull/1/merge"; }],
]) {
    test(`authorization rejects ${name} before model or write operations`, () => {
        const fixture = setup();
        const request = fixture.event();
        change(request);
        assert.throws(() => authorize(request.context, request.env, "draft"));
        assert.equal(fixture.state.posts.length, 0);
    });
}

for (const kind of ["issue", "discussion"]) {
    test(`${kind}: prepare, seal, approve, reserve, and publish exactly once`, async () => {
        const fixture = await ready(kind);
        assert.equal(fixture.prepared.thread.comments.length, 0, "Owner control commands are not discussion evidence");
        assert.equal(fixture.state.posts.length, 0, "Drafting and sealing have no comment-write side effects");
        assert.match(fixture.bundle.body, /does not accept work or authorize implementation/);
        const id = await reserve(fixture);
        const result = await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock);
        assert.equal(result.posted, true);
        assert.deepEqual(fixture.state.posts, [fixture.bundle.body]);
        fixture.state.thread.title = "Later discussion changes";
        const again = await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock);
        assert.equal(again.shouldPost, false);
        const repeated = await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock);
        assert.equal(repeated.posted, false);
        assert.equal(fixture.state.posts.length, 1);
    });
}

for (const kind of ["issue", "discussion"]) {
    test(`${kind}: an owner reply command posts one checked response without a second approval`, async () => {
        const fixture = await readyReply(kind);
        const id = await reserve(fixture);
        const result = await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock);
        assert.equal(result.posted, true);
        assert.deepEqual(fixture.state.posts, [fixture.bundle.body]);
        assert.equal(fixture.state.comments.has("approval"), false);
        const repeated = await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock);
        assert.equal(repeated.shouldPost, false);
        const rerun = fixture.event("reply", "/typechat reply", "request", 100, 2);
        const prepared = await prepareDraft(fixture.github, rerun.context, rerun.env, clock);
        assert.deepEqual(prepared, { alreadyReplied: true, url: result.url });
        assert.equal(fixture.state.posts.length, 1);
    });
}

for (const [field, value] of [
    ["TYPECHAT_AGENT_RESULT", "failure"], ["TYPECHAT_SEAL_RESULT", "skipped"],
    ["TYPECHAT_DETECTION_RESULT", "failure"], ["TYPECHAT_DETECTION_RAN", "false"],
    ["TYPECHAT_DETECTION_CONCLUSION", "warning"], ["TYPECHAT_DRAFT_ARTIFACT_ID", ""],
    ["TYPECHAT_DRAFT_BODY_SHA256", ""], ["TYPECHAT_DRAFT_BODY_SHA256", "f".repeat(64)],
    ["TYPECHAT_PUBLISH_KIND", "discussion"],
]) {
    test(`direct replies reject an invalid ${field} handoff`, async () => {
        const fixture = await readyReply();
        fixture.publication.env[field] = value;
        await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock));
        assert.equal(fixture.state.posts.length, 0);
    });
}

test("direct replies cannot borrow a sealed artifact from a different run", async () => {
    const fixture = await readyReply();
    fixture.state.artifacts.get(500).workflow_run.id = 99;
    await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
        /this owner-commanded run/);
    assert.equal(fixture.state.posts.length, 0);
});

test("direct replies cannot borrow another owner command's sealed response", async () => {
    const fixture = await readyReply();
    const other = fixture.event("reply", "/typechat reply", "another-command", 100);
    await assert.rejects(() => checkPublication(fixture.github, other.context,
        { ...fixture.publication.env, ...other.env }, fixture.bundle, clock), /different owner command/);
    assert.equal(fixture.state.posts.length, 0);
});

test("direct-reply body integrity also binds non-public assessment and provenance", async () => {
    for (const change of [
        bundle => { bundle.createdAt = "2026-10-30T00:21:00Z"; },
        bundle => { bundle.draft.summary = "A different internal assessment."; },
        bundle => { bundle.draft.scopeReason = "A different direction rationale."; },
        bundle => { bundle.snapshotHash = "b".repeat(64); },
    ]) {
        const fixture = await readyReply();
        change(fixture.bundle);
        await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
            /exact rendered draft/);
        assert.equal(fixture.state.posts.length, 0);
    }
});

test("a writer-only reply rerun may use its inherited successful seal, but never duplicate a write", async () => {
    const fixture = await readyReply();
    fixture.state.producerRun.status = "completed";
    fixture.state.producerRun.conclusion = "failure";
    fixture.publication.env.GITHUB_RUN_ATTEMPT = "2";
    const id = await reserve(fixture);
    const result = await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock);
    assert.equal(result.posted, true);
    assert.equal(fixture.state.posts.length, 1);
});

test("reply and preview authorization cannot be exchanged", async () => {
    const direct = await readyReply();
    direct.state.producerRun.status = "completed";
    direct.state.producerRun.conclusion = "success";
    const approval = direct.event("publish", `/typechat publish 500:${direct.bundle.bodyHash}`, "approval", 200);
    await assert.rejects(() => checkPublication(direct.github, approval.context, approval.env, direct.bundle, clock),
        /publication mode/);
    const preview = await ready();
    const request = preview.event("reply", "/typechat reply", "reply-request", 100);
    const environment = { ...direct.publication.env, ...request.env, TYPECHAT_DRAFT_BODY_SHA256: preview.bundle.bodyHash };
    await assert.rejects(() => checkPublication(preview.github, request.context, environment, preview.bundle, clock),
        /publication mode/);
    assert.equal(direct.state.posts.length + preview.state.posts.length, 0);
});

test("direct replies reject withdrawn commands, changed context, and stale controls", async () => {
    for (const change of [
        fixture => { fixture.state.comments.delete("request"); },
        fixture => { fixture.state.comments.get("request").lastEditedAt = NOW.toISOString(); },
        fixture => { fixture.state.thread.body = "Changed before posting"; },
        fixture => { fixture.state.thread.locked = true; },
        fixture => { fixture.state.thread.state = "CLOSED"; },
        fixture => { fixture.state.fingerprints["AUTOMATION.md"] = "f".repeat(40); },
        fixture => { fixture.publication.context.payload.sender.id = 7; },
        fixture => { fixture.publication.context.payload.issue.pull_request = {}; },
    ]) {
        const fixture = await readyReply();
        change(fixture);
        await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock));
        assert.equal(fixture.state.posts.length, 0);
    }
});

test("expired reply commands cannot start fresh work or publish a newer artifact", async () => {
    const fixture = await readyReply();
    const deadline = Date.parse(fixture.draftRun.context.payload.comment.created_at) + MAX_AGE_MS;
    const lastValid = () => new Date(deadline - 1);
    assert.equal((await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, lastValid)).shouldPost, true);
    const expired = () => new Date(deadline);
    await assert.rejects(() => prepareDraft(fixture.github, fixture.draftRun.context, fixture.draftRun.env, expired), /reply command has expired/);
    await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, expired),
        /reply command has expired/);
    assert.equal(fixture.state.posts.length, 0);
});

test("a copied reply marker from another bot does not suppress the owner's request", async () => {
    const fixture = await readyReply();
    const copied = fixture.state.comment("copied-reply", fixture.bundle.body, "github-actions", "Bot");
    copied.author.id = "different-bot-node";
    fixture.state.thread.comments.push(copied);
    const prepared = await prepareDraft(fixture.github, fixture.draftRun.context, fixture.draftRun.env, clock);
    assert.equal(prepared.alreadyReplied, undefined);
    await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
        /target context changed/);
    assert.equal(fixture.state.posts.length, 0);
});

test("edited or removed direct replies are not automatically overwritten or recreated", async () => {
    for (const keepMarker of [true, false]) {
        const fixture = await readyReply();
        const id = await reserve(fixture);
        const posted = await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock);
        const comment = fixture.state.comments.get(posted.id);
        comment.body = keepMarker ? comment.body + "Maintainer clarification." : "Replaced by the maintainer.";
        if (keepMarker) {
            assert.equal((await prepareDraft(fixture.github, fixture.draftRun.context, fixture.draftRun.env, clock)).alreadyReplied, true);
        } else {
            await assert.rejects(() => prepareDraft(fixture.github, fixture.draftRun.context, fixture.draftRun.env, clock), /previous reply intent/);
        }
        assert.equal(fixture.state.posts.length, 1);
    }
});

for (const persisted of [false, true]) {
    test(`uncertain direct replies keep per-command retry protection (server persisted: ${persisted})`, async () => {
        const fixture = await readyReply();
        const id = await reserve(fixture);
        fixture.state.postError = new Error("Connection lost");
        fixture.state.persistBeforeError = persisted;
        await assert.rejects(() => publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock),
            /outcome is uncertain/);
        const rerun = fixture.event("reply", "/typechat reply", "request", 101, 2);
        if (persisted) {
            assert.equal((await prepareDraft(fixture.github, rerun.context, rerun.env, clock)).alreadyReplied, true);
        } else {
            await assert.rejects(() => prepareDraft(fixture.github, rerun.context, rerun.env, clock), /previous reply intent/);
        }
        assert.equal(fixture.state.posts.length, 1);
    });
}

test("reply intent names are stable across different generated artifacts for the same command", async () => {
    const fixture = await readyReply();
    const first = await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock);
    fixture.state.artifacts.set(502, { ...fixture.state.artifacts.get(500), id: 502 });
    fixture.publication.env.TYPECHAT_DRAFT_ARTIFACT_ID = "502";
    const second = await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock);
    assert.equal(first.intentName, second.intentName);
    fixture.state.artifacts.set(501, {
        id: 501, name: first.intentName, expired: false,
        workflow_run: { id: 100, repository_id: REPOSITORY.id, head_sha: SHA },
    });
    await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
        /previous publication intent/);
    assert.equal(fixture.state.posts.length, 0);
});

test("discussion context includes all top-level comment and reply pages", async () => {
    const fixture = setup("discussion");
    for (let index = 0; index < 101; index++) {
        const item = fixture.state.comment(`comment-${index}`, `Comment ${index}`, "contributor");
        fixture.state.thread.comments.push(item);
        fixture.state.comments.set(item.id, item);
    }
    const parent = fixture.state.thread.comments[1];
    for (let index = 0; index < 101; index++) {
        parent.replies.push(fixture.state.comment(`reply-${index}`, `Reply ${index}`, "contributor", "User", parent.id));
    }
    const thread = await readThread(fixture.github, fixture.state.target);
    assert.equal(thread.comments.length, 203);
    assert.equal(thread.comments.filter(item => item.parentId === parent.id).length, 101);
});

test("unavailable or incomplete API evidence is not an empty successful snapshot", async () => {
    const fixture = setup();
    fixture.github.graphql = async () => ({ repository: { target: null } });
    await assert.rejects(readThread(fixture.github, fixture.state.target), /not returned/);
    fixture.github.graphql = async () => { throw new Error("API access denied"); };
    await assert.rejects(readThread(fixture.github, fixture.state.target), /API access denied/);
});

test("withdrawn and edited owner commands cannot authorize drafting", async () => {
    for (const mutation of [
        fixture => fixture.state.comments.delete("request"),
        fixture => { fixture.state.comments.get("request").lastEditedAt = "2026-10-30T00:01:00Z"; },
        fixture => { fixture.state.comments.get("request").isMinimized = true; },
    ]) {
        const fixture = setup();
        const event = fixture.event();
        mutation(fixture);
        await assert.rejects(prepareDraft(fixture.github, event.context, event.env));
        assert.equal(fixture.state.posts.length, 0);
    }
});

test("non-edit metadata changes do not revoke an unchanged owner command", async () => {
    const draftFixture = setup("discussion");
    const request = draftFixture.event();
    draftFixture.state.comments.get("request").updatedAt = "2026-10-30T00:10:00Z";
    await prepareDraft(draftFixture.github, request.context, request.env);
    const fixture = await ready("discussion");
    fixture.state.comments.get("request").updatedAt = "2026-10-30T00:40:00Z";
    fixture.state.comments.get("approval").updatedAt = "2026-10-30T00:50:00Z";
    const checked = await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock);
    assert.equal(checked.shouldPost, true);
    assert.equal(fixture.state.posts.length, 0);
});

test("missing or changed owner policy is an explicit failure", async () => {
    const fixture = setup();
    fixture.state.revisions.get(SHA).policy = "The project direction owner is **@someone-else**.";
    await assert.rejects(readControls(fixture.github, SHA), /owner policy/);
    fixture.state.revisions.get(SHA).policy = policy;
    delete fixture.state.fingerprints["GOALS.md"];
    await assert.rejects(readControls(fixture.github, SHA), /trusted control file/);
});

test("draft schema rejects arbitrary metadata, hidden markup, and premature acceptance", () => {
    const valid = candidate();
    for (const change of [
        { accepted: true }, { target: { number: 1 } }, { readiness: "accepted" },
        { summary: "Read https://example.invalid" }, { summary: "<!-- hidden -->" },
        { summary: "Read ftp://example.invalid" }, { summary: "Read www.example.invalid" },
        { summary: "First line\nSecond line" }, { questions: [""] },
        { reply: [] }, { reply: [""] }, { reply: ["First line\nSecond line"] },
        { reply: Array(7).fill("Too many paragraphs.") }, { reply: ["x".repeat(2001)] },
        { scope: "conflicts_with_direction", readiness: "ready_for_owner_decision" },
        { readiness: "ready_for_owner_decision" },
    ]) {
        assert.throws(() => validateDraft({ ...valid, ...change }));
    }
    const scoped = { ...valid, scope: "needs_owner_decision", readiness: "needs_owner_scope_decision", suggestedCriteria: [] };
    assert.equal(validateDraft(scoped).scope, "needs_owner_decision");
});

test("draft schema rejects HTML comment delimiters in every text field", () => {
    for (const delimiter of ["<!--", "-->", "--!>"]) {
        for (const field of ["reply", "summary", "scopeReason", "readinessReason", "questions",
            "existingRequirements", "suggestedCriteria", "limitations"]) {
            const draft = candidate();
            const text = `Unexpected ${delimiter} delimiter`;
            draft[field] = Array.isArray(draft[field]) ? [text] : text;
            assert.throws(() => validateDraft(draft), /must not contain URLs or hidden markup/,
                `${field} must reject ${delimiter}`);
        }
    }
});

test("rendering preserves plain text instead of interpreting model-supplied Markdown or entities", async () => {
    const fixture = await ready();
    const draft = validateDraft({
        ...candidate(), reply: ["# Not a trusted heading", "1. Not an ordered list",
            "Preserve Result<T> when count < 10.", "&lt;img&gt; is literal text.", "@someone is not a notification."],
    });
    const text = renderDraft({ ...fixture.bundle, draft });
    assert.ok(text.includes("\\# Not a trusted heading"));
    assert.ok(text.includes("1\\. Not an ordered list"));
    assert.ok(text.includes("Preserve Result&lt;T&gt; when count &lt; 10\\."));
    assert.ok(text.includes("&amp;lt;img&amp;gt; is literal text\\."));
    assert.ok(!/^# Not a trusted heading$/m.test(text));
    assert.ok(text.includes("\\@someone"));
});

test("the public response is conversational while assessment metadata stays out of the comment", async () => {
    const fixture = await ready();
    assert.ok(fixture.bundle.body.startsWith("Thanks for raising this\\."));
    for (const heading of ["Project direction", "Readiness recommendation", "Recorded requirements",
        "Suggested acceptance criteria", "Evidence limits"]) {
        assert.ok(!fixture.bundle.body.includes(heading));
        assert.ok(renderAssessment(fixture.bundle).includes(heading));
    }
    assert.ok(!fixture.bundle.body.includes(fixture.bundle.draft.summary));
});

test("sealing rejects changing discussion content, policy, and PR evidence", async () => {
    const fixture = setup();
    const event = fixture.event();
    const prepared = await prepareDraft(fixture.github, event.context, event.env);
    fixture.state.thread.body = "Changed request";
    await assert.rejects(sealDraft(fixture.github, event.context, event.env, prepared, candidate(), clock), /changed while drafting/);
    fixture.state.thread.body = prepared.thread.target.body;
    const draft = candidate();
    draft.pullRequests = [{ number: 469, headSha: SHA, updatedAt: NOW.toISOString() }];
    fixture.state.references.set(469, { number: 469, base: { repo: { id: REPOSITORY.id } }, head: { sha: OTHER_SHA }, updated_at: NOW.toISOString() });
    await assert.rejects(sealDraft(fixture.github, event.context, event.env, prepared, draft, clock), /inspected revision/);
    fixture.state.revisions.set(OTHER_SHA, { fingerprints: { ...fixture.state.fingerprints, "GOALS.md": "d".repeat(40) }, policy });
    fixture.state.currentCommit = OTHER_SHA;
    await assert.rejects(sealDraft(fixture.github, event.context, event.env, prepared, candidate(), clock), /Policy or workflow code changed/);
});

for (const [name, change] of [
    ["wrong digest", fixture => { fixture.publication.context.payload.comment.body = `/typechat publish 500:${"f".repeat(64)}`; fixture.state.comments.get("approval").body = fixture.publication.context.payload.comment.body; }],
    ["the wrong publishing authority", fixture => { fixture.publication.env.TYPECHAT_PUBLISH_KIND = "discussion"; }],
    ["approval before the draft existed", fixture => {
        fixture.publication.context.payload.comment.created_at = "2026-10-30T00:25:00Z";
        fixture.state.comments.get("approval").createdAt = "2026-10-30T00:25:00Z";
        fixture.state.comments.get("approval").updatedAt = "2026-10-30T00:25:00Z";
    }],
    ["tampered sealing time", fixture => { fixture.bundle.createdAt = "2026-10-30T00:50:00Z"; }],
    ["edited approval", fixture => { fixture.state.comments.get("approval").lastEditedAt = "2026-10-30T00:50:00Z"; }],
    ["a changed target", fixture => { fixture.state.thread.body = "New requirements"; }],
    ["a new non-control comment", fixture => { fixture.state.thread.comments.push(fixture.state.comment("new", "One more requirement", "contributor")); }],
    ["a closed target", fixture => { fixture.state.thread.state = "CLOSED"; }],
    ["a locked target", fixture => { fixture.state.thread.locked = true; }],
    ["tampered rendered text", fixture => { fixture.bundle.body += "Extra unapproved content"; }],
    ["model-chosen target metadata", fixture => { fixture.bundle.target.number = 1; }],
    ["unknown bundle fields", fixture => { fixture.bundle.accepted = true; }],
    ["a different repository artifact", fixture => { fixture.state.artifacts.get(500).workflow_run.repository_id = 1; }],
    ["a fork-produced artifact", fixture => { fixture.state.artifacts.get(500).workflow_run.head_repository_id = 1; }],
    ["an expired artifact", fixture => { fixture.state.artifacts.get(500).expired = true; }],
    ["an unsealed artifact", fixture => { fixture.state.artifacts.get(500).name = "raw-draft"; }],
    ["a failed producer", fixture => { fixture.state.producerRun.conclusion = "failure"; }],
    ["an untrusted producer ref", fixture => { fixture.state.producerRun.head_branch = "feature"; }],
    ["another producer actor", fixture => { fixture.state.producerRun.actor.id = 123; }],
    ["another rerunning producer actor", fixture => { fixture.state.producerRun.triggering_actor.id = 123; }],
    ["a different producer workflow", fixture => { fixture.state.producerRun.workflow_id = 123; }],
]) {
    test(`publication rejects ${name} without posting`, async () => {
        const fixture = await ready();
        change(fixture);
        await assert.rejects(checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock));
        assert.equal(fixture.state.posts.length, 0);
    });
}

test("same-second sealing and artifact times preserve exact approved publication", async () => {
    for (const kind of ["issue", "discussion"]) {
        for (const milliseconds of ["000", "750", "999"]) {
            const fixture = await ready(kind, `2026-10-30T00:30:00.${milliseconds}Z`);
            const approved = structuredClone(fixture.bundle);
            const intentId = await reserve(fixture);
            const result = await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env,
                fixture.bundle, intentId, clock);
            assert.equal(result.posted, true);
            assert.deepEqual(fixture.state.posts, [approved.body]);
            assert.deepEqual(fixture.bundle, approved, "Precision normalization must not change sealed bytes or approval hashes");
        }
    }
});

test("sealing before the request or in a later artifact second still rejects publication", async () => {
    for (const sealedAt of ["2026-10-29T23:59:59.999Z", "2026-10-30T00:30:01.000Z"]) {
        const fixture = await ready("issue", sealedAt);
        await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env,
            fixture.bundle, clock), /creation time does not match/);
        assert.equal(fixture.state.posts.length, 0);
    }
});

test("the maximum approval lifetime is enforced even when artifact retention is longer", async () => {
    const fixture = await ready();
    fixture.state.artifacts.get(500).expires_at = "2027-01-01T00:00:00Z";
    const expired = () => new Date(Date.parse(fixture.state.artifacts.get(500).created_at) + MAX_AGE_MS);
    await assert.rejects(identifyPublication(fixture.github, fixture.publication.context, fixture.publication.env, expired), /expired/);
});

test("a prior intent blocks a second attempt when no published comment can be confirmed", async () => {
    const fixture = await ready();
    await reserve(fixture);
    await assert.rejects(checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock), /previous publication intent/);
    assert.equal(fixture.state.posts.length, 0);
});

test("intents from earlier publisher runs also block duplicate writes", async () => {
    const fixture = await ready();
    fixture.state.artifacts.set(499, {
        id: 499, name: `${INTENT_PREFIX}500`, expired: false,
        workflow_run: { id: 199, repository_id: REPOSITORY.id, head_sha: SHA },
    });
    await assert.rejects(checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock), /previous publication intent/);
});

test("intents from earlier attempts of the same publisher run block reruns", async () => {
    const fixture = await ready();
    const id = await reserve(fixture);
    fixture.publication.env.GITHUB_RUN_ATTEMPT = "2";
    await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
        /previous publication intent/);
    assert.equal(fixture.state.artifacts.get(id).name, `${INTENT_PREFIX}500`);
    assert.equal(fixture.state.posts.length, 0);
});

test("the final intent lookup excludes only the current upload, not another run's intent", async () => {
    for (const priorFirst of [false, true]) {
        const fixture = await ready();
        const id = await reserve(fixture);
        fixture.state.artifacts.set(499, {
            id: 499, name: `${INTENT_PREFIX}500`, expired: false,
            workflow_run: { id: 199, repository_id: REPOSITORY.id, head_sha: SHA },
        });
        if (priorFirst) {
            const current = fixture.state.artifacts.get(id);
            fixture.state.artifacts.delete(id);
            fixture.state.artifacts.set(id, current);
        }
        await assert.rejects(() => publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock),
            /previous publication attempt/);
        assert.equal(fixture.state.posts.length, 0);
    }
});

test("publication needs a current durable intent retained beyond the draft lifetime", async () => {
    const fixture = await ready();
    const id = await reserve(fixture);
    fixture.state.artifacts.get(id).expires_at = "2026-10-30T02:00:00Z";
    await assert.rejects(publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock), /insufficiently retained/);
    assert.equal(fixture.state.posts.length, 0);
});

test("target changes during intent-history checks are caught before the write", async () => {
    const fixture = await ready();
    const id = await reserve(fixture);
    fixture.state.onHistory = () => { fixture.state.thread.body = "Changed during verification"; };
    await assert.rejects(publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock), /target context changed/);
    assert.equal(fixture.state.posts.length, 0);
});

test("approval withdrawn during the final context read prevents the write", async () => {
    const fixture = await ready();
    const id = await reserve(fixture);
    const graphql = fixture.github.graphql;
    let reads = 0;
    fixture.github.graphql = async (query, variables) => {
        const result = await graphql(query, variables);
        if (query.includes("DiscussionPilotThread") && ++reads === 2) {
            fixture.state.comments.delete("approval");
        }
        return result;
    };
    await assert.rejects(() => publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock),
        /deleted/);
    assert.equal(fixture.state.posts.length, 0);
    assert.ok(fixture.state.artifacts.has(id), "Retain the durable intent for human inspection");
});

for (const persisted of [false, true]) {
    test(`an uncertain POST is not retried automatically (server persisted: ${persisted})`, async () => {
        const fixture = await ready();
        const id = await reserve(fixture);
        fixture.state.postError = new Error("Connection lost");
        fixture.state.persistBeforeError = persisted;
        await assert.rejects(publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock), /outcome is uncertain/);
        assert.equal(fixture.state.posts.length, 1);
        if (persisted) {
            const result = await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock);
            assert.equal(result.shouldPost, false);
        } else {
            await assert.rejects(checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock), /previous publication intent/);
        }
        assert.equal(fixture.state.posts.length, 1);
    });
}

test("a changed existing bot comment is not overwritten or duplicated", async () => {
    const fixture = await ready();
    const id = await reserve(fixture);
    await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock);
    fixture.state.thread.comments.find(item => item.author.__typename === "Bot").body += "Edited afterwards";
    await assert.rejects(checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock), /different content/);
    assert.equal(fixture.state.posts.length, 1);
});

test("a copied marker from another bot cannot impersonate an Actions publication", async () => {
    const fixture = await ready();
    const copied = fixture.state.comment("copied", fixture.bundle.body, "github-actions", "Bot");
    copied.author.id = "different-bot-node";
    fixture.state.thread.comments.push(copied);
    await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
        /context changed/);
    assert.equal(fixture.state.posts.length, 0);
});

test("missing or incomplete publication history fails closed", async () => {
    for (const data of [
        null,
        { artifacts: [] },
        { artifacts: [], total_count: -1 },
        { artifacts: [], total_count: 1 },
        { artifacts: [], total_count: 1001 },
    ]) {
        const fixture = await ready();
        fixture.github.rest.actions.listArtifactsForRepo = async () => ({ data });
        await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
            /history/);
        assert.equal(fixture.state.posts.length, 0);
    }
});

test("invalid or duplicate filtered intent artifacts fail closed", async () => {
    const fixture = await ready();
    const artifact = {
        id: 499, name: `${INTENT_PREFIX}500`,
        workflow_run: { id: 199, repository_id: REPOSITORY.id, head_sha: SHA },
    };
    for (const artifacts of [
        [null],
        [{ ...artifact, id: 0 }],
        [{ ...artifact, name: `${INTENT_PREFIX}501` }],
        [{ ...artifact, workflow_run: { id: 199, repository_id: 1 } }],
        [{ ...artifact, workflow_run: { id: 0, repository_id: REPOSITORY.id } }],
        [artifact, artifact],
    ]) {
        fixture.github.rest.actions.listArtifactsForRepo = async () => ({ data: { artifacts, total_count: artifacts.length } });
        await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
            /history/);
    }
    assert.equal(fixture.state.posts.length, 0);
});

test("a missing current intent in the filtered history blocks publication", async () => {
    const fixture = await ready();
    const id = await reserve(fixture);
    fixture.github.rest.actions.listArtifactsForRepo = async () => ({ data: { artifacts: [], total_count: 0 } });
    await assert.rejects(() => publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock),
        /current publication intent is missing/);
    assert.equal(fixture.state.posts.length, 0);
});

test("two filtered matches suffice to block even a long matching history", async () => {
    const fixture = await ready();
    for (let index = 0; index < 1000; index++) {
        fixture.state.artifacts.set(1000 + index, {
            id: 1000 + index, name: `${INTENT_PREFIX}500`,
            workflow_run: { id: 1000 + index, repository_id: REPOSITORY.id, head_sha: SHA },
        });
    }
    await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
        /previous publication intent/);
    assert.equal(fixture.state.historyRequests.length, 1);
    assert.equal(fixture.state.posts.length, 0);
});

test("publication history uses one draft-keyed request per phase regardless of unrelated runs", async () => {
    const fixture = await ready();
    for (let index = 0; index < 1001; index++) {
        fixture.state.artifacts.set(1000 + index, {
            id: 1000 + index, name: `${INTENT_PREFIX}${1000 + index}`,
            workflow_run: { id: 1000 + index, repository_id: REPOSITORY.id, head_sha: SHA },
        });
    }
    const id = await reserve(fixture);
    await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock);
    assert.equal(fixture.state.historyRequests.length, 2);
    for (const request of fixture.state.historyRequests) {
        assert.equal(request.method, "listArtifactsForRepo");
        assert.equal(request.name, `${INTENT_PREFIX}500`);
        assert.equal(request.per_page, 2);
        assert.equal(request.page, 1);
    }
    assert.deepEqual(fixture.state.posts, [fixture.bundle.body]);
});

test("exactly 1,000 comments are supported but one more is an explicit context error", async () => {
    const fixture = setup();
    for (let index = 0; index < 999; index++) {
        fixture.state.thread.comments.push(fixture.state.comment(`comment-${index}`, "A requirement.", "contributor"));
    }
    const thread = await readThread(fixture.github, fixture.state.target);
    assert.equal(thread.comments.length, 1000);
    fixture.state.thread.comments.push(fixture.state.comment("extra", "Too many.", "contributor"));
    await assert.rejects(() => readThread(fixture.github, fixture.state.target), /1,000-comment/);
});

test("unrelated default-branch commits preserve a draft while control changes invalidate it", async () => {
    const fixture = await ready();
    fixture.state.revisions.set(OTHER_SHA, structuredClone(fixture.state.revisions.get(SHA)));
    fixture.state.currentCommit = OTHER_SHA;
    const checked = await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock);
    assert.equal(checked.shouldPost, true);
    fixture.state.revisions.get(OTHER_SHA).fingerprints[PUBLISH_WORKFLOW] = "f".repeat(40);
    await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
        /changed/);
});

test("malformed artifact errors do not echo untrusted JSON contents", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-draft-json-"));
    const filename = path.join(directory, "draft.json");
    try {
        fs.writeFileSync(filename, '{"private-value":broken}');
        assert.throws(() => readJson(directory, "draft.json", 1024), { message: "The artifact does not contain valid JSON." });
    }
    finally {
        fs.unlinkSync(filename);
        fs.rmdirSync(directory);
    }
});

for (const [kind, mode] of [["issue", "draft"], ["discussion", "draft"], ["issue", "reply"], ["discussion", "reply"]]) {
    test(`${kind}/${mode}: the authored workflow scripts prepare, preview, and publish the exact checked bytes`, async t => {
        const workflowDirectory = new URL("../../.github/workflows/", import.meta.url);
        const markdown = fs.readFileSync(new URL("discussion-draft.md", workflowDirectory), "utf8");
        const draftWorkflow = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)[1]);
        const publisher = parse(fs.readFileSync(new URL("publish-discussion-draft.yml", workflowDirectory), "utf8"));
        const fixture = setup(kind);
        const draftRun = fixture.event(mode, `/typechat ${mode}`);
        const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-draft-workflow-"));
        const savedEnvironment = { ...process.env };
        const summaries = [];
        const require = createRequire(import.meta.url);
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-30T00:20:00Z").getTime() });
        try {
            Object.assign(process.env, {
                GITHUB_WORKSPACE: fileURLToPath(new URL("../../", import.meta.url)),
                RUNNER_TEMP: temporary,
            });
            async function execute(step, request, environment = {}) {
                Object.assign(process.env, request.env, environment);
                const outputs = {};
                const summary = {
                    text: "",
                    addHeading(value) { this.text += value; return this; },
                    addRaw(value) { this.text += value; return this; },
                    addLink(label, url) { this.text += `${label}: ${url}`; return this; },
                    addCodeBlock(value) { this.text += value; return this; },
                    async write() { summaries.push(this.text); },
                };
                const core = { summary, notice() {}, setOutput(name, value) { outputs[name] = value; } };
                await new AsyncFunction("require", "github", "context", "core", step.with.script)(
                    require, fixture.github, request.context, core);
                return outputs;
            }
            function downloadDirectory(step) {
                return path.normalize(step.with.path.replace("${{ runner.temp }}", temporary));
            }

            const prepared = await execute(draftWorkflow.jobs.prepare.steps.find(step => step.id === "context"), draftRun);
            assert.equal(prepared.should_draft, "true");
            const sealing = draftWorkflow.jobs.seal.steps;
            const contextDirectory = downloadDirectory(sealing.find(step => step.name === "Download original context"));
            fs.mkdirSync(contextDirectory);
            fs.copyFileSync(prepared.path, path.join(contextDirectory, "context.json"));
            const candidateDirectory = downloadDirectory(sealing.find(step => step.name === "Download candidate"));
            writeJson(candidateDirectory, "discussion-draft.json", candidate());
            const detection = draftWorkflow["safe-outputs"]["threat-detection"];
            const scanCandidateDirectory = downloadDirectory(detection.steps.find(step => step.name === "Download candidate for detection"));
            fs.mkdirSync(scanCandidateDirectory);
            fs.copyFileSync(path.join(candidateDirectory, "discussion-draft.json"), path.join(scanCandidateDirectory, "discussion-draft.json"));
            const staged = await execute(detection.steps.find(step => step.id === "stage_candidate"), draftRun, {
                TYPECHAT_DETECTION_DIRECTORY: path.join(temporary, "threat-detection"),
            });
            const scanned = await execute(detection["post-steps"].find(step => step.id === "candidate_scan"), draftRun, {
                TYPECHAT_CANDIDATE_SHA256: staged.sha256, TYPECHAT_SCAN_OUTCOME: "success",
            });
            const scanDirectory = downloadDirectory(sealing.find(step => step.name === "Download candidate scan binding"));
            fs.mkdirSync(scanDirectory);
            fs.copyFileSync(scanned.path, path.join(scanDirectory, "candidate-scan.json"));
            const sealed = await execute(sealing.find(step => step.id === "seal"), draftRun);
            const bundle = readJson(path.dirname(sealed.path), "sealed-draft.json", MAX_BUNDLE_BYTES);
            assert.equal(fixture.state.posts.length, 0);

            fixture.state.artifacts.set(500, {
                id: 500, name: `${DRAFT_ARTIFACT_PREFIX}1`, size_in_bytes: 10000, expired: false,
                created_at: "2026-10-30T00:30:00Z", expires_at: "2026-11-06T00:30:00Z",
                workflow_run: { id: 100, repository_id: REPOSITORY.id, head_repository_id: REPOSITORY.id, head_sha: SHA },
            });
            await execute(sealing.find(step => step.name === "Show the exact preview and approval command"), draftRun, {
                TYPECHAT_DRAFT_ARTIFACT_ID: "500",
                TYPECHAT_DRAFT_ARTIFACT_URL: `${REPO_URL}/actions/runs/100/artifacts/500`,
            });
            assert.equal(summaries.at(-1).includes(`/typechat publish 500:${bundle.bodyHash}`), mode === "draft");
            assert.ok(summaries.at(-1).includes(bundle.body));
            assert.ok(summaries.at(-1).includes("Assessment and evidence (not posted)"));

            t.mock.timers.setTime(NOW.getTime());
            const publication = mode === "draft" ?
                fixture.event("publish", `/typechat publish 500:${bundle.bodyHash}`, "approval", 200) :
                { context: structuredClone(draftRun.context), env: { ...draftRun.env } };
            const publishJob = mode === "draft" ? publisher.jobs[`publish_${kind}`] : draftWorkflow.jobs[`reply_${kind}`];
            Object.assign(publication.env, publishJob.env);
            if (mode === "reply") {
                fixture.state.producerRun.status = "in_progress";
                fixture.state.producerRun.conclusion = null;
                Object.assign(publication.env, {
                    TYPECHAT_DRAFT_ARTIFACT_ID: "500", TYPECHAT_DRAFT_BODY_SHA256: sealed.body_hash,
                    TYPECHAT_AGENT_RESULT: "success", TYPECHAT_SEAL_RESULT: "success",
                    TYPECHAT_DETECTION_RESULT: "success", TYPECHAT_DETECTION_RAN: "true",
                    TYPECHAT_DETECTION_CONCLUSION: "success",
                });
            }
            const steps = publishJob.steps;
            const identified = await execute(steps.find(step => step.id === "identify"), publication);
            assert.deepEqual(identified, { artifact_id: "500", run_id: "100" });
            const bundleDirectory = downloadDirectory(steps.find(step =>
                step.name === (mode === "draft" ? "Download the approved sealed draft" : "Download the checked reply")));
            fs.mkdirSync(bundleDirectory);
            fs.copyFileSync(sealed.path, path.join(bundleDirectory, "sealed-draft.json"));
            const checked = await execute(steps.find(step => step.id === "check"), publication);
            assert.equal(checked.should_post, "true");
            assert.equal(JSON.parse(fs.readFileSync(checked.intent_path, "utf8")).bodyHash, bundle.bodyHash);
            assert.equal(fixture.state.posts.length, 0, "Approval and intent preparation alone must not post");
            fixture.state.artifacts.set(501, {
                id: 501, name: checked.intent_name, expired: false,
                created_at: NOW.toISOString(), expires_at: "2026-11-29T00:00:00Z",
                workflow_run: { id: publication.context.runId, repository_id: REPOSITORY.id, head_sha: SHA },
            });
            const published = await execute(steps.find(step => step.id === "publish"), publication, {
                TYPECHAT_INTENT_ARTIFACT_ID: "501",
            });
            assert.deepEqual(fixture.state.posts, [bundle.body]);
            const receipt = JSON.parse(fs.readFileSync(published.receipt_path, "utf8"));
            assert.equal(receipt.posted, true);
            assert.equal(receipt.bodyHash, bundle.bodyHash);
            const repeated = await execute(steps.find(step => step.id === "check"), publication);
            assert.equal(repeated.should_post, "false");
            assert.equal(fixture.state.posts.length, 1);
            if (mode === "reply") {
                const noOp = await execute(draftWorkflow.jobs.prepare.steps.find(step => step.id === "context"), draftRun);
                assert.equal(noOp.should_draft, "false");
                assert.equal(noOp.path, undefined);
                assert.ok(summaries.at(-1).includes("Command already answered"));
                assert.equal(fixture.state.posts.length, 1);
            }
        }
        finally {
            for (const key of Object.keys(process.env)) {
                if (!Object.hasOwn(savedEnvironment, key)) delete process.env[key];
            }
            Object.assign(process.env, savedEnvironment);
            fs.rmSync(temporary, { recursive: true });
        }
    });
}

test("a file-only candidate is included in detector input and bound to the exact scanned bytes", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-file-only-scan-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const candidateDirectory = path.join(directory, "candidate");
    const detectionDirectory = path.join(directory, "detection");
    writeJson(candidateDirectory, "discussion-draft.json", candidate());
    const file = path.join(candidateDirectory, "discussion-draft.json");
    const text = fs.readFileSync(file, "utf8");
    const hash = stageCandidateForDetection(candidateDirectory, detectionDirectory);
    const input = JSON.parse(fs.readFileSync(path.join(detectionDirectory, "agent_output.json"), "utf8"));
    assert.deepEqual(input.items, [{ type: "discussion-draft", content: text }]);
    assert.equal(hash, digest(text));
    const scan = createCandidateScan(hash, "success", 100, "1");
    assert.deepEqual(readDetectedDraft(candidateDirectory, scan, 100, "1"), candidate());
    fs.appendFileSync(file, "\n");
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), candidate());
    assert.throws(() => readDetectedDraft(candidateDirectory, scan, 100, "1"), /differs from the threat-scanned artifact/);
});

test("candidate staging preserves native outputs and rejects invalid candidates or native inputs", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-native-scan-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const candidateDirectory = path.join(directory, "candidate");
    const detectionDirectory = path.join(directory, "detection");
    const original = { items: [{ type: "noop", message: "Draft prepared." }], errors: [] };
    writeJson(candidateDirectory, "discussion-draft.json", candidate());
    writeJson(detectionDirectory, "agent_output.json", original);
    stageCandidateForDetection(candidateDirectory, detectionDirectory);
    const input = JSON.parse(fs.readFileSync(path.join(detectionDirectory, "agent_output.json"), "utf8"));
    assert.deepEqual(input.items.slice(0, -1), original.items);
    assert.deepEqual(input.errors, []);
    assert.deepEqual(JSON.parse(input.items.at(-1).content), candidate());
    const outputFile = path.join(detectionDirectory, "agent_output.json");
    for (const invalid of ["{malformed", '{"items":null}']) {
        fs.writeFileSync(outputFile, invalid);
        assert.throws(() => stageCandidateForDetection(candidateDirectory, detectionDirectory), /JSON|malformed/);
        assert.equal(fs.readFileSync(outputFile, "utf8"), invalid);
    }
    const candidateFile = path.join(candidateDirectory, "discussion-draft.json");
    for (const invalid of ["{malformed", "{}", " ".repeat(65537), Buffer.from([0xff])]) {
        fs.writeFileSync(candidateFile, invalid);
        assert.throws(() => stageCandidateForDetection(candidateDirectory, detectionDirectory));
    }
});

test("scan bindings require successful execution and the current run and attempt", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-scan-binding-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    writeJson(directory, "discussion-draft.json", candidate());
    const hash = digest(fs.readFileSync(path.join(directory, "discussion-draft.json"), "utf8"));
    const scan = createCandidateScan(hash, "success", 100, 1);
    for (const outcome of [undefined, "", "skipped", "failure", "cancelled"]) {
        assert.throws(() => createCandidateScan(hash, outcome, 100, 1), /did not execute successfully/);
        assert.throws(() => readDetectedDraft(directory, { ...scan, outcome }, 100, 1), /did not execute successfully/);
    }
    for (const invalid of [
        undefined, {}, { ...scan, extra: true }, { ...scan, version: 2 },
        { ...scan, runId: 99 }, { ...scan, attempt: 2 }, { ...scan, sha256: "" },
    ]) {
        assert.throws(() => readDetectedDraft(directory, invalid, 100, 1), /binding|hash/);
    }
});

test("artifact files must be bounded regular JSON files with no extra entries", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-discussion-test-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    writeJson(directory, "draft.json", candidate());
    assert.deepEqual(readJson(directory, "draft.json", 65536), candidate());
    assert.throws(() => readJson(directory, "draft.json", 1), /bounded regular/);
    assert.throws(() => writeJson(directory, "draft.json", {}));
    fs.writeFileSync(path.join(directory, "unexpected"), "extra");
    assert.throws(() => readJson(directory, "draft.json", 65536), /Unexpected files/);
});
