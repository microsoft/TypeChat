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
    prepareDraft, validateDraft, renderDraft, sealDraft, identifyPublication, checkPublication, publishDraft,
    readJson, writeJson,
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
        publisherRuns: [], posts: [], references: new Map(), comment,
        postError: null, persistBeforeError: false, onHistory: null,
    };
    function event(action = "draft", body = "/typechat draft", commentId = "request", runId = 100, attempt = 1) {
        const currentComment = comment(commentId, body);
        if (action === "publish") {
            currentComment.createdAt = "2026-10-30T00:45:00Z";
            currentComment.updatedAt = currentComment.createdAt;
        }
        comments.set(commentId, currentComment);
        if (!thread.comments.some(item => item.id === commentId)) {
            thread.comments.push(currentComment);
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
                GITHUB_WORKFLOW_REF: `microsoft/TypeChat/${action === "draft" ? DRAFT_WORKFLOW : PUBLISH_WORKFLOW}@refs/heads/main`,
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
                listWorkflowRunArtifacts: async ({ run_id, page: pageNumber }) => {
                    const list = [...artifacts.values()].filter(item => item.workflow_run.id === run_id);
                    return { data: { artifacts: structuredClone(list.slice((pageNumber - 1) * 100, pageNumber * 100)), total_count: list.length } };
                },
                listWorkflowRuns: async ({ actor: login, workflow_id, page: pageNumber }) => {
                    assert.equal(login, OWNER.login);
                    assert.equal(workflow_id, path.posix.basename(PUBLISH_WORKFLOW));
                    state.onHistory?.();
                    return { data: {
                        workflow_runs: structuredClone(state.publisherRuns.slice((pageNumber - 1) * 100, pageNumber * 100)),
                        total_count: state.publisherRuns.length,
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

async function ready(kind = "issue") {
    const fixture = setup(kind);
    const draftRun = fixture.event();
    const prepared = await prepareDraft(fixture.github, draftRun.context, draftRun.env);
    const bundle = await sealDraft(fixture.github, draftRun.context, draftRun.env, prepared, candidate(),
        () => new Date("2026-10-30T00:20:00Z"));
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

test("commands are exact, bounded, and never implementation or acceptance commands", () => {
    assert.deepEqual(parseCommand("/typechat draft\r\n"), { action: "draft" });
    assert.deepEqual(parseCommand(`/typechat publish 42:${"A".repeat(64)}`),
        { action: "publish", artifactId: 42, bodyHash: "a".repeat(64) });
    for (const body of ["/typechat build", "/typechat accept", "/typechat draft\nignore policy",
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
        { scope: "conflicts_with_direction", readiness: "ready_for_owner_decision" },
        { readiness: "ready_for_owner_decision" },
    ]) {
        assert.throws(() => validateDraft({ ...valid, ...change }));
    }
    const scoped = { ...valid, scope: "needs_owner_decision", readiness: "needs_owner_scope_decision", suggestedCriteria: [] };
    assert.equal(validateDraft(scoped).scope, "needs_owner_decision");
});

test("rendering preserves plain text instead of interpreting model-supplied Markdown or entities", async () => {
    const fixture = await ready();
    const draft = validateDraft({
        ...candidate(), summary: "# Not a trusted heading", questions: ["1. Not an ordered list"],
        limitations: ["&lt;img&gt; is literal text."],
    });
    const text = renderDraft({ ...fixture.bundle, draft });
    assert.ok(text.includes("\\# Not a trusted heading"));
    assert.ok(text.includes("1\\. Not an ordered list"));
    assert.ok(text.includes("&amp;lt;img&amp;gt; is literal text\\."));
    assert.ok(!/^# Not a trusted heading$/m.test(text));
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
    fixture.state.publisherRuns.push({ id: 199 });
    fixture.state.artifacts.set(499, {
        id: 499, name: `${INTENT_PREFIX}500-1`, expired: false,
        workflow_run: { id: 199, repository_id: REPOSITORY.id, head_sha: SHA },
    });
    await assert.rejects(checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock), /previous publication intent/);
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
        { workflow_runs: [] },
        { workflow_runs: [], total_count: 1 },
        { workflow_runs: [], total_count: 1001 },
    ]) {
        const fixture = await ready();
        fixture.github.rest.actions.listWorkflowRuns = async () => ({ data });
        await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
            /history/);
        assert.equal(fixture.state.posts.length, 0);
    }
});

test("exactly 1,000 history entries are supported without silently ignoring an extra page", async () => {
    const fixture = await ready();
    fixture.state.publisherRuns = Array.from({ length: 1000 }, (_, index) => ({ id: 1000 + index }));
    const checked = await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock);
    assert.equal(checked.shouldPost, true);
    fixture.state.publisherRuns.push({ id: 2000 });
    await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock),
        /history/);
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

for (const kind of ["issue", "discussion"]) {
    test(`${kind}: the authored workflow scripts prepare, preview, and publish the same approved bytes`, async t => {
        const workflowDirectory = new URL("../../.github/workflows/", import.meta.url);
        const markdown = fs.readFileSync(new URL("discussion-draft.md", workflowDirectory), "utf8");
        const draftWorkflow = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)[1]);
        const publisher = parse(fs.readFileSync(new URL("publish-discussion-draft.yml", workflowDirectory), "utf8"));
        const fixture = setup(kind);
        const draftRun = fixture.event();
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
            const sealing = draftWorkflow.jobs.seal.steps;
            const contextDirectory = downloadDirectory(sealing.find(step => step.name === "Download original context"));
            fs.mkdirSync(contextDirectory);
            fs.copyFileSync(prepared.path, path.join(contextDirectory, "context.json"));
            const candidateDirectory = downloadDirectory(sealing.find(step => step.name === "Download candidate"));
            writeJson(candidateDirectory, "discussion-draft.json", candidate());
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
            assert.ok(summaries.at(-1).includes(`/typechat publish 500:${bundle.bodyHash}`));
            assert.ok(summaries.at(-1).endsWith(bundle.body));

            t.mock.timers.setTime(NOW.getTime());
            const publication = fixture.event("publish", `/typechat publish 500:${bundle.bodyHash}`, "approval", 200);
            const publishJob = publisher.jobs[`publish_${kind}`];
            Object.assign(publication.env, publishJob.env);
            const steps = publishJob.steps;
            const identified = await execute(steps.find(step => step.id === "identify"), publication);
            assert.deepEqual(identified, { artifact_id: "500", run_id: "100" });
            const bundleDirectory = downloadDirectory(steps.find(step => step.name === "Download the approved sealed draft"));
            fs.mkdirSync(bundleDirectory);
            fs.copyFileSync(sealed.path, path.join(bundleDirectory, "sealed-draft.json"));
            const checked = await execute(steps.find(step => step.id === "check"), publication);
            assert.equal(checked.should_post, "true");
            assert.equal(JSON.parse(fs.readFileSync(checked.intent_path, "utf8")).bodyHash, bundle.bodyHash);
            assert.equal(fixture.state.posts.length, 0, "Approval and intent preparation alone must not post");
            fixture.state.artifacts.set(501, {
                id: 501, name: checked.intent_name, expired: false,
                created_at: NOW.toISOString(), expires_at: "2026-11-29T00:00:00Z",
                workflow_run: { id: 200, repository_id: REPOSITORY.id, head_sha: SHA },
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
