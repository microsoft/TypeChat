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
    OWNER, REPOSITORY, ACTIONS_BOT_ID, DRAFT_WORKFLOW, PUBLISH_WORKFLOW, STATUS_WORKFLOW, DRAFT_ARTIFACT_PREFIX, INTENT_PREFIX,
    CONTROL_PATHS, MAX_AGE_MS, MAX_BUNDLE_BYTES, MAX_COMMENT_BYTES, authorize, parseCommand, digest, readThread, readControls,
    prepareDraft, validateDraft, renderDraft, renderAcceptance, renderAssessment, sealDraft, identifyPublication, checkPublication, publishDraft,
    readJson, writeJson, stageCandidateForDetection, createCandidateScan, readDetectedDraft, snapshotHash,
    renderStatusReceipt, parseStatusRunTitle, identifyStatus, checkStatus, publishStatus, findPublicProposal, draftSummary,
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
        proposal: null,
        limitations: ["No implementation or test results were verified."],
        pullRequests: [],
    };
}

function proposalCandidate() {
    return {
        ...candidate(),
        reply: ["The proposed scope and tests are ready for owner review. No work has been accepted yet."],
        readiness: "ready_for_owner_decision",
        readinessReason: "The outcome, boundaries, and missing-data behavior are specified.",
        questions: [],
        suggestedCriteria: ["Offline tests verify that absent provider usage is reported as unavailable, not zero."],
        proposal: {
            goal: "Expose optional provider-neutral usage information without changing validated results.",
            scope: ["Add an optional usage observation hook and deterministic regression tests."],
            nonGoals: ["Do not change validation, repair behavior, or existing result types."],
        },
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
        reactions: new Set(), reactionError: null, reactionResponse: null,
    };
    function event(action = "draft", body = "/typechat draft", commentId = "request", runId = 100, attempt = 1) {
        const currentComment = comment(commentId, body);
        if (["publish", "accept"].includes(action)) {
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
                GITHUB_WORKFLOW_REF: `microsoft/TypeChat/${["publish", "accept"].includes(action) ? PUBLISH_WORKFLOW : DRAFT_WORKFLOW}@refs/heads/main`,
                ...(["publish", "accept"].includes(action) ? { TYPECHAT_PUBLISH_KIND: kind } : {}),
            },
        };
    }
    async function post(body) {
        state.posts.push(body);
        const result = comment(`posted-${state.posts.length}`, body, "github-actions", "Bot");
        if (state.postedAt) result.createdAt = result.updatedAt = state.postedAt;
        result.url = `${target.url}#${kind === "issue" ? "issuecomment" : "discussioncomment"}-${10000 + state.posts.length}`;
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
            if (query.includes("DiscussionPilotAcceptReaction")) {
                const command = comments.get(variables.id);
                assert.equal(command?.author.login, OWNER.login);
                assert.match(command.body, /^\/typechat accept /);
                assert.match(query, /content:THUMBS_UP/);
                assert.ok(thread.comments.some(item => item.author.id === ACTIONS_BOT_ID &&
                    item.body.startsWith("## Accepted work\n")), "A reaction must follow a confirmed acceptance");
                if (state.reactionError) {
                    throw state.reactionError;
                }
                state.reactions.add(variables.id);
                return state.reactionResponse ?? {
                    addReaction: { subject: { id: variables.id }, reaction: { content: "THUMBS_UP" } },
                };
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
                    assert.equal(attempt_number, 1);
                    const run = run_id === 100 ? state.producerRun : state.producerRuns?.get(run_id);
                    assert.ok(run, "Unknown fixture producer");
                    return { data: structuredClone(run) };
                },
                listWorkflowRunArtifacts: async ({ run_id, name, per_page, page: pageNumber }) => {
                    assert.equal(per_page, 2);
                    assert.equal(pageNumber, 1);
                    const matches = [...artifacts.values()].filter(item => item.workflow_run?.id === run_id && item.name === name);
                    return { data: { total_count: matches.length, artifacts: structuredClone(matches.slice(0, 2)) } };
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

async function ready(kind = "issue", sealedAt = "2026-10-30T00:20:00Z", draft = candidate()) {
    const fixture = setup(kind);
    const draftRun = fixture.event();
    const prepared = await prepareDraft(fixture.github, draftRun.context, draftRun.env);
    const bundle = await sealDraft(fixture.github, draftRun.context, draftRun.env, prepared, draft,
        () => new Date(sealedAt));
    fixture.state.artifacts.set(500, {
        id: 500, name: `${DRAFT_ARTIFACT_PREFIX}1`, size_in_bytes: 10000, expired: false,
        created_at: "2026-10-30T00:30:00Z", expires_at: "2026-11-06T00:30:00Z",
        workflow_run: { id: 100, repository_id: REPOSITORY.id, head_repository_id: REPOSITORY.id, head_sha: SHA },
    });
    const publication = fixture.event("publish", `/typechat publish 500:${bundle.bodyHash}`, "approval", 200);
    return { ...fixture, bundle, publication, draftRun, prepared };
}

async function readyAcceptance(kind = "issue") {
    const fixture = await ready(kind, undefined, proposalCandidate());
    fixture.publication = fixture.event("accept", `/typechat accept 500:${fixture.bundle.acceptance.bodyHash}`, "approval", 200);
    return fixture;
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

async function readyReply(kind = "issue", draft = candidate(), action = "reply", commentId = "request") {
    const fixture = setup(kind);
    const draftRun = fixture.event(action, `/typechat ${action}`, commentId);
    const prepared = await prepareDraft(fixture.github, draftRun.context, draftRun.env, clock);
    const bundle = await sealDraft(fixture.github, draftRun.context, draftRun.env, prepared, draft,
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

function publicCandidate() {
    return { ...proposalCandidate(), changes: ["Initial recommendation based on the complete issue discussion."] };
}

async function publicProposal(draft = publicCandidate()) {
    const f = await readyReply("issue", draft, "propose");
    f.state.postedAt = "2026-10-30T00:31:00Z";
    await publishDraft(f.github, f.publication.context, f.publication.env, f.bundle, await reserve(f), clock);
    f.state.producerRun.status = "completed";
    f.state.producerRun.conclusion = "success";
    return f;
}

async function secondProposal(f) {
    const draftRun = f.event("propose", "/typechat propose", "round-two", 101);
    draftRun.context.payload.comment.created_at = "2026-10-30T00:35:00Z";
    const command = f.state.comments.get("round-two");
    command.createdAt = command.updatedAt = draftRun.context.payload.comment.created_at;
    f.state.producerRuns = new Map([[101, { ...f.state.producerRun, id: 101, status: "in_progress", conclusion: null }]]);
    const prepared = await prepareDraft(f.github, draftRun.context, draftRun.env, clock);
    const draft = { ...publicCandidate(), changes: ["Community feedback narrows the agreed interface."] };
    const bundle = await sealDraft(f.github, draftRun.context, draftRun.env, prepared, draft,
        () => new Date("2026-10-30T00:40:00Z"));
    f.state.artifacts.set(600, { ...f.state.artifacts.get(500), id: 600, created_at: "2026-10-30T00:41:00Z",
        workflow_run: { ...f.state.artifacts.get(500).workflow_run, id: 101 } });
    const publication = { context: structuredClone(draftRun.context),
        env: { ...f.publication.env, ...draftRun.env, TYPECHAT_DRAFT_ARTIFACT_ID: "600", TYPECHAT_DRAFT_BODY_SHA256: bundle.bodyHash } };
    const next = { ...f, draftRun, prepared, bundle, publication };
    f.state.postedAt = "2026-10-30T00:42:00Z";
    await publishDraft(f.github, publication.context, publication.env, bundle, await reserve(next, 601), clock);
    f.state.producerRuns.get(101).status = "completed";
    f.state.producerRuns.get(101).conclusion = "success";
    return next;
}

async function statusFixture(kind = "issue", action = "draft", draft = candidate()) {
    const fixture = setup(kind);
    const { state, github } = fixture;
    state.comments.delete("request");
    state.thread.comments = [];
    const draftRun = fixture.event(action, `/typechat ${action}`, "42");
    for (const reference of draft.pullRequests) {
        state.references.set(reference.number, {
            number: reference.number, base: { repo: { id: REPOSITORY.id } },
            head: { sha: reference.headSha }, updated_at: reference.updatedAt,
        });
    }
    const prepared = await prepareDraft(github, draftRun.context, draftRun.env, clock);
    const bundle = await sealDraft(github, draftRun.context, draftRun.env, prepared, draft,
        () => new Date("2026-10-30T00:20:00Z"));
    state.artifacts.set(500, {
        id: 500, name: `${DRAFT_ARTIFACT_PREFIX}1`, size_in_bytes: 10000, expired: false,
        created_at: "2026-10-30T00:30:00Z", expires_at: "2026-11-06T00:30:00Z",
        workflow_run: { id: 100, repository_id: REPOSITORY.id, head_repository_id: REPOSITORY.id, head_sha: SHA },
    });
    Object.assign(state.producerRun, {
        repository: { id: REPOSITORY.id }, head_repository: { id: REPOSITORY.id },
        created_at: "2026-10-30T00:00:01Z", run_started_at: "2026-10-30T00:01:00Z",
        display_title: `TypeChat response: ${kind}_comment #75 / comment 42`,
    });
    state.updates = [];
    state.updateError = null;
    state.persistUpdateBeforeError = false;
    async function update(comment, body) {
        assert.ok(comment);
        state.updates.push(body);
        if (!state.updateError || state.persistUpdateBeforeError) {
            comment.body = body;
            comment.updatedAt = NOW.toISOString();
            comment.lastEditedAt = NOW.toISOString();
        }
        if (state.updateError) throw state.updateError;
        return comment;
    }
    const graphql = github.graphql;
    github.graphql = async (query, variables) => {
        if (query.includes("DiscussionStatusTarget")) {
            assert.equal(variables.number, 75);
            return { repository: { nameWithOwner: "microsoft/TypeChat", isPrivate: false, target: state.target } };
        }
        if (query.includes("DiscussionPilotUpdate")) {
            assert.equal(kind, "discussion");
            return { updateDiscussionComment: { comment: await update(state.comments.get(variables.id), variables.body) } };
        }
        return graphql(query, variables);
    };
    github.rest.issues.updateComment = async ({ comment_id, body }) => {
        assert.equal(kind, "issue");
        const comment = state.thread.comments.find(value => value.url === `${state.target.url}#issuecomment-${comment_id}`);
        const result = await update(comment, body);
        return { data: { node_id: result.id, html_url: result.url, body: result.body } };
    };
    github.rest.actions.getWorkflowRun = async ({ run_id }) => {
        assert.equal(run_id, 100);
        return { data: structuredClone(state.producerRun) };
    };
    github.rest.actions.listWorkflowRunArtifacts = async ({ run_id, name, per_page, page: pageNumber }) => {
        assert.equal(run_id, 100);
        assert.equal(per_page, 2);
        assert.equal(pageNumber, 1);
        const artifacts = [...state.artifacts.values()].filter(value => value.workflow_run.id === run_id && value.name === name);
        return { data: { total_count: artifacts.length, artifacts: structuredClone(artifacts.slice(0, 2)) } };
    };
    const status = {
        context: {
            eventName: "workflow_run", actor: "github-actions[bot]", sha: SHA, runId: 300,
            payload: { action: "completed", repository: draftRun.context.payload.repository,
                workflow_run: { id: 100, run_attempt: 1 } },
        },
        env: {
            GITHUB_WORKFLOW_REF: `microsoft/TypeChat/${STATUS_WORKFLOW}@refs/heads/main`,
            GITHUB_REF: "refs/heads/main", GITHUB_RUN_ATTEMPT: "1",
            GITHUB_TRIGGERING_ACTOR: "github-actions[bot]", TYPECHAT_STATUS_KIND: kind,
        },
    };
    return { ...fixture, draftRun, prepared, bundle, status };
}

async function reserveStatus(fixture, id = 601) {
    const checked = await checkStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, clock);
    assert.equal(checked.shouldWrite, true);
    fixture.state.artifacts.set(id, {
        id, name: checked.intentName, expired: false,
        created_at: NOW.toISOString(), expires_at: "2026-11-29T00:00:00Z",
        workflow_run: { id: fixture.status.context.runId, repository_id: REPOSITORY.id, head_sha: fixture.status.context.sha },
    });
    return id;
}

test("public proposal commands use bounded explicit versions without exposing hashes", () => {
    assert.deepEqual(parseCommand("/typechat propose\n"), { action: "propose" });
    assert.deepEqual(parseCommand("/typechat accept P2"), { action: "accept", proposalVersion: 2 });
    for (const body of ["/typechat accept P0", "/typechat accept P9007199254740992",
        "/typechat accept P2 extra", "/typechat propose extra", "/typechat accept latest"]) {
        assert.throws(() => parseCommand(body));
    }
});

test("a proposal is scanned, sealed, and posted directly, never accepted implicitly", async () => {
    const f = await publicProposal();
    assert.equal(f.bundle.version, 4);
    assert.equal(f.bundle.proposalVersion, 1);
    assert.match(f.state.posts[0], /^## Work proposal P1\n/);
    assert.match(f.state.posts[0], /Changes since the previous proposal/);
    assert.match(f.state.posts[0], /\/typechat accept P1/);
    assert.doesNotMatch(f.state.posts[0], /## Accepted work|\/typechat publish/);
    assert.equal(findPublicProposal(await readThread(f.github, f.state.target), 1).bodyHash, f.bundle.acceptance.bodyHash);
    const rerun = await prepareDraft(f.github, f.draftRun.context, f.draftRun.env, clock);
    assert.equal(rerun.alreadyReplied, true);
    assert.equal(f.state.posts.length, 1);
});

test("discussion proposals can state concrete opinions and open questions without permitting acceptance", async () => {
    const draft = { ...publicCandidate(), readiness: "needs_clarification", questions: ["Which compatibility baseline is required?"] };
    assert.throws(() => validateDraft(draft));
    const f = await publicProposal(draft);
    assert.equal(f.bundle.acceptance, null);
    assert.match(f.state.posts[0], /Which compatibility baseline/);
    assert.match(f.state.posts[0], /Not eligible for acceptance/);
    const approval = f.event("accept", "/typechat accept P1", "accept-one", 200);
    await assert.rejects(identifyPublication(f.github, approval.context, approval.env, clock), /unresolved questions or scope/);
});

test("in-scope proposal mode cannot fall back to a question-only response", () => {
    assert.throws(() => validateDraft({ ...candidate(), changes: ["First round."] }, "propose"), /must recommend explicit terms/);
    const blocked = { ...candidate(), readiness: "blocked_by_evidence", changes: ["The required source could not be inspected."] };
    assert.equal(validateDraft(blocked, "propose").proposal, null);
});

test("public proposal summaries expose version commands, not artifact/hash lookup", async () => {
    const f = await publicProposal();
    const parts = [];
    const summary = {};
    for (const method of ["addHeading", "addLink", "addRaw", "addCodeBlock"]) {
        summary[method] = (...values) => { parts.push(values.join(" ")); return summary; };
    }
    summary.write = async () => {};
    await draftSummary({ summary }, f.bundle, 500, "https://github.com/microsoft/TypeChat/actions/runs/100");
    assert.match(parts.join("\n"), /\/typechat accept P1/);
    assert.doesNotMatch(parts.join("\n"), /\/typechat accept 500:|\/typechat publish/);
});

test("the proposal candidate scan binds changes and all proposed terms", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-proposal-scan-"));
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-proposal-detection-"));
    try {
        const draft = publicCandidate();
        writeJson(directory, "discussion-draft.json", draft);
        const hash = stageCandidateForDetection(directory, output, "propose");
        const scan = createCandidateScan(hash, "success", 100, 1);
        assert.deepEqual(readDetectedDraft(directory, scan, 100, 1), draft);
        fs.appendFileSync(path.join(directory, "discussion-draft.json"), " ");
        assert.throws(() => readDetectedDraft(directory, scan, 100, 1), /differs from the threat-scanned/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
        fs.rmSync(output, { recursive: true, force: true });
    }
});

test("proposal rounds preserve earlier public versions and include community feedback in the full context", async () => {
    const f = await publicProposal();
    const originalBody = f.state.posts[0];
    const feedback = f.state.comment("feedback", "Preserve the optional callback.", "contributor");
    feedback.createdAt = feedback.updatedAt = "2026-10-30T00:33:00Z";
    f.state.thread.comments.push(feedback);
    const next = await secondProposal(f);
    assert.equal(next.bundle.proposalVersion, 2);
    assert.ok(next.prepared.thread.comments.some(comment => comment.body === originalBody));
    assert.ok(next.prepared.thread.comments.some(comment => comment.id === feedback.id));
    assert.equal(next.state.posts[0], originalBody);
    assert.match(next.state.posts[1], /^## Work proposal P2\n/);
    assert.match(next.state.posts[1], /Community feedback narrows/);
});

test("accept selects the exact public version despite later feedback and newer proposals", async () => {
    const first = await publicProposal();
    const second = await secondProposal(first);
    const publication = second.event("accept", "/typechat accept P1", "accept-one", 200);
    const f = { ...first, publication };
    f.state.postedAt = "2026-10-30T00:46:00Z";
    const result = await publishDraft(f.github, publication.context, publication.env, f.bundle, await reserve(f, 701), clock);
    assert.equal(result.posted, true);
    assert.match(f.state.posts.at(-1), /## Accepted work/);
    assert.match(f.state.posts.at(-1), /Proposal \*\*P1\*\*/);
    assert.match(f.state.posts.at(-1), /\/typechat build P1/);
    assert.doesNotMatch(f.state.posts.at(-1), /Proposal \*\*P2\*\*/);
    assert.equal(f.state.reactions.has("accept-one"), true);
    const repeated = await checkPublication(f.github, publication.context, publication.env, f.bundle, clock);
    assert.equal(repeated.shouldPost, false);
    assert.equal(f.state.posts.length, 3);
});

test("proposal acceptance rejects a mismatched bundle, an edited proposal, or a future version", async () => {
    for (const mutation of ["edited", "wrong-version", "future"]) {
        const f = await publicProposal();
        const publication = f.event("accept", "/typechat accept P1", "accept-one", 200);
        const posted = f.state.thread.comments.find(comment => comment.body === f.bundle.body);
        if (mutation === "edited") posted.lastEditedAt = "2026-10-30T00:40:00Z";
        if (mutation === "future") posted.createdAt = "2026-10-30T00:50:00Z";
        if (mutation === "wrong-version") f.bundle.proposalVersion = 2;
        await assert.rejects(checkPublication(f.github, publication.context, publication.env, f.bundle, clock));
        assert.equal(f.state.posts.length, 1);
    }
});

test("editing evidence that preceded a proposal still blocks acceptance", async () => {
    const f = await publicProposal();
    const publication = f.event("accept", "/typechat accept P1", "accept-one", 200);
    f.state.thread.body = "Changed the original requirement.";
    await assert.rejects(checkPublication(f.github, publication.context, publication.env, f.bundle, clock), /target context changed/);
});

test("a proposal edited between intent reservation and publication cannot be accepted", async () => {
    const f = await publicProposal();
    f.publication = f.event("accept", "/typechat accept P1", "accept-one", 200);
    const intent = await reserve(f, 701);
    f.state.onHistory = () => {
        f.state.thread.comments.find(comment => comment.body === f.bundle.body).lastEditedAt = NOW.toISOString();
        f.state.onHistory = null;
    };
    await assert.rejects(publishDraft(f.github, f.publication.context, f.publication.env, f.bundle, intent, clock), /edited|changed/);
    assert.equal(f.state.posts.length, 1);
});

test("a public version cannot select ambiguous or expired sealed artifacts", async () => {
    for (const mutation of ["ambiguous", "expired"]) {
        const f = await publicProposal();
        const approval = f.event("accept", "/typechat accept P1", "accept-one", 200);
        if (mutation === "ambiguous") f.state.artifacts.set(502, { ...f.state.artifacts.get(500), id: 502 });
        if (mutation === "expired") f.state.artifacts.get(500).expired = true;
        await assert.rejects(identifyPublication(f.github, approval.context, approval.env, clock), /ambiguous|expired/);
    }
});

test("public proposal acceptance preserves policy and automation freshness checks", async () => {
    const f = await publicProposal();
    const publication = f.event("accept", "/typechat accept P1", "accept-one", 200);
    f.state.currentCommit = OTHER_SHA;
    f.state.revisions.set(OTHER_SHA, { policy, fingerprints: { ...f.state.fingerprints, "AUTOMATION.md": "b".repeat(40) } });
    await assert.rejects(identifyPublication(f.github, publication.context, publication.env, clock), /trusted code changed/);
});

test("an unresolved earlier proposal write blocks inference for a new round", async () => {
    const f = await readyReply("issue", publicCandidate(), "propose");
    await reserve(f);
    const next = f.event("propose", "/typechat propose", "next-round", 101);
    await assert.rejects(prepareDraft(f.github, next.context, next.env, clock), /earlier proposal write is unconfirmed/);
});

for (const mutation of ["edited", "deleted"]) {
    test(`an unconfirmed proposal write still blocks a new round after its command is ${mutation}`, async () => {
        const fixture = await readyReply("issue", publicCandidate(), "propose");
        const intent = await reserve(fixture);
        fixture.state.postError = new Error("The write outcome is unknown");
        await assert.rejects(publishDraft(fixture.github, fixture.publication.context,
            fixture.publication.env, fixture.bundle, intent, clock), /Publication outcome is uncertain/);
        fixture.state.producerRun.status = "completed";
        fixture.state.producerRun.conclusion = "failure";
        if (mutation === "edited") {
            const original = fixture.state.comments.get("request");
            original.body += "\n";
            original.lastEditedAt = original.updatedAt = "2026-10-30T00:35:00Z";
        } else {
            fixture.state.comments.delete("request");
            fixture.state.thread.comments = fixture.state.thread.comments.filter(comment => comment.id !== "request");
        }
        const next = fixture.event("propose", "/typechat propose", "next-round", 101);
        next.context.payload.comment.created_at = "2026-10-30T00:40:00Z";
        const nextComment = fixture.state.comments.get("next-round");
        nextComment.createdAt = nextComment.updatedAt = next.context.payload.comment.created_at;
        await assert.rejects(prepareDraft(fixture.github, next.context, next.env, clock),
            /earlier proposal write is unconfirmed/);
        assert.equal(fixture.state.posts.length, 1, "Only the original uncertain write was attempted");
        assert.equal(fixture.state.artifacts.size, 2, "The original seal and intent are retained");
    });
}

test("proposal reservations use immutable target/version identity and retain original request data", async () => {
    const first = await readyReply("issue", publicCandidate(), "propose", "first-command");
    const second = await readyReply("issue", publicCandidate(), "propose", "second-command");
    const a = await checkPublication(first.github, first.publication.context, first.publication.env, first.bundle, clock);
    const b = await checkPublication(second.github, second.publication.context, second.publication.env, second.bundle, clock);
    assert.equal(a.intentName, b.intentName, "Different commands cannot reserve the same Issue/version independently");
    assert.match(a.intentName, /^typechat-publish-intent-propose-v2-[a-f0-9]{64}-P1$/);
    assert.deepEqual(a.intent.request, first.bundle.request);
    assert.equal(a.intent.approvalComment, "first-command");
    assert.deepEqual(b.intent.request, second.bundle.request);
    assert.equal(b.intent.approvalComment, "second-command");
});

test("confirmed proposal history can advance after the original command is deleted", async () => {
    const fixture = await publicProposal();
    fixture.state.comments.delete("request");
    fixture.state.thread.comments = fixture.state.thread.comments.filter(comment => comment.id !== "request");
    const next = await secondProposal(fixture);
    assert.equal(next.bundle.proposalVersion, 2);
    assert.equal(next.state.posts.length, 2);
    assert.match(next.state.posts[1], /^## Work proposal P2\n/);
});

test("proposals require owner authorization, Issue targets, and successful scan and seal", async () => {
    const f = await readyReply("issue", publicCandidate(), "propose");
    f.publication.env.TYPECHAT_SEAL_RESULT = "failure";
    await assert.rejects(checkPublication(f.github, f.publication.context, f.publication.env, f.bundle, clock), /successful model execution/);
    const otherOwner = structuredClone(f.draftRun.context);
    otherOwner.payload.sender.id = 7;
    await assert.rejects(prepareDraft(f.github, otherOwner, f.draftRun.env, clock), /human project owner/);
    const discussion = setup("discussion");
    const request = discussion.event("propose", "/typechat propose");
    await assert.rejects(prepareDraft(discussion.github, request.context, request.env, clock), /Issue thread/);
});

test("community-authored proposal markers cannot be accepted as Actions-bot proposals", async () => {
    const f = await publicProposal();
    f.state.thread.comments.push(f.state.comment("forged", f.bundle.body.replaceAll("P1", "P9"), "contributor"));
    assert.throws(() => findPublicProposal({ target: f.state.target,
        comments: f.state.thread.comments.map(comment => ({ ...comment,
            parentId: null, minimized: comment.isMinimized,
            author: { ...comment.author, type: comment.author.__typename } })) }, 9), /unavailable/);
});

test("canonical proposal completion receipts do not make a proposal stale", async () => {
    const f = await publicProposal();
    const before = snapshotHash(await readThread(f.github, f.state.target));
    const data = { version: 1, kind: "issue", number: 75, commentId: 42, runId: 100,
        attempt: 1, started: Date.parse("2026-10-30T00:01:00Z"),
        action: "propose", outcome: "replied", result: "10001" };
    const body = renderStatusReceipt(data);
    assert.match(body, /requested proposal is available/);
    const receipt = f.state.comment("receipt", body, "github-actions", "Bot");
    f.state.thread.comments.push(receipt);
    assert.equal(snapshotHash(await readThread(f.github, f.state.target)), before);
    receipt.body += "An edited receipt is still discussion evidence.";
    assert.notEqual(snapshotHash(await readThread(f.github, f.state.target)), before);
});

test("completion titles bind only numeric owner-comment and target IDs", () => {
    assert.deepEqual(parseStatusRunTitle("TypeChat response: issue_comment #504 / comment 6562188203"),
        { kind: "issue", number: 504, commentId: 6562188203 });
    assert.deepEqual(parseStatusRunTitle("TypeChat response: discussion_comment #42 / comment 123"),
        { kind: "discussion", number: 42, commentId: 123 });
    assert.equal(parseStatusRunTitle("TypeChat discussion response"), null);
    assert.throws(() => parseStatusRunTitle("TypeChat response: issue_comment #75 / comment 42\nInjected"), /binding/);
    assert.throws(() => parseStatusRunTitle("TypeChat response: issue_comment #9007199254740993 / comment 42"));
});

test("receipt rendering accepts only bounded operational metadata, never arbitrary content", () => {
    const data = {
        version: 1, kind: "issue", number: 75, commentId: 42, runId: 100, attempt: 1,
        started: Date.parse("2026-10-30T00:01:00Z"), action: "draft", outcome: "input", result: "",
    };
    for (const change of [
        { message: "Unapproved prose." }, { kind: "pull_request" }, { number: 0 },
        { commentId: Number.MAX_SAFE_INTEGER + 1 }, { started: -1 }, { action: "accept" },
        { outcome: "accepted" }, { outcome: "replied", result: "99" },
        { action: "reply", outcome: "replied", result: "https://example.invalid" },
        { action: "reply", outcome: "replied", result: "99)\nNew content" },
        { result: "unexpected" },
    ]) {
        assert.throws(() => renderStatusReceipt({ ...data, ...change }), /Invalid completion-receipt metadata/);
    }
});

for (const kind of ["issue", "discussion"]) {
    test(`${kind}: a fixed completion receipt is posted once without publishing model text or invalidating approval`, async () => {
        const fixture = await statusFixture(kind, "draft", proposalCandidate());
        const identified = await identifyStatus(fixture.github, fixture.status.context, fixture.status.env, clock);
        assert.equal(identified.artifact.id, 500);
        const intent = await reserveStatus(fixture);
        const result = await publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, intent, clock);
        assert.equal(result.posted, true);
        assert.equal(result.updated, false);
        assert.equal(result.outcome, "ready");
        assert.equal(fixture.state.posts.length, 1);
        const body = fixture.state.posts[0];
        assert.match(body, /Draft and work-acceptance preview prepared/);
        assert.ok(body.includes(`${fixture.state.target.url}#${kind === "issue" ? "issuecomment" : "discussioncomment"}-42`));
        assert.ok(body.includes("/actions/runs/100/attempts/1"));
        assert.ok(!body.includes(fixture.bundle.draft.summary));
        assert.ok(!body.includes(fixture.bundle.draft.reply[0]));
        assert.ok(!body.includes(fixture.bundle.draft.proposal.goal));
        const thread = await readThread(fixture.github, fixture.state.target);
        assert.equal(snapshotHash(thread), fixture.prepared.snapshotHash);
        const prepared = await prepareDraft(fixture.github, fixture.draftRun.context, fixture.draftRun.env, clock);
        assert.equal(prepared.thread.comments.length, 0, "Operational receipts are not model-visible discussion evidence");
        const repeated = await checkStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, clock);
        assert.equal(repeated.shouldWrite, false);
        assert.equal(fixture.state.posts.length, 1);
        const approval = fixture.event("accept", `/typechat accept 500:${fixture.bundle.acceptance.bodyHash}`, "approval", 200);
        const accepted = await checkPublication(fixture.github, approval.context, approval.env, fixture.bundle, clock);
        assert.equal(accepted.shouldPost, true, "The receipt must not make the frozen proposal stale");
    });

    test(`${kind}: owner/maintainer input is not mislabeled as work acceptance`, async () => {
        const fixture = await statusFixture(kind);
        const id = await reserveStatus(fixture);
        const result = await publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, id, clock);
        assert.equal(result.outcome, "input");
        assert.match(fixture.state.posts[0], /input is still needed before work acceptance/);
        assert.ok(!fixture.state.posts[0].includes("/typechat accept"));
    });

    test(`${kind}: newer completion outcomes update one receipt and older events cannot overwrite it`, async () => {
        const fixture = await statusFixture(kind);
        await publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, await reserveStatus(fixture), clock);
        fixture.state.producerRun.run_attempt = 2;
        fixture.state.producerRun.run_started_at = "2026-10-30T00:40:00Z";
        fixture.state.producerRun.conclusion = "failure";
        fixture.status.context.payload.workflow_run.run_attempt = 2;
        const id = await reserveStatus(fixture, 602);
        const result = await publishStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, id, clock);
        assert.equal(result.updated, true);
        assert.equal(fixture.state.posts.length, 1);
        assert.equal(fixture.state.updates.length, 1);
        assert.match(fixture.state.updates[0], /request failed/);
        assert.ok(fixture.state.updates[0].includes("/attempts/2"));
        assert.equal(snapshotHash(await readThread(fixture.github, fixture.state.target)), fixture.prepared.snapshotHash);
        fixture.status.context.payload.workflow_run.run_attempt = 1;
        assert.equal((await checkStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, clock)).shouldWrite, false);
        assert.equal(fixture.state.updates.length, 1);
    });

    test(`${kind}: a public reply is already a completion message`, async () => {
        const fixture = await statusFixture(kind, "reply");
        const reply = fixture.state.comment("reply", fixture.bundle.body, "github-actions", "Bot");
        reply.url = `${fixture.state.target.url}#${kind === "issue" ? "issuecomment" : "discussioncomment"}-99`;
        fixture.state.thread.comments.push(reply);
        const result = await checkStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, clock);
        assert.equal(result.shouldWrite, false);
        assert.equal(result.url, reply.url);
        assert.equal(fixture.state.posts.length, 0);
    });
}

for (const [label, change] of [
    ["another event", fixture => { fixture.status.context.eventName = "issue_comment"; }],
    ["a missing source event attempt", fixture => { delete fixture.status.context.payload.workflow_run.run_attempt; }],
    ["another repository", fixture => { fixture.status.context.payload.repository.id = 7; }],
    ["a private repository", fixture => { fixture.status.context.payload.repository.private = true; }],
    ["untrusted receipt code", fixture => { fixture.status.env.GITHUB_WORKFLOW_REF = "microsoft/TypeChat/other.yml@refs/heads/main"; }],
    ["a nonowner receipt rerun", fixture => { fixture.status.env.GITHUB_RUN_ATTEMPT = "2"; }],
    ["another source actor", fixture => { fixture.state.producerRun.actor.id = 7; }],
    ["a source bot", fixture => { fixture.state.producerRun.actor.type = "Bot"; }],
    ["another source rerunning actor", fixture => { fixture.state.producerRun.triggering_actor.id = 7; }],
    ["a source fork", fixture => { fixture.state.producerRun.head_repository.id = 7; }],
    ["another source repository", fixture => { fixture.state.producerRun.repository.id = 7; }],
    ["an untrusted source ref", fixture => { fixture.state.producerRun.head_branch = "feature"; }],
    ["another source workflow", fixture => { fixture.state.producerRun.workflow_id = 7; }],
    ["another source path", fixture => { fixture.state.producerRun.path = ".github/workflows/other.yml"; }],
    ["another source trigger", fixture => { fixture.state.producerRun.event = "workflow_dispatch"; }],
    ["the wrong target authority", fixture => { fixture.status.env.TYPECHAT_STATUS_KIND = "discussion"; }],
    ["a source run before its command", fixture => { fixture.state.producerRun.created_at = "2026-10-29T23:59:59Z"; }],
    ["invalid source timing", fixture => { fixture.state.producerRun.run_started_at = "2026-11-01T00:00:00Z"; }],
    ["an unknown source conclusion", fixture => { fixture.state.producerRun.conclusion = "unknown"; }],
    ["a malformed source-artifact time", fixture => { fixture.state.artifacts.get(500).created_at = "2026-11-01T00:00:00Z"; }],
    ["missing artifact availability", fixture => { delete fixture.state.artifacts.get(500).expired; }],
    ["a mismatched sealed target", fixture => { fixture.bundle.target.number = 1; }],
    ["a mismatched sealed request", fixture => { fixture.bundle.request.commentId = "other-command"; }],
    ["tampered draft output", fixture => { fixture.bundle.draft.summary = "Different data."; }],
]) {
    test(`completion authorization rejects ${label} without a write`, async () => {
        const fixture = await statusFixture();
        change(fixture);
        await assert.rejects(() => checkStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, clock));
        assert.equal(fixture.state.posts.length, 0);
        assert.equal(fixture.state.updates.length, 0);
    });
}

test("completion reports failure, cancellation, invalid syntax, and missing evidence explicitly", async () => {
    for (const [conclusion, body, expected] of [
        ["failure", "/typechat draft", "failed"],
        ["cancelled", "/typechat draft", "cancelled"],
        ["timed_out", "/typechat draft", "cancelled"],
        ["failure", "/typechat reply", "unconfirmed"],
        ["failure", "/typechat draft extra", "invalid"],
        ["success", "/typechat draft", "unavailable"],
    ]) {
        const fixture = await statusFixture();
        fixture.state.producerRun.conclusion = conclusion;
        fixture.state.comments.get("42").body = body;
        fixture.state.artifacts.delete(500);
        const id = await reserveStatus(fixture);
        const result = await publishStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, id, clock);
        assert.equal(result.outcome, expected);
        assert.match(fixture.state.posts[0], /Operational receipt only/);
        assert.ok(!fixture.state.posts[0].includes("nothing was posted") || expected === "unconfirmed");
    }
});

test("receipts honor withdrawal, hidden commands, closed targets, legacy titles, and pending source attempts", async () => {
    for (const change of [
        fixture => { fixture.state.comments.get("42").lastEditedAt = NOW.toISOString(); },
        fixture => { fixture.state.comments.get("42").isMinimized = true; },
        fixture => { fixture.state.thread.comments = []; fixture.state.comments.delete("42"); },
        fixture => { fixture.state.thread.state = "CLOSED"; },
        fixture => { fixture.state.thread.locked = true; },
        fixture => { fixture.state.producerRun.display_title = "TypeChat discussion response"; },
        fixture => { fixture.state.producerRun.status = "in_progress"; },
        fixture => { fixture.state.producerRun.conclusion = "skipped"; },
    ]) {
        const fixture = await statusFixture();
        change(fixture);
        const result = await checkStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, clock);
        assert.equal(result.shouldWrite, false);
        assert.ok(result.reason);
        assert.equal(fixture.state.posts.length, 0);
    }
});

test("new evidence or control changes produce an outdated receipt, not a ready claim", async () => {
    for (const controlsChanged of [false, true]) {
        const fixture = await statusFixture();
        if (controlsChanged) {
            const fingerprints = { ...fixture.state.fingerprints, "AUTOMATION.md": "d".repeat(40) };
            fixture.state.revisions.set(OTHER_SHA, { fingerprints, policy });
            fixture.state.currentCommit = OTHER_SHA;
            fixture.status.context.sha = OTHER_SHA;
        } else {
            fixture.state.thread.body = "Changed requirements";
        }
        const id = await reserveStatus(fixture);
        const result = await publishStatus(fixture.github, fixture.status.context, fixture.status.env,
            controlsChanged ? undefined : fixture.bundle, id, clock);
        assert.equal(result.outcome, "outdated");
        assert.match(fixture.state.posts[0], /no longer current/);
    }
});

test("changed PR evidence is not reported as an actionable draft", async () => {
    const draft = proposalCandidate();
    draft.pullRequests = [{ number: 80, headSha: SHA, updatedAt: NOW.toISOString() }];
    const fixture = await statusFixture("issue", "draft", draft);
    fixture.state.references.get(80).head.sha = OTHER_SHA;
    const result = await publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle,
        await reserveStatus(fixture), clock);
    assert.equal(result.outcome, "outdated");
});

test("a confirmed reply updates an earlier failure receipt rather than adding a second status comment", async () => {
    const fixture = await statusFixture("issue", "reply");
    fixture.state.producerRun.conclusion = "failure";
    await publishStatus(fixture.github, fixture.status.context, fixture.status.env, undefined,
        await reserveStatus(fixture), clock);
    const reply = fixture.state.comment("actual-reply", fixture.bundle.body, "github-actions", "Bot");
    reply.url = `${fixture.state.target.url}#issuecomment-99`;
    fixture.state.thread.comments.push(reply);
    const result = await publishStatus(fixture.github, fixture.status.context, fixture.status.env, undefined,
        await reserveStatus(fixture, 602), clock);
    assert.equal(result.updated, true);
    assert.equal(result.outcome, "replied");
    assert.equal(fixture.state.posts.length, 1);
    assert.equal(fixture.state.updates.length, 1);
    assert.ok(fixture.state.updates[0].includes(reply.url));
});

test("receipt publication rechecks owner withdrawal immediately before writing", async () => {
    const fixture = await statusFixture();
    const intent = await reserveStatus(fixture);
    fixture.state.onHistory = () => { fixture.state.comments.get("42").lastEditedAt = NOW.toISOString(); };
    const result = await publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, intent, clock);
    assert.equal(result.posted, false);
    assert.match(result.reason, /edited/);
    assert.equal(fixture.state.posts.length, 0);
});

test("only canonical same-target Actions-bot receipts are excluded from evidence", async () => {
    const fixture = await statusFixture();
    const id = await reserveStatus(fixture);
    await publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, id, clock);
    const original = fixture.state.thread.comments.find(comment => comment.author.__typename === "Bot");
    for (const change of [
        comment => { comment.author = { id: "another-bot", login: "another-bot", __typename: "Bot" }; },
        comment => { comment.author = { id: "user", login: OWNER.login, __typename: "User" }; },
        comment => { comment.body = "A new requirement.\n\n" + comment.body; },
        comment => { comment.url = `${REPO_URL}/issues/76#issuecomment-99`; },
    ]) {
        const altered = structuredClone(original);
        change(altered);
        fixture.state.thread.comments = [fixture.state.comments.get("42"), altered];
        assert.notEqual(snapshotHash(await readThread(fixture.github, fixture.state.target)), fixture.prepared.snapshotHash);
    }
    for (const body of [fixture.bundle.body, renderAcceptance({ ...fixture.bundle, draft: proposalCandidate() })]) {
        fixture.state.thread.comments = [fixture.state.comments.get("42"), fixture.state.comment("actual-result", body, "github-actions", "Bot")];
        assert.notEqual(snapshotHash(await readThread(fixture.github, fixture.state.target)), fixture.prepared.snapshotHash);
    }
});

test("uncertain receipt creation never duplicates a write or recreates a deleted receipt", async () => {
    for (const persisted of [false, true]) {
        const fixture = await statusFixture();
        const id = await reserveStatus(fixture);
        fixture.state.postError = new Error("Connection lost");
        fixture.state.persistBeforeError = persisted;
        await assert.rejects(() => publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, id, clock),
            /outcome is uncertain/);
        if (persisted) {
            assert.equal((await checkStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, clock)).shouldWrite, false);
            fixture.state.thread.comments = fixture.state.thread.comments.filter(comment => comment.author.__typename !== "Bot");
        }
        await assert.rejects(() => checkStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, clock),
            /previous status-write intent/);
        assert.equal(fixture.state.posts.length, 1);
    }
});

test("edited receipts are not overwritten and incomplete write history fails closed", async () => {
    const fixture = await statusFixture();
    await publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, await reserveStatus(fixture), clock);
    fixture.state.thread.comments.find(comment => comment.author.__typename === "Bot").body += "Owner annotation";
    await assert.rejects(() => checkStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, clock), /edited or is invalid/);
    assert.equal(fixture.state.posts.length, 1);
    assert.equal(fixture.state.updates.length, 0);

    const missing = await statusFixture();
    missing.github.rest.actions.listArtifactsForRepo = async () => ({ data: { total_count: 1, artifacts: [] } });
    await assert.rejects(() => checkStatus(missing.github, missing.status.context, missing.status.env, missing.bundle, clock), /history/);
    assert.equal(missing.state.posts.length, 0);
});

test("an uncertain receipt update is not retried blindly", async () => {
    for (const persisted of [false, true]) {
        const fixture = await statusFixture();
        await publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, await reserveStatus(fixture), clock);
        fixture.state.producerRun.run_attempt = 2;
        fixture.state.producerRun.run_started_at = "2026-10-30T00:40:00Z";
        fixture.state.producerRun.conclusion = "failure";
        fixture.status.context.payload.workflow_run.run_attempt = 2;
        const id = await reserveStatus(fixture, 602);
        fixture.state.updateError = new Error("Connection lost");
        fixture.state.persistUpdateBeforeError = persisted;
        await assert.rejects(() => publishStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, id, clock),
            /outcome is uncertain/);
        if (persisted) {
            assert.equal((await checkStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, clock)).shouldWrite, false);
        } else {
            await assert.rejects(() => checkStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, clock),
                /previous status-write intent/);
        }
        assert.equal(fixture.state.posts.length, 1);
        assert.equal(fixture.state.updates.length, 1);
    }
});

for (const kind of ["issue", "discussion"]) {
    test(`${kind}: a newer attempt cannot bypass an unresolved update to the same receipt`, async () => {
        const fixture = await statusFixture(kind);
        await publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, await reserveStatus(fixture), clock);
        fixture.state.producerRun.run_attempt = 2;
        fixture.state.producerRun.run_started_at = "2026-10-30T00:40:00Z";
        fixture.state.producerRun.conclusion = "failure";
        fixture.status.context.payload.workflow_run.run_attempt = 2;
        const id = await reserveStatus(fixture, 602);
        fixture.state.updateError = new Error("Connection lost before the outcome was known");
        await assert.rejects(() => publishStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, id, clock),
            /outcome is uncertain/);

        fixture.state.producerRun.run_attempt = 3;
        fixture.state.producerRun.run_started_at = "2026-10-30T00:50:00Z";
        fixture.state.producerRun.conclusion = "cancelled";
        fixture.status.context.payload.workflow_run.run_attempt = 3;
        fixture.status.context.runId = 301;
        fixture.state.updateError = null;
        await assert.rejects(() => checkStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, clock),
            /previous status-write intent/);
        fixture.state.artifacts.set(603, {
            ...structuredClone(fixture.state.artifacts.get(id)), id: 603,
            workflow_run: { id: 301, repository_id: REPOSITORY.id, head_sha: fixture.status.context.sha },
        });
        await assert.rejects(() => publishStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, 603, clock),
            /previous status-write attempt/);
        assert.equal(fixture.state.posts.length, 1);
        assert.equal(fixture.state.updates.length, 1);

        const receipt = fixture.state.thread.comments.find(comment => comment.author.__typename === "Bot");
        receipt.body = fixture.state.updates[0];
        receipt.lastEditedAt = NOW.toISOString();
        const confirmed = await reserveStatus(fixture, 604);
        assert.notEqual(fixture.state.artifacts.get(confirmed).name, fixture.state.artifacts.get(id).name);
        const result = await publishStatus(fixture.github, fixture.status.context, fixture.status.env, undefined, confirmed, clock);
        assert.equal(result.updated, true);
        assert.equal(result.outcome, "cancelled");
        assert.equal(fixture.state.updates.length, 2);
        assert.equal(fixture.state.posts.length, 1);
        assert.match(receipt.body, /attempts\/3/);
    });
}

test("managed receipts do not consume the existing 1,000-comment evidence allowance", async () => {
    const fixture = await statusFixture();
    fixture.state.thread.comments.push(...Array.from({ length: 998 }, (_, i) =>
        fixture.state.comment(`evidence-${i}`, "Recorded evidence.", "contributor")));
    const prepared = await prepareDraft(fixture.github, fixture.draftRun.context, fixture.draftRun.env, clock);
    fixture.bundle = await sealDraft(fixture.github, fixture.draftRun.context, fixture.draftRun.env, prepared, candidate(),
        () => new Date("2026-10-30T00:20:00Z"));
    await publishStatus(fixture.github, fixture.status.context, fixture.status.env, fixture.bundle, await reserveStatus(fixture), clock);
    const approval = fixture.event("publish", `/typechat publish 500:${fixture.bundle.bodyHash}`, "approval", 200);
    const checked = await checkPublication(fixture.github, approval.context, approval.env, fixture.bundle, clock);
    assert.equal(checked.shouldPost, true, "999 ordinary comments, a receipt, and an approval remain supported");
    fixture.state.thread.comments.push(fixture.state.comment("too-much-evidence", "One more requirement.", "contributor"));
    await assert.rejects(() => readThread(fixture.github, fixture.state.target), /1,000-comment limit/);
});

test("receipt collection remains bounded even when all bot messages are canonical", async () => {
    const fixture = await statusFixture();
    fixture.state.thread.comments.push(...Array.from({ length: 2000 }, (_, i) => fixture.state.comment(`status-${i}`,
        renderStatusReceipt({
            version: 1, kind: "issue", number: 75, commentId: i + 1, runId: 100, attempt: 1,
            started: Date.parse("2026-10-30T00:01:00Z"), action: "draft", outcome: "input", result: "",
        }), "github-actions", "Bot")));
    await assert.rejects(() => readThread(fixture.github, fixture.state.target), /2,000-comment receipt collection/);
});

test("receipts do not consume the existing evidence byte budget", async () => {
    const fixture = setup();
    fixture.state.thread.comments.push(...Array.from({ length: 5 }, (_, i) =>
        fixture.state.comment(`large-evidence-${i}`, "x".repeat(200000), "contributor")));
    const baseline = snapshotHash(await readThread(fixture.github, fixture.state.target));
    fixture.state.thread.comments.push(...Array.from({ length: 200 }, (_, i) => fixture.state.comment(`receipt-${i}`,
        renderStatusReceipt({
            version: 1, kind: "issue", number: 75, commentId: i + 1, runId: 100, attempt: 1,
            started: Date.parse("2026-10-30T00:01:00Z"), action: "draft", outcome: "input", result: "",
        }), "github-actions", "Bot")));
    const thread = await readThread(fixture.github, fixture.state.target);
    assert.ok(Buffer.byteLength(JSON.stringify(thread)) > 1048576);
    assert.equal(snapshotHash(thread), baseline);
    fixture.state.thread.comments.push(fixture.state.comment("excess-evidence", "x".repeat(200000), "contributor"));
    await assert.rejects(() => readThread(fixture.github, fixture.state.target), /bounded context|1 MiB/);
});

test("expired artifacts and old commands cannot become new ready receipts", async () => {
    const expired = await statusFixture();
    expired.state.artifacts.get(500).expired = true;
    const result = await publishStatus(expired.github, expired.status.context, expired.status.env, undefined,
        await reserveStatus(expired), clock);
    assert.equal(result.outcome, "unavailable");

    const old = await statusFixture();
    old.state.producerRun.run_attempt = 2;
    old.state.producerRun.run_started_at = "2026-11-07T00:00:00Z";
    old.state.producerRun.conclusion = "failure";
    old.status.context.payload.workflow_run.run_attempt = 2;
    await assert.rejects(() => checkStatus(old.github, old.status.context, old.status.env, undefined,
        () => new Date("2026-11-07T01:00:00Z")), /old command/);
    assert.equal(old.state.posts.length, 0);

    const managed = await statusFixture();
    await publishStatus(managed.github, managed.status.context, managed.status.env, managed.bundle, await reserveStatus(managed), clock);
    managed.state.producerRun.run_attempt = 2;
    managed.state.producerRun.run_started_at = "2026-11-07T00:00:00Z";
    managed.state.producerRun.conclusion = "failure";
    managed.status.context.payload.workflow_run.run_attempt = 2;
    await assert.rejects(() => checkStatus(managed.github, managed.status.context, managed.status.env, undefined,
        () => new Date("2026-11-07T01:00:00Z")), /old command/);
    assert.equal(managed.state.updates.length, 0);
});

for (const kind of ["issue", "discussion"]) {
    test(`${kind}: completion workflow scripts authenticate, reserve, and report a result once`, async t => {
        const workflow = parse(fs.readFileSync(new URL("../../.github/workflows/discussion-status.yml", import.meta.url), "utf8"));
        const fixture = await statusFixture(kind);
        const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-status-workflow-"));
        const savedEnvironment = { ...process.env };
        const summaries = [];
        const require = createRequire(import.meta.url);
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        t.mock.timers.enable({ apis: ["Date"], now: NOW.getTime() });
        try {
            Object.assign(process.env, {
                ...fixture.status.env,
                GITHUB_WORKSPACE: fileURLToPath(new URL("../../", import.meta.url)),
                RUNNER_TEMP: temporary,
            });
            const steps = workflow.jobs[`${kind}_status`].steps;
            async function execute(id, environment = {}) {
                Object.assign(process.env, environment);
                const outputs = {};
                const summary = {
                    text: "",
                    addHeading(text) { this.text += text; return this; },
                    addRaw(text) { this.text += text; return this; },
                    addLink(text, url) { this.text += `${text}: ${url}`; return this; },
                    async write() { summaries.push(this.text); },
                };
                const core = {
                    summary, notice() {}, setOutput(name, value) { outputs[name] = value; },
                    setFailed(message) { assert.fail(message); },
                };
                await new AsyncFunction("require", "github", "context", "core", steps.find(step => step.id === id).with.script)(
                    require, fixture.github, fixture.status.context, core);
                return outputs;
            }
            const identified = await execute("identify");
            assert.deepEqual(identified, { eligible: "true", source_run_id: "100", artifact_id: "500" });
            writeJson(path.join(temporary, "typechat-status-draft"), "sealed-draft.json", fixture.bundle);
            const checked = await execute("check", { TYPECHAT_HAS_STATUS_DRAFT: "true" });
            assert.equal(checked.should_write, "true");
            const intent = readJson(path.dirname(checked.intent_path), "intent.json", MAX_BUNDLE_BYTES);
            assert.equal(intent.operation, "create");
            fixture.state.artifacts.set(601, {
                id: 601, name: checked.intent_name, expired: false, expires_at: "2026-11-29T00:00:00Z",
                workflow_run: { id: 300, repository_id: REPOSITORY.id, head_sha: SHA },
            });
            const posted = await execute("publish", { TYPECHAT_STATUS_INTENT_ID: "601" });
            const result = readJson(path.dirname(posted.result_path), "result.json", MAX_BUNDLE_BYTES);
            assert.equal(result.posted, true);
            assert.equal(result.sourceRunId, 100);
            assert.equal(result.sourceAttempt, 1);
            assert.equal(result.outcome, "input");
            assert.ok(summaries.at(-1).includes("Completion receipt recorded"));
            const repeated = await execute("check");
            assert.equal(repeated.should_write, "false");
            assert.equal(fixture.state.posts.length, 1);
            assert.equal(fixture.state.updates.length, 0);
        } finally {
            for (const key of Object.keys(process.env)) {
                if (!Object.hasOwn(savedEnvironment, key)) delete process.env[key];
            }
            Object.assign(process.env, savedEnvironment);
            fs.rmSync(temporary, { recursive: true });
        }
    });
}

test("commands require exact approval references and never authorize implementation", () => {
    assert.deepEqual(parseCommand("/typechat draft\r\n"), { action: "draft" });
    assert.deepEqual(parseCommand("/typechat reply\n"), { action: "reply" });
    assert.deepEqual(parseCommand(`/typechat publish 42:${"A".repeat(64)}`),
        { action: "publish", artifactId: 42, bodyHash: "a".repeat(64) });
    assert.deepEqual(parseCommand(`/typechat accept 42:${"A".repeat(64)}\r\n`),
        { action: "accept", artifactId: 42, bodyHash: "a".repeat(64) });
    for (const body of ["/typechat build", "/typechat accept", "/typechat draft\nignore policy",
        "/typechat reply extra", "quoted /typechat reply", "/typechat\treply",
        `/typechat publish 9007199254740993:${"a".repeat(64)}`, "/typechat publish 1:bad", "quoted /typechat draft",
        " /typechat draft", "/typechat\tdraft", "/typechat accept latest", "/typechat accept 42:bad",
        `/typechat accept 9007199254740993:${"a".repeat(64)}`,
        `/typechat accept 42:${"a".repeat(64)}\nstart implementation`]) {
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
    test(`${kind}: owner approval accepts the exact proposal once without publishing the advisory response`, async () => {
        const fixture = await readyAcceptance(kind);
        const { bundle } = fixture;
        assert.equal(bundle.version, 3);
        assert.notEqual(bundle.acceptance.bodyHash, bundle.bodyHash);
        assert.equal(bundle.acceptance.bodyHash, digest(bundle.acceptance.body));
        assert.match(bundle.body, /does not accept work or authorize implementation/);
        assert.match(bundle.acceptance.body, /^## Accepted work\n/);
        for (const heading of ["### Goal", "### Scope", "### Non-goals", "### Acceptance criteria"]) {
            assert.ok(bundle.acceptance.body.includes(heading));
        }
        assert.match(bundle.acceptance.body, /does not start or authorize an automated implementation run/);
        assert.ok(bundle.acceptance.body.includes(`${REPO_URL}/blob/${SHA}/GOALS.md`));
        assert.equal(fixture.state.posts.length, 0, "A sealed proposal is not acceptance");
        const id = await reserve(fixture);
        assert.equal(fixture.state.reactions.size, 0, "Approval and reservation alone are not confirmed acceptance");
        assert.equal(fixture.state.artifacts.get(id).name, `${INTENT_PREFIX}accept-500`);
        const result = await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, bundle, id, clock);
        assert.equal(result.posted, true);
        assert.equal(result.bodyHash, bundle.acceptance.bodyHash);
        assert.deepEqual(fixture.state.posts, [bundle.acceptance.body]);
        assert.deepEqual([...fixture.state.reactions], ["approval"]);
        const repeated = await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, bundle, id, clock);
        assert.equal(repeated.posted, false);
        assert.equal(repeated.bodyHash, bundle.acceptance.bodyHash);
        assert.deepEqual([...fixture.state.reactions], ["approval"]);
        const anotherApproval = fixture.event("accept", `/typechat accept 500:${bundle.acceptance.bodyHash}`, "another-approval", 201);
        const checked = await checkPublication(fixture.github, anotherApproval.context, anotherApproval.env, bundle, clock);
        assert.deepEqual(checked, { shouldPost: false, url: result.url });
        assert.equal(fixture.state.posts.length, 1);
        assert.deepEqual([...fixture.state.reactions], ["approval", "another-approval"]);
    });

    test(`${kind}: publishing a draft with a proposal still does not accept work`, async () => {
        const fixture = await ready(kind, undefined, proposalCandidate());
        const id = await reserve(fixture);
        await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, id, clock);
        assert.deepEqual(fixture.state.posts, [fixture.bundle.body]);
        assert.equal(fixture.state.reactions.size, 0);
        assert.ok(!fixture.state.posts[0].includes("typechat-work-acceptance:"));
        const acceptance = fixture.event("accept", `/typechat accept 500:${fixture.bundle.acceptance.bodyHash}`, "acceptance", 201);
        await assert.rejects(() => checkPublication(fixture.github, acceptance.context, acceptance.env, fixture.bundle, clock),
            /target context changed/);
        assert.equal(fixture.state.posts.length, 1, "A posted response changes the evidence; accepting work needs a fresh draft");
    });
}

test("acceptance reaction failures recover without duplicating or editing accepted work", async () => {
    for (const kind of ["issue", "discussion"]) {
        const fixture = await readyAcceptance(kind);
        const id = await reserve(fixture);
        fixture.state.reactionError = new Error("Reaction service unavailable");
        await assert.rejects(() => publishDraft(fixture.github, fixture.publication.context, fixture.publication.env,
            fixture.bundle, id, clock), /Acceptance is recorded, but its confirmation reaction failed/);
        assert.deepEqual(fixture.state.posts, [fixture.bundle.acceptance.body]);
        assert.equal(fixture.state.reactions.size, 0);
        const accepted = fixture.state.thread.comments.find(comment => comment.author.id === ACTIONS_BOT_ID);
        const before = structuredClone(accepted);
        fixture.state.reactionError = null;
        const checked = await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env,
            fixture.bundle, clock);
        assert.deepEqual(checked, { shouldPost: false, url: accepted.url });
        assert.deepEqual(accepted, before);
        assert.deepEqual([...fixture.state.reactions], ["approval"]);
        const repeated = await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env,
            fixture.bundle, id, clock);
        assert.equal(repeated.posted, false);
        assert.equal(fixture.state.posts.length, 1);
        assert.equal(fixture.state.reactions.size, 1);
    }
});

test("acceptance confirmation verifies the reaction target and content", async () => {
    for (const response of [
        {},
        { addReaction: { subject: { id: "another-comment" }, reaction: { content: "THUMBS_UP" } } },
        { addReaction: { subject: { id: "approval" }, reaction: { content: "ROCKET" } } },
    ]) {
        const fixture = await readyAcceptance();
        const id = await reserve(fixture);
        fixture.state.reactionResponse = response;
        await assert.rejects(() => publishDraft(fixture.github, fixture.publication.context, fixture.publication.env,
            fixture.bundle, id, clock), /Acceptance is recorded, but its confirmation reaction failed/);
        assert.equal(fixture.state.posts.length, 1);
        fixture.state.reactionResponse = null;
        assert.equal((await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env,
            fixture.bundle, clock)).shouldPost, false);
        assert.equal(fixture.state.posts.length, 1);
    }
});

test("an acceptance confirmed during the final write recheck acknowledges without another post", async () => {
    const fixture = await readyAcceptance();
    const id = await reserve(fixture);
    fixture.state.onHistory = () => {
        fixture.state.onHistory = null;
        const existing = fixture.state.comment("concurrent-record", fixture.bundle.acceptance.body, "github-actions", "Bot");
        existing.url = `${fixture.state.target.url}#issuecomment-10001`;
        fixture.state.thread.comments.push(existing);
        fixture.state.comments.set(existing.id, existing);
    };
    const result = await publishDraft(fixture.github, fixture.publication.context, fixture.publication.env,
        fixture.bundle, id, clock);
    assert.equal(result.posted, false);
    assert.equal(fixture.state.posts.length, 0);
    assert.deepEqual([...fixture.state.reactions], ["approval"]);
});

test("response and acceptance approval hashes cannot be exchanged", async () => {
    for (const action of ["publish", "accept"]) {
        const fixture = await readyAcceptance();
        const wrongHash = action === "accept" ? fixture.bundle.bodyHash : fixture.bundle.acceptance.bodyHash;
        const approval = fixture.event(action, `/typechat ${action} 500:${wrongHash}`, "approval", 200);
        await assert.rejects(() => checkPublication(fixture.github, approval.context, approval.env, fixture.bundle, clock),
            /exact rendered draft/);
        assert.equal(fixture.state.posts.length, 0);
        assert.equal(fixture.state.reactions.size, 0);
    }
});

test("an unresolved draft or a direct reply cannot become an acceptance record", async () => {
    const preview = await ready();
    assert.equal(preview.bundle.acceptance, null);
    const approval = preview.event("accept", `/typechat accept 500:${preview.bundle.bodyHash}`, "approval", 200);
    await assert.rejects(() => checkPublication(preview.github, approval.context, approval.env, preview.bundle, clock),
        /not eligible for acceptance/);
    const reply = await readyReply("issue", proposalCandidate());
    assert.equal(reply.bundle.acceptance, null);
    reply.state.producerRun.status = "completed";
    reply.state.producerRun.conclusion = "success";
    const otherApproval = reply.event("accept", `/typechat accept 500:${digest(renderAcceptance(reply.bundle))}`, "approval", 200);
    await assert.rejects(() => checkPublication(reply.github, otherApproval.context, otherApproval.env, reply.bundle, clock),
        /publication mode/);
    assert.equal(preview.state.posts.length + reply.state.posts.length, 0);
});

test("acceptance requires the owner and the target-scoped default-branch manual publisher", async () => {
    for (const change of [
        request => { request.context.payload.sender.id = 7; },
        request => { request.context.payload.comment.user.id = 7; },
        request => { request.context.payload.sender.type = "Bot"; },
        request => { request.env.GITHUB_TRIGGERING_ACTOR = "someone-else"; },
        request => { request.env.TYPECHAT_PUBLISH_KIND = "discussion"; },
        request => { request.env.GITHUB_WORKFLOW_REF = `microsoft/TypeChat/${DRAFT_WORKFLOW}@refs/heads/main`; },
        request => { request.env.GITHUB_REF = "refs/pull/1/merge"; },
        request => { request.context.payload.issue.pull_request = {}; },
    ]) {
        const fixture = await readyAcceptance();
        change(fixture.publication);
        await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env,
            fixture.bundle, clock));
        assert.equal(fixture.state.posts.length, 0);
        assert.equal(fixture.state.reactions.size, 0);
    }
});

test("acceptance integrity binds the exact proposal, criteria, provenance, and rendered record", async () => {
    for (const change of [
        bundle => { bundle.draft.proposal.goal = "A different goal."; },
        bundle => { bundle.draft.proposal.scope.push("Additional unapproved work."); },
        bundle => { bundle.draft.proposal.nonGoals = ["Different boundaries."]; },
        bundle => { bundle.draft.suggestedCriteria = ["Different completion criteria."]; },
        bundle => { bundle.draft.scopeReason = "A different policy assessment."; },
        bundle => { bundle.acceptance.body += "Additional unapproved terms."; },
        bundle => { bundle.acceptance.bodyHash = "f".repeat(64); },
        bundle => { bundle.acceptance.extra = true; },
        bundle => { bundle.createdAt = "2026-10-30T00:21:00Z"; },
        bundle => { bundle.version = 2; },
    ]) {
        const fixture = await readyAcceptance();
        change(fixture.bundle);
        await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env,
            fixture.bundle, clock), /sealed response|protocol version/);
        assert.equal(fixture.state.posts.length, 0);
    }
});

test("acceptance retries retain uncertain-write protection and never recreate edited or removed records", async () => {
    for (const persisted of [false, true]) {
        const fixture = await readyAcceptance();
        const id = await reserve(fixture);
        fixture.state.postError = new Error("Connection lost");
        fixture.state.persistBeforeError = persisted;
        await assert.rejects(() => publishDraft(fixture.github, fixture.publication.context, fixture.publication.env,
            fixture.bundle, id, clock), /outcome is uncertain/);
        assert.equal(fixture.state.reactions.size, 0);
        if (persisted) {
            const existing = await checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock);
            assert.equal(existing.shouldPost, false);
            assert.deepEqual([...fixture.state.reactions], ["approval"]);
            fixture.state.thread.comments.find(comment => comment.author.__typename === "Bot").body += "Edited terms";
            await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env,
                fixture.bundle, clock), /different content/);
            fixture.state.thread.comments = fixture.state.thread.comments.filter(comment => comment.author.__typename !== "Bot");
        }
        await assert.rejects(() => checkPublication(fixture.github, fixture.publication.context, fixture.publication.env,
            fixture.bundle, clock), /previous publication intent/);
        assert.equal(fixture.state.posts.length, 1);
    }
});

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
            /sealed response or acceptance preview changed/);
        assert.equal(fixture.state.posts.length, 0);
    }
});

test("writer-only proposal recovery rejects an unsuccessful producer before reserving or posting", async () => {
    for (const conclusion of ["failure", "cancelled"]) {
        const fixture = await readyReply("issue", publicCandidate(), "propose");
        fixture.state.producerRun.status = "completed";
        fixture.state.producerRun.conclusion = conclusion;
        fixture.publication.env.GITHUB_RUN_ATTEMPT = "2";
        assert.match(fixture.bundle.body, /\/typechat accept P1/);
        await assert.rejects(checkPublication(fixture.github, fixture.publication.context,
            fixture.publication.env, fixture.bundle, clock), /unsuccessful producing attempt/);
        await assert.rejects(publishDraft(fixture.github, fixture.publication.context,
            fixture.publication.env, fixture.bundle, 501, clock), /unsuccessful producing attempt/);
        assert.equal(fixture.state.posts.length, 0);
        assert.equal(fixture.state.artifacts.size, 1);
        assert.equal(fixture.state.historyRequests.length, 0);
    }
});

test("a fresh proposal after rejected writer recovery can be published and accepted", async () => {
    const failed = await readyReply("issue", publicCandidate(), "propose");
    failed.state.producerRun.status = "completed";
    failed.state.producerRun.conclusion = "failure";
    failed.publication.env.GITHUB_RUN_ATTEMPT = "2";
    await assert.rejects(checkPublication(failed.github, failed.publication.context,
        failed.publication.env, failed.bundle, clock), /unsuccessful producing attempt/);

    const fresh = await secondProposal(failed);
    assert.equal(fresh.bundle.proposalVersion, 1);
    assert.equal(fresh.bundle.producer.runId, 101);
    assert.equal(fresh.state.posts.length, 1);
    assert.match(fresh.state.posts[0], /\/typechat accept P1/);
    fresh.publication = fresh.event("accept", "/typechat accept P1", "approve-fresh", 200);
    fresh.state.postedAt = "2026-10-30T00:46:00Z";
    const result = await publishDraft(fresh.github, fresh.publication.context,
        fresh.publication.env, fresh.bundle, await reserve(fresh, 701), clock);
    assert.equal(result.posted, true);
    assert.equal(fresh.state.posts.length, 2);
    assert.match(fresh.state.posts[1], /^## Accepted work\n/);
    assert.match(fresh.state.posts[1], /Proposal \*\*P1\*\*/);
    assert.match(fresh.state.posts[1], /actions\/runs\/101\/attempts\/1/);
    assert.equal(fresh.state.reactions.has("approve-fresh"), true);
});

test("writer-only recovery preserves advisory proposals without acceptance authority", async () => {
    const draft = { ...publicCandidate(), readiness: "needs_clarification",
        readinessReason: "The compatibility baseline needs agreement.",
        questions: ["Which compatibility baseline is required?"] };
    const fixture = await readyReply("issue", draft, "propose");
    fixture.state.producerRun.status = "completed";
    fixture.state.producerRun.conclusion = "failure";
    fixture.publication.env.GITHUB_RUN_ATTEMPT = "2";
    fixture.state.postedAt = "2026-10-30T00:42:00Z";
    const result = await publishDraft(fixture.github, fixture.publication.context,
        fixture.publication.env, fixture.bundle, await reserve(fixture), clock);
    assert.equal(result.posted, true);
    assert.equal(fixture.bundle.acceptance, null);
    assert.match(fixture.state.posts[0], /Not eligible for acceptance/);
    assert.doesNotMatch(fixture.state.posts[0], /\/typechat accept P1/);
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

test("acceptance proposals require bounded, explicit terms, testable criteria, and no unresolved decisions", () => {
    assert.deepEqual(validateDraft(proposalCandidate()), proposalCandidate());
    for (const change of [
        draft => { draft.proposal = null; },
        draft => { draft.proposal.goal = ""; },
        draft => { draft.proposal.goal = "x".repeat(2001); },
        draft => { draft.proposal.scope = []; },
        draft => { draft.proposal.nonGoals = []; },
        draft => { draft.proposal.scope = Array(11).fill("An extra scope item."); },
        draft => { draft.proposal.nonGoals = ["x".repeat(801)]; },
        draft => { draft.proposal.accepted = true; },
        draft => { draft.proposal = { goal: "Incomplete terms." }; },
        draft => { draft.suggestedCriteria = []; },
        draft => { draft.questions = ["An unresolved question."]; },
        draft => { draft.readiness = "blocked_by_evidence"; },
        draft => { draft.readiness = "existing_pr_review"; },
        draft => { draft.scope = "conflicts_with_direction"; },
    ]) {
        const draft = proposalCandidate();
        change(draft);
        assert.throws(() => validateDraft(draft));
    }
    for (const field of ["goal", "scope", "nonGoals"]) {
        for (const text of ["First line\nSecond line", "<!-- hidden -->", "Read https://example.invalid"]) {
            const draft = proposalCandidate();
            draft.proposal[field] = field === "goal" ? text : [text];
            assert.throws(() => validateDraft(draft));
        }
    }
});

test("acceptance rendering escapes proposal text, preserves contribution references, and enforces the byte limit", async () => {
    const fixture = await readyAcceptance();
    const draft = proposalCandidate();
    draft.proposal.goal = "@someone & <text> is not markup.";
    draft.pullRequests = [{ number: 80, headSha: SHA, updatedAt: NOW.toISOString() }];
    const rendered = renderAcceptance({ ...fixture.bundle, draft: validateDraft(draft) });
    assert.ok(rendered.includes("\\@someone &amp; &lt;text&gt; is not markup\\."));
    assert.ok(rendered.includes(`[#80](${REPO_URL}/pull/80)`));
    assert.ok(rendered.includes(`${REPO_URL}/commit/${SHA}`));

    draft.pullRequests = [];
    draft.proposal.goal = "x";
    draft.proposal.scope = Array(10).fill("x".repeat(800));
    draft.proposal.nonGoals = Array(10).fill("x".repeat(800));
    draft.suggestedCriteria = Array(8).fill("x".repeat(800));
    const minimum = renderAcceptance({ ...fixture.bundle, draft: validateDraft(draft) });
    const goalLength = MAX_COMMENT_BYTES - Buffer.byteLength(minimum) + 1;
    assert.ok(goalLength > 0 && goalLength < 2000);
    draft.proposal.goal = "x".repeat(goalLength);
    assert.equal(Buffer.byteLength(renderAcceptance({ ...fixture.bundle, draft: validateDraft(draft) })), MAX_COMMENT_BYTES);
    draft.proposal.goal += "x";
    assert.throws(() => renderAcceptance({ ...fixture.bundle, draft: validateDraft(draft) }), /comment-size limit/);
    draft.proposal.goal = "\u00e9".repeat(goalLength);
    assert.throws(() => renderAcceptance({ ...fixture.bundle, draft: validateDraft(draft) }), /comment-size limit/);
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
    ["wrong digest", fixture => {
        const action = parseCommand(fixture.publication.context.payload.comment.body).action;
        fixture.publication.context.payload.comment.body = `/typechat ${action} 500:${"f".repeat(64)}`;
        fixture.state.comments.get("approval").body = fixture.publication.context.payload.comment.body;
    }],
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
    ["another user's acceptance command", fixture => {
        fixture.state.thread.comments.push(fixture.state.comment("foreign-approval", `/typechat accept 500:${"a".repeat(64)}`, "contributor"));
    }],
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
    for (const mode of ["publish", "accept"]) {
        test(`${mode} rejects ${name} without posting`, async () => {
            const fixture = mode === "accept" ? await readyAcceptance() : await ready();
            change(fixture);
            await assert.rejects(checkPublication(fixture.github, fixture.publication.context, fixture.publication.env, fixture.bundle, clock));
            assert.equal(fixture.state.posts.length, 0);
        });
    }
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

for (const [kind, mode] of [
    ["issue", "draft"], ["discussion", "draft"], ["issue", "reply"], ["discussion", "reply"],
    ["issue", "accept"], ["discussion", "accept"],
]) {
    test(`${kind}/${mode}: the authored workflow scripts prepare, preview, and publish the exact checked bytes`, async t => {
        const workflowDirectory = new URL("../../.github/workflows/", import.meta.url);
        const markdown = fs.readFileSync(new URL("discussion-draft.md", workflowDirectory), "utf8");
        const draftWorkflow = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)[1]);
        const publisher = parse(fs.readFileSync(new URL("publish-discussion-draft.yml", workflowDirectory), "utf8"));
        const fixture = setup(kind);
        const draftMode = mode === "accept" ? "draft" : mode;
        const draftRun = fixture.event(draftMode, `/typechat ${draftMode}`);
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
            writeJson(candidateDirectory, "discussion-draft.json", mode === "accept" ? proposalCandidate() : candidate());
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
            const seal = sealing.find(step => step.id === "seal");
            for (const outputTypes of [undefined, "", "report_missing_data", "noop,report_missing_data",
                "report_incomplete", "noop,report_incomplete", "report_missing_tool", "unknown"]) {
                delete process.env.TYPECHAT_AGENT_OUTPUT_TYPES;
                await assert.rejects(execute(seal, draftRun, outputTypes === undefined ? {} : {
                    TYPECHAT_AGENT_OUTPUT_TYPES: outputTypes,
                }), /Only a successful native noop completion can be sealed/);
                assert.equal(fs.existsSync(path.join(temporary, "typechat-sealed-draft")), false,
                    `${outputTypes} must not produce a sealed artifact despite a valid candidate and successful scan`);
                assert.equal(fixture.state.posts.length, 0);
            }
            const sealed = await execute(seal, draftRun, { TYPECHAT_AGENT_OUTPUT_TYPES: "noop" });
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
            assert.equal(summaries.at(-1).includes(`/typechat publish 500:${bundle.bodyHash}`), mode !== "reply");
            assert.ok(summaries.at(-1).includes(bundle.body));
            assert.ok(summaries.at(-1).includes("Assessment and evidence (not posted)"));
            const approved = mode === "accept" ? bundle.acceptance : bundle;
            if (mode === "accept") {
                assert.ok(summaries.at(-1).includes(`/typechat accept 500:${approved.bodyHash}`));
                assert.ok(summaries.at(-1).includes("Work acceptance preview (not yet accepted)"));
                assert.ok(summaries.at(-1).includes(approved.body));
            } else {
                assert.ok(!summaries.at(-1).includes("/typechat accept "));
            }

            t.mock.timers.setTime(NOW.getTime());
            const action = mode === "accept" ? "accept" : "publish";
            const publication = mode === "reply" ?
                { context: structuredClone(draftRun.context), env: { ...draftRun.env } } :
                fixture.event(action, `/typechat ${action} 500:${approved.bodyHash}`, "approval", 200);
            const publishJob = mode === "reply" ? draftWorkflow.jobs[`reply_${kind}`] : publisher.jobs[`publish_${kind}`];
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
                step.name === (mode === "reply" ? "Download the checked reply" : "Download the approved sealed draft")));
            fs.mkdirSync(bundleDirectory);
            fs.copyFileSync(sealed.path, path.join(bundleDirectory, "sealed-draft.json"));
            const checked = await execute(steps.find(step => step.id === "check"), publication);
            assert.equal(checked.should_post, "true");
            assert.equal(JSON.parse(fs.readFileSync(checked.intent_path, "utf8")).bodyHash, approved.bodyHash);
            assert.equal(fixture.state.posts.length, 0, "Approval and intent preparation alone must not post");
            fixture.state.artifacts.set(501, {
                id: 501, name: checked.intent_name, expired: false,
                created_at: NOW.toISOString(), expires_at: "2026-11-29T00:00:00Z",
                workflow_run: { id: publication.context.runId, repository_id: REPOSITORY.id, head_sha: SHA },
            });
            const published = await execute(steps.find(step => step.id === "publish"), publication, {
                TYPECHAT_INTENT_ARTIFACT_ID: "501",
            });
            assert.deepEqual(fixture.state.posts, [approved.body]);
            const receipt = JSON.parse(fs.readFileSync(published.receipt_path, "utf8"));
            assert.equal(receipt.posted, true);
            assert.equal(receipt.bodyHash, approved.bodyHash);
            assert.equal(receipt.authorization, mode === "reply" ? "reply" : action);
            assert.ok(summaries.at(-1).includes(mode === "accept" ? "Work accepted" :
                mode === "reply" ? "Requested reply posted" : "Approved draft published"));
            const repeated = await execute(steps.find(step => step.id === "check"), publication);
            assert.equal(repeated.should_post, "false");
            assert.equal(fixture.state.posts.length, 1);
            if (mode === "accept") {
                assert.ok(summaries.at(-1).includes("Work already accepted"));
            }
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

test("a file-only candidate and its acceptance proposal are included in detection and bound to the exact scanned bytes", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-file-only-scan-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const candidateDirectory = path.join(directory, "candidate");
    const detectionDirectory = path.join(directory, "detection");
    const draft = proposalCandidate();
    writeJson(candidateDirectory, "discussion-draft.json", draft);
    const file = path.join(candidateDirectory, "discussion-draft.json");
    const text = fs.readFileSync(file, "utf8");
    const hash = stageCandidateForDetection(candidateDirectory, detectionDirectory);
    const input = JSON.parse(fs.readFileSync(path.join(detectionDirectory, "agent_output.json"), "utf8"));
    assert.deepEqual(input.items, [{ type: "discussion-draft", content: text }]);
    assert.equal(hash, digest(text));
    const scan = createCandidateScan(hash, "success", 100, "1");
    assert.deepEqual(readDetectedDraft(candidateDirectory, scan, 100, "1"), draft);
    fs.appendFileSync(file, "\n");
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), draft);
    assert.throws(() => readDetectedDraft(candidateDirectory, scan, 100, "1"), /differs from the threat-scanned artifact/);
    draft.proposal.scope.push("Unscanned scope.");
    fs.writeFileSync(file, JSON.stringify(draft) + "\n");
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
