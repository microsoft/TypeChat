// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const OWNER = Object.freeze({ login: "robgruen", id: 25374553 });
export const REPOSITORY = Object.freeze({ owner: "microsoft", repo: "TypeChat", id: 655948482 });
export const ACTIONS_BOT_ID = "MDM6Qm90NDE4OTgyODI=";
export const DRAFT_WORKFLOW = ".github/workflows/discussion-draft.lock.yml";
export const PUBLISH_WORKFLOW = ".github/workflows/publish-discussion-draft.yml";
export const STATUS_WORKFLOW = ".github/workflows/discussion-status.yml";
export const DRAFT_ARTIFACT_PREFIX = "typechat-discussion-draft-";
export const INTENT_PREFIX = "typechat-publish-intent-";
export const STATUS_INTENT_PREFIX = "typechat-status-intent-";
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CONTEXT_BYTES = 1048576;
export const MAX_DRAFT_BYTES = 65536;
export const MAX_BUNDLE_BYTES = 131072;
export const MAX_COMMENT_BYTES = 24000;
export const CONTROL_PATHS = Object.freeze([
    "GOALS.md",
    "AUTOMATION.md",
    ".github/copilot-instructions.md",
    ".github/workflows/discussion-draft.md",
    DRAFT_WORKFLOW,
    PUBLISH_WORKFLOW,
    STATUS_WORKFLOW,
    ".github/workflows/shared/read-only-analysis.md",
    "tools/discussion-draft.mjs",
]);

const REPO_NAME = `${REPOSITORY.owner}/${REPOSITORY.repo}`;
const REPO_URL = `https://github.com/${REPO_NAME}`;
const API_REPO = Object.freeze({ owner: REPOSITORY.owner, repo: REPOSITORY.repo });
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SCOPES = ["in_scope", "needs_owner_decision", "conflicts_with_direction"];
const READINESS = ["needs_clarification", "ready_for_owner_decision", "existing_pr_review", "blocked_by_evidence", "needs_owner_scope_decision"];
const STATUS_OUTCOMES = ["ready", "input", "outdated", "unavailable", "failed", "cancelled", "invalid", "unconfirmed", "replied"];

function requireValue(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function object(value, message) {
    requireValue(value !== null && typeof value === "object" && !Array.isArray(value), message);
    return value;
}

function string(value, message, max = 200000) {
    requireValue(typeof value === "string" && value.length <= max, message);
    return value;
}

function identifier(value, message) {
    requireValue(typeof value === "string" && value.length > 0 && value.length <= 256, message);
    return value;
}

function integer(value, message) {
    requireValue(Number.isSafeInteger(value) && value > 0, message);
    return value;
}

function timestamp(value, message) {
    requireValue(typeof value === "string" && Number.isFinite(Date.parse(value)), message);
    return value;
}

function exactKeys(value, keys, message) {
    object(value, message);
    requireValue(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), message);
}

function canonical(value) {
    if (Array.isArray(value)) {
        return value.map(canonical);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
}

export function digest(value) {
    return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(canonical(value))).digest("hex");
}

function equal(left, right) {
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function lf(text) {
    return text.replace(/\r\n/g, "\n");
}

function actor(value) {
    if (value === null) {
        return null;
    }
    object(value, "Missing comment author metadata.");
    return {
        id: identifier(value.id, "Missing comment author ID."),
        login: identifier(value.login, "Missing comment author login."),
        type: identifier(value.__typename, "Missing comment author type."),
    };
}

export function parseCommand(body) {
    string(body, "Missing command text.", 2000);
    const request = /^\/typechat (draft|reply|propose)\s*$/.exec(body);
    if (request) {
        return { action: request[1] };
    }
    const proposal = /^\/typechat accept P([1-9][0-9]*)\s*$/.exec(body);
    if (proposal) {
        return { action: "accept", proposalVersion: integer(Number(proposal[1]), "Invalid proposal version.") };
    }
    const publish = /^\/typechat (publish|accept) ([1-9][0-9]*):([a-fA-F0-9]{64})\s*$/.exec(body);
    if (publish) {
        return {
            action: publish[1],
            artifactId: integer(Number(publish[2]), "The draft artifact ID is not a safe positive integer."),
            bodyHash: publish[3].toLowerCase(),
        };
    }
    throw new Error("Invalid command. Use /typechat reply, /typechat propose, /typechat accept P<number>, " +
        "/typechat draft, /typechat publish <artifact-id>:<sha256>, or /typechat accept <artifact-id>:<sha256>.");
}

function isControlComment(comment) {
    return (comment.author?.type === "User" && comment.author.login === OWNER.login &&
        (/^\/typechat (draft|reply|propose)\s*$/.test(comment.body) ||
            /^\/typechat accept P[1-9][0-9]*\s*$/.test(comment.body) ||
            /^\/typechat (publish|accept) [1-9][0-9]*:[a-fA-F0-9]{64}\s*$/.test(comment.body))) ||
        statusReceiptData(comment) !== null;
}

export function authorize(context, env, action) {
    const event = object(context.payload, "Missing GitHub event.");
    requireValue(["issue_comment", "discussion_comment"].includes(context.eventName) && event.action === "created",
        "Only newly created issue or discussion comments can authorize this workflow.");
    requireValue(event.repository?.id === REPOSITORY.id && event.repository.full_name === REPO_NAME &&
        event.repository.private === false, "This pilot only operates in the public microsoft/TypeChat repository.");
    requireValue(event.sender?.type === "User" && event.sender.id === OWNER.id &&
        event.comment?.user?.type === "User" && event.comment.user.id === OWNER.id &&
        context.actor === OWNER.login && env.GITHUB_TRIGGERING_ACTOR === OWNER.login,
    "Only the current human project owner can start or rerun this workflow.");
    const branch = identifier(event.repository.default_branch, "Missing default branch.");
    const workflow = ["publish", "accept"].includes(action) ? PUBLISH_WORKFLOW : DRAFT_WORKFLOW;
    requireValue(env.GITHUB_WORKFLOW_REF === `${REPO_NAME}/${workflow}@refs/heads/${branch}` &&
        env.GITHUB_REF === `refs/heads/${branch}` && SHA1.test(context.sha),
    "The workflow must use trusted default-branch code.");
    const kind = context.eventName === "issue_comment" ? "issue" : "discussion";
    if (["publish", "accept", "reply", "propose"].includes(action)) {
        requireValue(env.TYPECHAT_PUBLISH_KIND === kind, "The publishing job does not have the target-specific authority.");
    }
    const item = object(kind === "issue" ? event.issue : event.discussion, "Missing target metadata.");
    requireValue(!item.pull_request, "Pull request comments are not supported by this discussion pilot.");
    const number = integer(item.number, "Invalid target number.");
    const target = {
        kind,
        number,
        id: identifier(item.node_id, "Missing target node ID."),
        url: `${REPO_URL}/${kind === "issue" ? "issues" : "discussions"}/${number}`,
    };
    requireValue(item.html_url === target.url, "The target URL does not match this repository.");
    const command = parseCommand(event.comment.body);
    requireValue(action === "draft" ? ["draft", "reply", "propose"].includes(command.action) : command.action === action,
        "The command does not authorize this operation.");
    requireValue(command.action !== "propose" || kind === "issue", "Development proposals must use an Issue thread.");
    return {
        target,
        command,
        branch,
        commentId: identifier(event.comment.node_id, "Missing command comment ID."),
        commandBody: lf(event.comment.body),
        commandCreatedAt: timestamp(event.comment.created_at, "Missing command creation time."),
        runId: integer(Number(context.runId), "Invalid workflow run ID."),
        attempt: integer(Number(env.GITHUB_RUN_ATTEMPT), "Invalid workflow attempt."),
        commit: context.sha,
    };
}

const COMMENT_FIELDS = `
    id url body createdAt updatedAt lastEditedAt isMinimized
    author { login __typename ... on Node { id } }
`;

function validateRepository(value) {
    requireValue(value?.nameWithOwner === REPO_NAME && value.isPrivate === false,
        "The returned resource does not belong to the public target repository.");
}

function normalizeComment(value, parentId = null) {
    object(value, "Missing comment data.");
    requireValue(typeof value.isMinimized === "boolean", "Missing comment visibility state.");
    requireValue(value.lastEditedAt === null || Number.isFinite(Date.parse(value.lastEditedAt)), "Invalid comment edit time.");
    return {
        id: identifier(value.id, "Missing comment ID."),
        url: identifier(value.url, "Missing comment URL."),
        body: lf(string(value.body, "Missing comment body.")),
        createdAt: timestamp(value.createdAt, "Missing comment creation time."),
        updatedAt: timestamp(value.updatedAt, "Missing comment update time."),
        lastEditedAt: value.lastEditedAt,
        minimized: value.isMinimized,
        author: actor(value.author),
        parentId,
    };
}

function connection(value) {
    object(value, "Missing pagination data.");
    requireValue(Array.isArray(value.nodes) && Number.isSafeInteger(value.totalCount) && value.totalCount >= 0 &&
        typeof value.pageInfo?.hasNextPage === "boolean", "Incomplete pagination evidence.");
    if (value.pageInfo.hasNextPage) {
        identifier(value.pageInfo.endCursor, "Missing continuation cursor.");
    }
    return value;
}

function normalizeTarget(value, target) {
    object(value, "The target was not returned.");
    validateRepository(value.repository);
    requireValue(value.id === target.id && value.number === target.number && value.url === target.url,
        "The returned target does not match the command.");
    requireValue(typeof value.locked === "boolean", "Missing target lock state.");
    const state = target.kind === "issue" ? value.state : value.closed === true ? "CLOSED" : value.closed === false ? "OPEN" : null;
    requireValue(["OPEN", "CLOSED"].includes(state), "Missing target state.");
    requireValue(value.lastEditedAt === null || Number.isFinite(Date.parse(value.lastEditedAt)), "Invalid target edit time.");
    return {
        ...target,
        title: string(value.title, "Missing target title.", 1000),
        body: lf(string(value.body, "Missing target body.")),
        state,
        locked: value.locked,
        lastEditedAt: value.lastEditedAt,
        author: actor(value.author),
    };
}

export async function readThread(github, target) {
    requireValue(["issue", "discussion"].includes(target.kind), "Unsupported target kind.");
    const discussion = target.kind === "discussion";
    const replies = discussion ? `replies(first:100) { totalCount pageInfo { hasNextPage endCursor } nodes { ${COMMENT_FIELDS} } }` : "";
    const query = `query DiscussionPilotThread($owner:String!,$repo:String!,$number:Int!,$after:String) {
      repository(owner:$owner,name:$repo) {
        target:${discussion ? "discussion" : "issue"}(number:$number) {
          id number url title body locked lastEditedAt ${discussion ? "closed" : "state"}
          author { login __typename ... on Node { id } } repository { nameWithOwner isPrivate }
          comments(first:100,after:$after) { totalCount pageInfo { hasNextPage endCursor }
            nodes { ${COMMENT_FIELDS} ${replies} }
          }
        }
      }
    }`;
    let core;
    let after = null;
    let total;
    let topCount = 0;
    const comments = [];
    const cursors = new Set();
    let commentBytes = 0;
    let evidenceBytes = 0;
    let evidenceCount = 0;
    function appendComment(value, parentId) {
        const comment = normalizeComment(value, parentId);
        const bytes = Buffer.byteLength(JSON.stringify(comment));
        commentBytes += bytes;
        requireValue(comments.length < 2000 && commentBytes <= MAX_CONTEXT_BYTES * 2,
            "This thread exceeds the bounded 2,000-comment receipt collection limit.");
        if (!statusReceiptData(comment)) {
            evidenceBytes += bytes;
            evidenceCount++;
        }
        requireValue(evidenceCount <= 1000, "This thread exceeds the pilot's 1,000-comment limit.");
        requireValue(evidenceBytes <= MAX_CONTEXT_BYTES,
            "This thread exceeds the pilot's bounded context limit.");
        comments.push(comment);
    }
    do {
        const result = await github.graphql(query, { ...API_REPO, number: target.number, after });
        const item = result.repository?.target;
        const current = normalizeTarget(item, target);
        requireValue(!core || equal(core, current), "The target changed while its context was being read. Request a new draft.");
        core = current;
        const page = connection(item.comments);
        requireValue(total === undefined || total === page.totalCount, "The discussion changed during pagination. Request a new draft.");
        total = page.totalCount;
        requireValue(total <= 2000, "This thread exceeds the bounded 2,000-comment receipt collection limit.");
        for (const node of page.nodes) {
            appendComment(node, null);
            topCount++;
            if (discussion) {
                let replyPage = connection(node.replies);
                const replyTotal = replyPage.totalCount;
                let replyCount = 0;
                const replyCursors = new Set();
                do {
                    requireValue(replyPage.totalCount === replyTotal, "Replies changed during pagination. Request a new draft.");
                    for (const reply of replyPage.nodes) {
                        appendComment(reply, node.id);
                        replyCount++;
                    }
                    requireValue(comments.length <= 2000, "This thread exceeds the bounded 2,000-comment receipt collection limit.");
                    if (!replyPage.pageInfo.hasNextPage) {
                        break;
                    }
                    const cursor = replyPage.pageInfo.endCursor;
                    requireValue(!replyCursors.has(cursor), "Repeated reply cursor; context coverage is incomplete.");
                    replyCursors.add(cursor);
                    const more = await github.graphql(`query DiscussionPilotReplies($id:ID!,$after:String!) {
                      node(id:$id) { ... on DiscussionComment {
                        replies(first:100,after:$after) { totalCount pageInfo { hasNextPage endCursor } nodes { ${COMMENT_FIELDS} } }
                      } }
                    }`, { id: node.id, after: cursor });
                    replyPage = connection(more.node?.replies);
                } while (true);
                requireValue(replyCount === replyTotal, "Reply coverage is incomplete.");
            }
        }
        requireValue(comments.length <= 2000, "This thread exceeds the bounded 2,000-comment receipt collection limit.");
        after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
        if (after) {
            requireValue(!cursors.has(after), "Repeated comment cursor; context coverage is incomplete.");
            cursors.add(after);
        }
    } while (after);
    requireValue(topCount === total && new Set(comments.map(comment => comment.id)).size === comments.length,
        "Comment coverage is incomplete or duplicated.");
    comments.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const thread = { target: core, comments };
    requireValue(Buffer.byteLength(JSON.stringify(thread)) <= MAX_CONTEXT_BYTES * 2, "This receipt collection exceeds its 2 MiB limit.");
    requireValue(Buffer.byteLength(JSON.stringify({ target: core, comments: comments.filter(comment => !statusReceiptData(comment)) })) <=
        MAX_CONTEXT_BYTES, "This context exceeds the pilot's 1 MiB limit.");
    return thread;
}

export function snapshotHash(thread) {
    return digest({ target: thread.target, comments: thread.comments.filter(comment => !isControlComment(comment)) });
}

async function verifyOwnerCommand(github, request) {
    const result = await github.graphql(`query DiscussionPilotCommand($id:ID!) {
      node(id:$id) {
        __typename
        ... on IssueComment {
          ${COMMENT_FIELDS}
          issue { id number url repository { nameWithOwner isPrivate } }
          pullRequest { id }
        }
        ... on DiscussionComment {
          ${COMMENT_FIELDS}
          discussion { id number url repository { nameWithOwner isPrivate } }
        }
      }
    }`, { id: request.commentId });
    const node = object(result.node, "The command comment is unavailable or was deleted.");
    const expectedType = request.target.kind === "issue" ? "IssueComment" : "DiscussionComment";
    requireValue(node.__typename === expectedType && !node.pullRequest, "The command is on the wrong kind of resource.");
    const item = request.target.kind === "issue" ? node.issue : node.discussion;
    validateRepository(item?.repository);
    requireValue(item.id === request.target.id && item.number === request.target.number && item.url === request.target.url,
        "The command comment belongs to a different target.");
    const comment = normalizeComment(node);
    requireValue(comment.id === request.commentId && comment.author?.type === "User" && comment.author.login === OWNER.login &&
        !comment.minimized, "The command must remain a visible comment from the human owner.");
    // Metadata updates can change updatedAt without editing the command text.
    requireValue(lf(comment.body) === request.commandBody && Date.parse(comment.createdAt) === Date.parse(request.commandCreatedAt) &&
        comment.lastEditedAt === null,
    "Edited or withdrawn commands cannot authorize work. Post a new command.");
    return comment;
}

export async function verifyCommand(github, request) {
    const comment = await verifyOwnerCommand(github, request);
    requireValue(equal(parseCommand(comment.body), request.command), "The command changed after the event.");
    return comment;
}

export async function readControls(github, ref, paths = CONTROL_PATHS) {
    const result = await github.rest.git.getTree({ ...API_REPO, tree_sha: ref, recursive: "1" });
    const tree = result.data;
    requireValue(tree?.truncated === false && Array.isArray(tree.tree), "The control-file tree is incomplete.");
    const fingerprints = {};
    for (const file of paths) {
        const entry = tree.tree.find(item => item.path === file);
        requireValue(entry?.type === "blob" && entry.mode === "100644" && SHA1.test(entry.sha),
            `Missing or invalid trusted control file: ${file}`);
        fingerprints[file] = entry.sha;
    }
    const response = await github.rest.repos.getContent({ ...API_REPO, path: "GOALS.md", ref });
    const policy = response.data;
    requireValue(policy?.type === "file" && policy.sha === fingerprints["GOALS.md"] && policy.encoding === "base64" &&
        typeof policy.content === "string" && policy.size <= 65536, "The trusted scope policy is unavailable.");
    const encoded = policy.content.replace(/\s/g, "");
    requireValue(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded), "Invalid policy encoding.");
    const policyText = Buffer.from(encoded, "base64").toString("utf8");
    requireValue(/^The project direction owner is \*\*@robgruen\*\*\./m.test(policyText),
        "The active owner policy no longer matches this pilot. Update the owner configuration through review.");
    return { fingerprints, policyText };
}

async function currentControls(github) {
    const repo = (await github.rest.repos.get(API_REPO)).data;
    requireValue(repo.id === REPOSITORY.id && repo.full_name === REPO_NAME && repo.private === false, "Unexpected repository.");
    const branch = identifier(repo.default_branch, "Missing default branch.");
    const head = (await github.rest.repos.getBranch({ ...API_REPO, branch })).data.commit?.sha;
    requireValue(SHA1.test(head), "Default-branch revision is unavailable.");
    return { commit: head, branch, ...await readControls(github, head) };
}

function requireOpen(thread) {
    requireValue(thread.target.state === "OPEN" && thread.target.locked === false,
        "The target is closed or locked. No new draft or comment will be published.");
}

function producer(request) {
    return { runId: request.runId, attempt: request.attempt, commit: request.commit, workflow: DRAFT_WORKFLOW };
}

function originalRequest(request) {
    return {
        commentId: request.commentId,
        commandBody: request.commandBody,
        commandCreatedAt: request.commandCreatedAt,
    };
}

function replyKey(request) {
    return digest({ target: request.target, request: originalRequest(request) });
}

function replyIntentName(request) {
    return `${INTENT_PREFIX}${request.command.action === "propose" ? "propose" : "reply"}-${replyKey(request)}`;
}

function existingReply(thread, request) {
    const marker = request.command.action === "propose" ?
        `<!-- typechat-discussion-propose:v1:${replyKey(request)} -->` :
        `<!-- typechat-discussion-reply:v2:${replyKey(request)} -->`;
    const matches = thread.comments.filter(comment => comment.parentId === null &&
        comment.author?.type === "Bot" && comment.author.id === ACTIONS_BOT_ID && comment.body.includes(marker));
    requireValue(matches.length <= 1, "More than one reply exists for this command. Human inspection is required.");
    if (matches.length) {
        requireValue(matches[0].url.startsWith(request.target.url + "#"), "The existing reply belongs to a different target.");
        if (request.command.action === "propose") {
            requireValue(!matches[0].minimized && matches[0].lastEditedAt === null,
                "The published proposal was edited or hidden. Human inspection is required.");
        }
        return matches[0];
    }
    return null;
}

function requireFreshReply(request, now) {
    const age = now.getTime() - Date.parse(request.commandCreatedAt);
    requireValue(age >= 0 && age < MAX_AGE_MS,
        `The ${request.command.action === "propose" ? "proposal" : "reply"} command has expired or has an invalid time. Post a new command.`);
}

function publicProposals(thread) {
    const proposals = [];
    for (const comment of thread.comments) {
        if (comment.author?.type !== "Bot" || comment.author.id !== ACTIONS_BOT_ID ||
            !comment.body.includes("<!-- typechat-work-proposal:v1:")) continue;
        const markers = [...comment.body.matchAll(/^<!-- typechat-work-proposal:v1:([1-9][0-9]*):([1-9][0-9]*):([1-9][0-9]*):(none|[a-f0-9]{64}):([a-f0-9]{64}) -->$/gm)];
        requireValue(markers.length === 1 && comment.parentId === null && !comment.minimized &&
            comment.lastEditedAt === null && comment.url.startsWith(thread.target.url + "#"),
        "A public proposal is malformed, edited, or hidden. Human inspection is required.");
        const [, version, runId, attempt, bodyHash, marker] = markers[0];
        const proposalVersion = integer(Number(version), "Invalid public proposal version.");
        requireValue(comment.body.startsWith(`## Work proposal P${proposalVersion}\n`), "The proposal version was changed.");
        proposals.push({ comment, proposalVersion, runId: integer(Number(runId), "Invalid proposal run."),
            attempt: integer(Number(attempt), "Invalid proposal attempt."), bodyHash, marker });
    }
    requireValue(new Set(proposals.map(value => value.proposalVersion)).size === proposals.length,
        "Duplicate public proposal versions require human inspection.");
    return proposals;
}

export function findPublicProposal(thread, version, acceptedBody) {
    integer(version, "Invalid proposal version.");
    const proposal = publicProposals(thread).find(value => value.proposalVersion === version);
    requireValue(proposal, `Public proposal P${version} is unavailable. Request /typechat propose.`);
    if (acceptedBody !== undefined) {
        const sections = proposal.comment.body.split("\n\n");
        for (const section of acceptedBody.split("\n\n").slice(2, 6)) {
            const heading = section.split("\n")[0] + "\n";
            requireValue(sections.filter(value => value.startsWith(heading)).length === 1 && sections.includes(section),
                "The accepted terms differ from the visible public proposal.");
        }
        requireValue(!sections.some(section => section.startsWith("### Open questions\n")),
            "The public proposal still has unresolved questions.");
    }
    return proposal;
}

function nextProposalVersion(thread) {
    return integer(Math.max(0, ...publicProposals(thread).map(value => value.proposalVersion)) + 1,
        "The proposal version exceeds the safe integer limit.");
}

export async function prepareDraft(github, context, env, clock = () => new Date()) {
    const request = authorize(context, env, "draft");
    await verifyCommand(github, request);
    const controls = await readControls(github, request.commit);
    const thread = await readThread(github, request.target);
    if (["reply", "propose"].includes(request.command.action)) {
        const current = await currentControls(github);
        requireValue(equal(current.fingerprints, controls.fingerprints), request.command.action === "propose" ?
            "Policy or workflow code changed. Post a new /typechat propose command." :
            "Policy or workflow code changed. Post a new reply command.");
        const existing = existingReply(thread, request);
        if (existing) {
            return { alreadyReplied: true, url: existing.url };
        }
        requireFreshReply(request, clock());
        requireValue(!await priorIntent(github, replyIntentName(request)),
            "A previous reply intent exists without a confirmed comment. Inspect that run; automatic retry is blocked.");
        if (request.command.action === "propose") {
            for (const comment of thread.comments) {
                if (comment.id === request.commentId || comment.author?.type !== "User" ||
                    comment.author.login !== OWNER.login || !/^\/typechat propose\s*$/.test(comment.body)) continue;
                const earlier = { target: request.target, command: { action: "propose" }, commentId: comment.id,
                    commandBody: comment.body, commandCreatedAt: comment.createdAt };
                requireValue(existingReply(thread, earlier) || !await priorIntent(github, replyIntentName(earlier)),
                    "An earlier proposal write is unconfirmed. Inspect it before requesting another round.");
            }
        }
    }
    requireOpen(thread);
    const prepared = {
        version: 1,
        target: request.target,
        request: originalRequest(request),
        producer: producer(request),
        fingerprints: controls.fingerprints,
        snapshotHash: snapshotHash(thread),
        policyText: controls.policyText,
        thread: { target: thread.target, comments: thread.comments.filter(comment => !isControlComment(comment)) },
        ...(request.command.action === "propose" ? { proposalVersion: nextProposalVersion(thread) } : {}),
    };
    requireValue(Buffer.byteLength(JSON.stringify(prepared, null, 2) + "\n") <= MAX_CONTEXT_BYTES,
        "The prepared context exceeds the pilot size limit.");
    return prepared;
}

function plain(value, field, max = 1000) {
    string(value, `Invalid draft field: ${field}.`, max);
    requireValue(value.trim() === value && value.length > 0 && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value),
        `${field} must be nonempty, single-line plain text.`);
    requireValue(!/\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|<!--|--!?>/i.test(value),
        `${field} must not contain URLs or hidden markup; use structured PR references.`);
    return value;
}

function textList(value, field, max = 10) {
    requireValue(Array.isArray(value) && value.length <= max, `Invalid draft list: ${field}.`);
    return value.map(item => plain(item, field, 800));
}

export function validateDraft(value, mode = "draft") {
    const proposing = mode === "propose";
    exactKeys(value, ["reply", "summary", "scope", "scopeReason", "readiness", "readinessReason", "questions",
        "existingRequirements", "suggestedCriteria", "proposal", "limitations", "pullRequests",
        ...(proposing ? ["changes"] : [])], "Unexpected draft fields.");
    requireValue(SCOPES.includes(value.scope) && READINESS.includes(value.readiness), "Unsupported scope or readiness recommendation.");
    const result = {
        reply: [],
        summary: plain(value.summary, "summary", 2000),
        scope: value.scope,
        scopeReason: plain(value.scopeReason, "scopeReason"),
        readiness: value.readiness,
        readinessReason: plain(value.readinessReason, "readinessReason"),
        questions: textList(value.questions, "questions"),
        existingRequirements: textList(value.existingRequirements, "existingRequirements"),
        suggestedCriteria: textList(value.suggestedCriteria, "suggestedCriteria"),
        proposal: null,
        limitations: textList(value.limitations, "limitations"),
        pullRequests: [],
        ...(proposing ? { changes: textList(value.changes, "changes") } : {}),
    };
    requireValue(!proposing || result.changes.length > 0, "A public proposal must explain changes since the previous round.");
    requireValue(Array.isArray(value.reply) && value.reply.length > 0 && value.reply.length <= 6,
        "The reply must contain one to six plain-text paragraphs.");
    result.reply = value.reply.map(item => plain(item, "reply", 2000));
    requireValue(Array.isArray(value.pullRequests) && value.pullRequests.length <= 8, "Too many PR references.");
    for (const reference of value.pullRequests) {
        exactKeys(reference, ["number", "headSha", "updatedAt"], "Invalid PR reference.");
        integer(reference.number, "Invalid PR reference number.");
        requireValue(SHA1.test(reference.headSha), "A PR reference needs its inspected full commit SHA.");
        timestamp(reference.updatedAt, "A PR reference needs its inspected update time.");
        result.pullRequests.push({ ...reference });
    }
    requireValue(new Set(result.pullRequests.map(item => item.number)).size === result.pullRequests.length, "Duplicate PR references.");
    if (result.scope !== "in_scope") {
        requireValue(result.readiness === "needs_owner_scope_decision" && result.questions.length > 0 &&
            result.suggestedCriteria.length === 0, "Unresolved direction cannot become implementation criteria or accepted work.");
    }
    if (value.proposal !== null) {
        requireValue(result.scope === "in_scope" &&
            (result.readiness === "ready_for_owner_decision" && result.questions.length === 0 ||
                proposing && result.readiness === "needs_clarification"),
        "Only ready, in-scope work without unresolved questions can have an acceptance proposal; discussion proposals may state open questions.");
        exactKeys(value.proposal, ["goal", "scope", "nonGoals"], "Unexpected acceptance-proposal fields.");
        result.proposal = {
            goal: plain(value.proposal.goal, "proposal.goal", 2000),
            scope: textList(value.proposal.scope, "proposal.scope"),
            nonGoals: textList(value.proposal.nonGoals, "proposal.nonGoals"),
        };
        requireValue(result.proposal.scope.length > 0 && result.proposal.nonGoals.length > 0 &&
            (!proposing || result.suggestedCriteria.length > 0),
            "An acceptance proposal needs explicit scope and non-goals.");
    }
    if (result.readiness === "ready_for_owner_decision") {
        requireValue(result.scope === "in_scope" && result.questions.length === 0 &&
            result.suggestedCriteria.length > 0 && result.proposal !== null,
        "A readiness recommendation needs an explicit in-scope proposal, testable criteria, and no unresolved questions.");
    }
    requireValue(!proposing || result.scope !== "in_scope" ||
        !["needs_clarification", "ready_for_owner_decision"].includes(result.readiness) || result.proposal !== null,
    "An in-scope proposal round must recommend explicit terms; use blocked_by_evidence when evidence prevents a recommendation.");
    return result;
}

function markdown(text) {
    return text.replace(/&/g, "&amp;")
        .replace(/[<>]/g, character => character === "<" ? "&lt;" : "&gt;")
        .replace(/[\\`*_{}\[\]()#+\-.!|~@]/g, "\\$&");
}

export function renderDraft(bundle) {
    if (parseCommand(bundle.request.commandBody).action === "propose") return renderProposal(bundle);
    const { draft } = bundle;
    const sections = draft.reply.map(markdown);
    if (draft.pullRequests.length) {
        sections.push(`Related contributions: ${draft.pullRequests.map(item =>
            `[#${item.number}](${REPO_URL}/pull/${item.number})`).join(", ")}.`);
    }
    sections.push("*Automated response requested by the project owner. This does not accept work or authorize implementation.*");
    sections.push(`<!-- typechat-discussion-draft:v3:${bundle.marker} -->`);
    if (parseCommand(bundle.request.commandBody).action === "reply") {
        const key = digest({ target: bundle.target, request: bundle.request });
        // Keep command-level deduplication stable when the sealed-bundle schema changes.
        sections.push(`<!-- typechat-discussion-reply:v2:${key} -->`);
    }
    const body = sections.join("\n\n") + "\n";
    requireValue(Buffer.byteLength(body) <= MAX_COMMENT_BYTES, "The rendered reply exceeds the comment-size limit.");
    return body;
}

function renderProposal(bundle) {
    const { draft, producer, proposalVersion } = bundle;
    integer(proposalVersion, "Missing public proposal version.");
    const sections = [`## Work proposal P${proposalVersion}`,
        "*Proposal for community discussion, not accepted work or permission to build.*",
        `### Recommendation\n${draft.reply.map(markdown).join("\n\n")}`,
        `### Changes since the previous proposal\n${draft.changes.map(item => `- ${markdown(item)}`).join("\n")}`,
        `### Direction and readiness\n${markdown(draft.scopeReason)}\n\n${markdown(draft.readinessReason)}`];
    if (draft.proposal) {
        sections.push(`### Goal\n${markdown(draft.proposal.goal)}`);
        for (const [title, items] of [["Scope", draft.proposal.scope], ["Non-goals", draft.proposal.nonGoals],
            ["Acceptance criteria", draft.suggestedCriteria]]) {
            sections.push(`### ${title}\n${items.map(item => `- ${markdown(item)}`).join("\n")}`);
        }
    }
    for (const [title, items] of [["Open questions", draft.questions], ["Evidence limits and assumptions", draft.limitations]]) {
        if (items.length) sections.push(`### ${title}\n${items.map(item => `- ${markdown(item)}`).join("\n")}`);
    }
    if (draft.pullRequests.length) {
        sections.push(`Related contributions: ${draft.pullRequests.map(item =>
            `[#${item.number}](${REPO_URL}/pull/${item.number})`).join(", ")}.`);
    }
    const acceptance = acceptanceFor(bundle);
    sections.push(acceptance ?
        `The owner may accept these exact terms with \`/typechat accept P${proposalVersion}\`. Acceptance does not start a build.` :
        "Not eligible for acceptance yet. Discuss the remaining questions and request `/typechat propose` again.");
    sections.push(`[Proposal run](${REPO_URL}/actions/runs/${producer.runId}/attempts/${producer.attempt}) | ` +
        `[Approved scope policy](${REPO_URL}/blob/${producer.commit}/GOALS.md)`);
    sections.push(`<!-- typechat-work-proposal:v1:${proposalVersion}:${producer.runId}:${producer.attempt}:${acceptance?.bodyHash ?? "none"}:${bundle.marker} -->`);
    sections.push(`<!-- typechat-discussion-propose:v1:${digest({ target: bundle.target, request: bundle.request })} -->`);
    const body = sections.join("\n\n") + "\n";
    requireValue(Buffer.byteLength(body) <= MAX_COMMENT_BYTES, "The rendered proposal exceeds the comment-size limit.");
    return body;
}

export function renderAcceptance(bundle) {
    const { draft, target } = bundle;
    const proposal = object(draft.proposal, "This draft has no acceptance proposal.");
    const sections = [
        "## Accepted work",
        `Approved by the project owner, [${OWNER.login}](https://github.com/${OWNER.login}), for ` +
            `[${target.kind} #${target.number}](${target.url}).` +
            (bundle.proposalVersion ? ` Proposal **P${bundle.proposalVersion}**.` : ""),
        `### Goal\n${markdown(proposal.goal)}`,
    ];
    for (const [title, items] of [
        ["Scope", proposal.scope], ["Non-goals", proposal.nonGoals], ["Acceptance criteria", draft.suggestedCriteria],
    ]) {
        sections.push(`### ${title}\n${items.map(item => `- ${markdown(item)}`).join("\n")}`);
    }
    if (draft.pullRequests.length) {
        sections.push(`### Existing contributions\n${draft.pullRequests.map(item =>
            `- [#${item.number}](${REPO_URL}/pull/${item.number}) at [${item.headSha.slice(0, 7)}](${REPO_URL}/commit/${item.headSha})`).join("\n")}`);
    }
    sections.push(`[Proposal run](${REPO_URL}/actions/runs/${bundle.producer.runId}/attempts/${bundle.producer.attempt}) | ` +
        `[Approved scope policy](${REPO_URL}/blob/${bundle.producer.commit}/GOALS.md)`);
    sections.push("*This accepts the scope above. It does not start or authorize an automated implementation run, " +
        "increase any budget, or approve merging. Material scope changes require a new proposal and owner decision.*" +
        (bundle.proposalVersion ? `\nAfter separate owner authorization and pilot activation, use \`/typechat build P${bundle.proposalVersion}\`.` : ""));
    sections.push(`<!-- typechat-work-acceptance:v1:${bundle.marker} -->`);
    const body = sections.join("\n\n") + "\n";
    requireValue(Buffer.byteLength(body) <= MAX_COMMENT_BYTES, "The rendered acceptance exceeds the comment-size limit.");
    return body;
}

function acceptanceFor(bundle) {
    if (!["draft", "propose"].includes(parseCommand(bundle.request.commandBody).action) || bundle.draft.proposal === null ||
        bundle.draft.readiness !== "ready_for_owner_decision" || bundle.draft.questions.length !== 0) {
        return null;
    }
    const body = renderAcceptance(bundle);
    return { body, bodyHash: digest(body) };
}

export function renderAssessment(bundle) {
    const { draft, target } = bundle;
    const scope = { in_scope: "In scope", needs_owner_decision: "Needs owner decision", conflicts_with_direction: "Conflicts with direction" };
    const readiness = {
        needs_clarification: "Needs clarification",
        ready_for_owner_decision: "Ready for a human acceptance decision",
        existing_pr_review: "Review an existing contribution",
        blocked_by_evidence: "Needs more evidence",
        needs_owner_scope_decision: "Needs an owner scope decision",
    };
    const sections = [
        bundle.proposalVersion ? "## Proposal assessment (public terms shown above)" : "## Assessment and evidence (not posted)",
        markdown(draft.summary),
        `### Project direction\n${scope[draft.scope]}: ${markdown(draft.scopeReason)}`,
        `### Readiness recommendation\n${readiness[draft.readiness]}: ${markdown(draft.readinessReason)}`,
    ];
    if (draft.proposal) {
        sections.push(`### Proposed goal\n${markdown(draft.proposal.goal)}`);
        for (const [title, items] of [["Proposed scope", draft.proposal.scope], ["Proposed non-goals", draft.proposal.nonGoals]]) {
            sections.push(`### ${title}\n${items.map(item => `- ${markdown(item)}`).join("\n")}`);
        }
    }
    for (const [title, items] of [
        ["Questions", draft.questions], ["Recorded requirements", draft.existingRequirements],
        ["Suggested acceptance criteria", draft.suggestedCriteria], ["Evidence limits", draft.limitations],
    ]) {
        if (items.length) {
            sections.push(`### ${title}\n${items.map(item => `- ${markdown(item)}`).join("\n")}`);
        }
    }
    if (draft.pullRequests.length) {
        sections.push(`### Existing contributions\n${draft.pullRequests.map(item =>
            `- [#${item.number}](${REPO_URL}/pull/${item.number}) at [${item.headSha.slice(0, 7)}](${REPO_URL}/commit/${item.headSha})`).join("\n")}`);
    }
    sections.push(`No tests or proposed implementations were executed by this drafting workflow.\n\n` +
        `[Target ${target.kind} #${target.number}](${target.url}) · ` +
        `[Draft run](${REPO_URL}/actions/runs/${bundle.producer.runId}/attempts/${bundle.producer.attempt}) · ` +
        `[Scope policy](${REPO_URL}/blob/${bundle.producer.commit}/GOALS.md)`);
    return sections.join("\n\n") + "\n";
}

function markerFor(bundle) {
    return digest({
        target: bundle.target, producer: bundle.producer, snapshotHash: bundle.snapshotHash,
        request: bundle.request, createdAt: bundle.createdAt,
        fingerprints: bundle.fingerprints, draft: bundle.draft,
        ...(bundle.proposalVersion ? { proposalVersion: bundle.proposalVersion } : {}),
    });
}

async function changedReference(github, references) {
    for (const reference of references) {
        const pr = (await github.rest.pulls.get({ ...API_REPO, pull_number: reference.number })).data;
        if (pr.number !== reference.number || pr.base?.repo?.id !== REPOSITORY.id ||
            pr.head?.sha !== reference.headSha || pr.updated_at !== reference.updatedAt) {
            return reference.number;
        }
    }
    return null;
}

async function verifyReferences(github, references, mode = "draft") {
    const changed = await changedReference(github, references);
    requireValue(changed === null, `PR #${changed} changed or its inspected revision is unverified. ` +
        (mode === "propose" ? "Request /typechat propose." : "Request a new draft."));
}

export async function sealDraft(github, context, env, prepared, candidate, clock = () => new Date()) {
    const request = authorize(context, env, "draft");
    await verifyCommand(github, request);
    requireValue(prepared?.version === 1 && equal(prepared.target, request.target) &&
        equal(prepared.producer, producer(request)) && equal(prepared.request, originalRequest(request)),
    "The prepared context does not match this trusted run.");
    const expected = await readControls(github, request.commit);
    requireValue(equal(prepared.fingerprints, expected.fingerprints), "Prepared control fingerprints changed.");
    const current = await currentControls(github);
    requireValue(equal(current.fingerprints, prepared.fingerprints), request.command.action === "propose" ?
        "Policy or workflow code changed. Request /typechat propose." : "Policy or workflow code changed. Request a new draft.");
    const thread = await readThread(github, request.target);
    requireOpen(thread);
    requireValue(snapshotHash(thread) === prepared.snapshotHash, request.command.action === "propose" ?
        "The target discussion changed while proposing. Request /typechat propose." :
        "The target discussion changed while drafting. Request a new draft.");
    const proposing = request.command.action === "propose";
    const draft = validateDraft(candidate, request.command.action);
    if (proposing) {
        requireValue(prepared.proposalVersion === nextProposalVersion(thread),
            "The public proposal sequence changed. Request a new proposal.");
    }
    await verifyReferences(github, draft.pullRequests, request.command.action);
    const bundle = {
        version: proposing ? 4 : 3, target: request.target, request: originalRequest(request), producer: producer(request),
        fingerprints: prepared.fingerprints, snapshotHash: prepared.snapshotHash,
        createdAt: clock().toISOString(), draft,
        ...(proposing ? { proposalVersion: prepared.proposalVersion } : {}),
    };
    bundle.marker = markerFor(bundle);
    bundle.body = renderDraft(bundle);
    bundle.bodyHash = digest(bundle.body);
    bundle.acceptance = acceptanceFor(bundle);
    requireValue(Buffer.byteLength(JSON.stringify(bundle)) <= MAX_BUNDLE_BYTES, "The review bundle is too large.");
    return bundle;
}

function readArtifact(directory, filename, maximum) {
    const entries = fs.readdirSync(directory);
    requireValue(entries.length === 1 && entries[0] === filename, "Unexpected files in the downloaded artifact.");
    const file = path.join(directory, filename);
    const info = fs.lstatSync(file);
    requireValue(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= maximum,
        "The artifact must contain one bounded regular JSON file.");
    const bytes = fs.readFileSync(file);
    requireValue(isUtf8(bytes), "The artifact must contain UTF-8 JSON.");
    return bytes.toString("utf8");
}

function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error("The artifact does not contain valid JSON.");
        }
        throw error;
    }
}

export function readJson(directory, filename, maximum) {
    return parseJson(readArtifact(directory, filename, maximum));
}

export function stageCandidateForDetection(directory, detectionDirectory, mode = "draft") {
    const text = readArtifact(directory, "discussion-draft.json", MAX_DRAFT_BYTES);
    validateDraft(parseJson(text), mode);
    stageDetectionContent(detectionDirectory, "discussion-draft", text);
    return digest(text);
}

export function stageDetectionContent(detectionDirectory, type, content) {
    identifier(type, "Missing detection content type.");
    string(content, "Missing bounded detection content.", MAX_CONTEXT_BYTES);
    const outputPath = path.join(detectionDirectory, "agent_output.json");
    const output = fs.existsSync(outputPath) ? parseJson(fs.readFileSync(outputPath, "utf8")) : { items: [] };
    requireValue(output && Array.isArray(output.items), "The detector's agent output is malformed.");
    output.items.push({ type, content });
    fs.mkdirSync(detectionDirectory, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(output) + "\n");
}

export function createCandidateScan(hash, outcome, runId, attempt) {
    requireValue(typeof hash === "string" && SHA256.test(hash), "Missing candidate threat-scan hash.");
    requireValue(outcome === "success", "The candidate threat scan did not execute successfully.");
    return {
        version: 1, sha256: hash, outcome,
        runId: integer(Number(runId), "Invalid candidate scan run ID."),
        attempt: integer(Number(attempt), "Invalid candidate scan attempt."),
    };
}

export function readDetectedDraft(directory, scan, runId, attempt) {
    exactKeys(scan, ["version", "sha256", "outcome", "runId", "attempt"], "Missing or malformed candidate threat-scan binding.");
    requireValue(equal(scan, createCandidateScan(scan.sha256, scan.outcome, runId, attempt)),
        "The candidate threat-scan binding belongs to a different run or attempt.");
    const text = readArtifact(directory, "discussion-draft.json", MAX_DRAFT_BYTES);
    requireValue(digest(text) === scan.sha256, "The candidate differs from the threat-scanned artifact. Request a new draft.");
    return parseJson(text);
}

export function writeJson(directory, filename, value) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, filename), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}

export async function identifyPublication(github, context, env, clock = () => new Date()) {
    const action = parseCommand(context.payload?.comment?.body).action;
    requireValue(["publish", "accept", "reply", "propose"].includes(action), "This command does not authorize publication.");
    const directReply = ["reply", "propose"].includes(action);
    const request = authorize(context, env, action);
    let proposal = null;
    if (request.command.proposalVersion) {
        requireValue(request.target.kind === "issue", "Public development proposals must use an Issue.");
        proposal = findPublicProposal(await readThread(github, request.target), request.command.proposalVersion);
        requireValue(proposal.bodyHash !== "none", "This public proposal has unresolved questions or scope. Request another proposal.");
        requireValue(Date.parse(proposal.comment.createdAt) <= Date.parse(request.commandCreatedAt),
            "Acceptance cannot select a proposal published after the owner command.");
        const name = `${DRAFT_ARTIFACT_PREFIX}${proposal.attempt}`;
        const listing = (await github.rest.actions.listWorkflowRunArtifacts({
            ...API_REPO, run_id: proposal.runId, name, per_page: 2, page: 1,
        })).data;
        requireValue(listing?.total_count === 1 && listing.artifacts?.length === 1 && listing.artifacts[0].name === name,
            "The public proposal's sealed evidence is unavailable or ambiguous. Request a new proposal.");
        proposal.artifactId = integer(listing.artifacts[0].id, "Invalid proposal artifact.");
    }
    const artifactId = directReply ?
        integer(Number(env.TYPECHAT_DRAFT_ARTIFACT_ID), "Missing sealed reply artifact.") : request.command.artifactId;
    const selectedArtifactId = proposal?.artifactId ?? artifactId;
    const bodyHash = proposal?.bodyHash ?? (directReply ? env.TYPECHAT_DRAFT_BODY_SHA256 : request.command.bodyHash);
    requireValue(typeof bodyHash === "string" && SHA256.test(bodyHash), "Missing exact publication body hash.");
    if (directReply) {
        requireValue(env.TYPECHAT_AGENT_RESULT === "success" && env.TYPECHAT_SEAL_RESULT === "success" &&
            env.TYPECHAT_DETECTION_RESULT === "success" && env.TYPECHAT_DETECTION_RAN === "true" &&
            env.TYPECHAT_DETECTION_CONCLUSION === "success",
        "Direct replies require successful model execution, detection, and sealing.");
        requireFreshReply(request, clock());
    }
    await verifyCommand(github, request);
    const controls = await currentControls(github);
    const executing = await readControls(github, request.commit);
    requireValue(equal(executing.fingerprints, controls.fingerprints),
        "The publisher's trusted code changed while queued. Post a new command after reviewing the changes.");
    const artifact = (await github.rest.actions.getArtifact({ ...API_REPO, artifact_id: selectedArtifactId })).data;
    requireValue(artifact.id === selectedArtifactId && artifact.expired === false &&
        Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= MAX_BUNDLE_BYTES * 2,
    "The approved artifact is unavailable, expired, or too large.");
    const attemptMatch = new RegExp(`^${DRAFT_ARTIFACT_PREFIX}([1-9][0-9]*)$`).exec(artifact.name);
    requireValue(attemptMatch, "The artifact is not a sealed discussion draft.");
    const attempt = integer(Number(attemptMatch[1]), "Invalid producer attempt.");
    timestamp(artifact.created_at, "Missing artifact creation time.");
    timestamp(artifact.expires_at, "Missing artifact expiry.");
    if (directReply) {
        requireValue(artifact.workflow_run?.id === request.runId && attempt <= request.attempt &&
            artifact.workflow_run.head_sha === request.commit &&
            Date.parse(artifact.created_at) >= Date.parse(request.commandCreatedAt),
        "A direct reply must use the sealed output of this owner-commanded run.");
    } else {
        requireValue(Date.parse(request.commandCreatedAt) >= Date.parse(artifact.created_at),
            "Approval must be given after the sealed draft exists.");
    }
    let validUntil = Math.min(Date.parse(artifact.expires_at), Date.parse(artifact.created_at) + MAX_AGE_MS);
    if (directReply) {
        validUntil = Math.min(validUntil, Date.parse(request.commandCreatedAt) + MAX_AGE_MS);
    }
    const now = clock();
    requireValue(now.getTime() >= Date.parse(artifact.created_at) && now.getTime() < validUntil,
        proposal || action === "propose" ? "The proposal has expired. Request /typechat propose." :
            "The draft has expired. Request a new draft.");
    requireValue(artifact.workflow_run?.repository_id === REPOSITORY.id &&
        artifact.workflow_run.head_repository_id === REPOSITORY.id, "The artifact belongs to a different repository.");
    const runId = integer(artifact.workflow_run.id, "Missing producer run.");
    requireValue(!proposal || proposal.runId === runId && proposal.attempt === attempt,
        "The proposal's sealed evidence belongs to a different producer.");
    const run = (await github.rest.actions.getWorkflowRunAttempt({ ...API_REPO, run_id: runId, attempt_number: attempt })).data;
    const workflow = (await github.rest.actions.getWorkflow({ ...API_REPO, workflow_id: path.posix.basename(DRAFT_WORKFLOW) })).data;
    // Same-run replies use the seal's trusted artifact/hash and mandatory job results.
    // A writer-only rerun may inherit that seal from an earlier failed attempt.
    requireValue(run.id === runId && run.run_attempt === attempt && run.workflow_id === workflow.id &&
        [DRAFT_WORKFLOW, `${DRAFT_WORKFLOW}@refs/heads/${controls.branch}`].includes(run.path) &&
        (directReply ? ["in_progress", "completed"].includes(run.status) :
            run.status === "completed" && run.conclusion === "success") &&
        ["issue_comment", "discussion_comment"].includes(run.event) &&
        run.head_branch === controls.branch && run.head_sha === artifact.workflow_run.head_sha &&
        run.actor?.type === "User" && run.actor.id === OWNER.id &&
        run.triggering_actor?.type === "User" && run.triggering_actor.id === OWNER.id,
    "The artifact was not produced by an authorized default-branch drafting run with the required successful stages.");
    requireValue(SHA1.test(run.head_sha), "Invalid producer revision.");
    const produced = await readControls(github, run.head_sha);
    requireValue(equal(produced.fingerprints, controls.fingerprints), proposal || action === "propose" ?
        "The proposal was produced under older policy or automation code. Request /typechat propose." :
        "The artifact was produced under older policy or automation code. Request a new draft.");
    return { request, artifact, run, controls, validUntil, bodyHash, ...(proposal ? { proposal } : {}) };
}

function validateSealedDraft(bundle, evidence) {
    const proposing = parseCommand(bundle.request?.commandBody).action === "propose";
    exactKeys(bundle, ["version", "target", "request", "producer", "fingerprints", "snapshotHash", "createdAt", "draft",
        "marker", "body", "bodyHash", "acceptance", ...(proposing ? ["proposalVersion"] : [])], "Unexpected review-bundle fields.");
    requireValue(bundle.version === (proposing ? 4 : 3) && equal(bundle.target, evidence.request.target), "The draft belongs to another target or protocol version.");
    requireValue(equal(bundle.producer, {
        runId: evidence.run.id, attempt: evidence.run.run_attempt,
        commit: evidence.run.head_sha, workflow: DRAFT_WORKFLOW,
    }), "Producer provenance does not match the artifact.");
    requireValue(SHA256.test(bundle.snapshotHash) && SHA256.test(bundle.marker) && SHA256.test(bundle.bodyHash),
        "Missing draft integrity values.");
    timestamp(bundle.createdAt, "Missing draft creation time.");
    exactKeys(bundle.request, ["commentId", "commandBody", "commandCreatedAt"], "Missing original draft request.");
    identifier(bundle.request.commentId, "Missing original request ID.");
    requireValue(["draft", "reply", "propose"].includes(parseCommand(bundle.request.commandBody).action),
        "The source request is not a draft or reply command.");
    timestamp(bundle.request.commandCreatedAt, "Missing original request time.");
    const createdAt = Date.parse(bundle.createdAt);
    // GitHub artifact creation timestamps have only whole-second precision.
    requireValue(createdAt >= Date.parse(bundle.request.commandCreatedAt) &&
        Math.floor(createdAt / 1000) <= Math.floor(Date.parse(evidence.artifact.created_at) / 1000),
    "The draft's creation time does not match its recorded provenance.");
    requireValue(equal(validateDraft(bundle.draft, parseCommand(bundle.request.commandBody).action), bundle.draft),
        "The draft does not match the supported schema.");
    requireValue(equal(bundle.fingerprints, evidence.controls.fingerprints), "Policy or workflow code changed. Request a new draft.");
    requireValue(markerFor(bundle) === bundle.marker && renderDraft(bundle) === bundle.body &&
        digest(bundle.body) === bundle.bodyHash && equal(acceptanceFor(bundle), bundle.acceptance),
    "The sealed response or acceptance preview changed.");
}

function validateBundle(bundle, publication) {
    validateSealedDraft(bundle, publication);
    const action = publication.request.command.action;
    const directReply = ["reply", "propose"].includes(action);
    requireValue(parseCommand(bundle.request.commandBody).action ===
        (directReply ? action : publication.proposal ? "propose" : "draft"),
        "The source request does not authorize this publication mode.");
    if (directReply) {
        requireValue(equal(bundle.request, originalRequest(publication.request)),
            "The sealed reply belongs to a different owner command.");
    }
    if (publication.proposal) {
        requireValue(bundle.proposalVersion === publication.request.command.proposalVersion &&
            bundle.marker === publication.proposal.marker && bundle.body === publication.proposal.comment.body,
        "The public proposal no longer matches its immutable sealed terms.");
    }
    requireValue(publicationContent(bundle, publication.request.command.action).bodyHash === publication.bodyHash,
    "The approval does not match the exact rendered draft.");
}

function publicationContent(bundle, action) {
    if (action === "accept") {
        return object(bundle.acceptance, "This draft is not eligible for acceptance. Resolve the questions or scope and request a new draft.");
    }
    return bundle;
}

export function publishedComment(thread, bundle, action = "publish") {
    const marker = action === "accept" ? `<!-- typechat-work-acceptance:v1:${bundle.marker} -->` :
        `<!-- typechat-discussion-draft:v3:${bundle.marker} -->`;
    const matches = thread.comments.filter(comment => comment.parentId === null &&
        comment.author?.type === "Bot" && comment.author.id === ACTIONS_BOT_ID && comment.body.includes(marker));
    requireValue(matches.length <= 1, "More than one publication marker exists. Human inspection is required.");
    if (!matches.length) {
        return null;
    }
    requireValue(lf(matches[0].body) === publicationContent(bundle, action).body,
        "An existing bot comment has different content. It will not be overwritten.");
    return matches[0];
}

function publicationIntentName(publication) {
    return ["reply", "propose"].includes(publication.request.command.action) ?
        replyIntentName(publication.request) :
        `${INTENT_PREFIX}${publication.request.command.action === "accept" ? "accept-" : ""}${publication.artifact.id}`;
}

export async function priorIntent(github, name, excludeId) {
    // At most one result can be this run's new intent; any other match blocks publication.
    const data = (await github.rest.actions.listArtifactsForRepo({ ...API_REPO, name, per_page: 2, page: 1 })).data;
    requireValue(data && Array.isArray(data.artifacts) && Number.isSafeInteger(data.total_count) &&
        data.total_count >= 0 && data.artifacts.length === Math.min(data.total_count, 2),
    "Publication intent history is unavailable or incomplete.");
    const seen = new Set();
    for (const artifact of data.artifacts) {
        requireValue(artifact && Number.isSafeInteger(artifact.id) && artifact.id > 0 &&
            artifact.name === name && !seen.has(artifact.id) &&
            artifact.workflow_run?.repository_id === REPOSITORY.id &&
            Number.isSafeInteger(artifact.workflow_run.id) && artifact.workflow_run.id > 0,
        "Publication intent history contains invalid or duplicate artifacts.");
        seen.add(artifact.id);
    }
    const prior = data.artifacts.find(artifact => artifact.id !== excludeId);
    if (prior) {
        return { runId: prior.workflow_run.id, artifactId: prior.id };
    }
    requireValue(excludeId === undefined || seen.has(excludeId), "The current publication intent is missing from artifact history.");
    return null;
}

async function verifyBundleContext(github, publication, bundle) {
    validateBundle(bundle, publication);
    await verifyCommand(github, {
        ...publication.request, ...bundle.request, command: parseCommand(bundle.request.commandBody),
    });
    const thread = await readThread(github, publication.request.target);
    if (publication.proposal) {
        const current = findPublicProposal(thread, publication.request.command.proposalVersion);
        requireValue(current.comment.id === publication.proposal.comment.id && current.comment.body === bundle.body &&
            current.comment.createdAt === publication.proposal.comment.createdAt,
        "The selected public proposal changed during acceptance. Human inspection is required.");
    }
    const existing = ["reply", "propose"].includes(publication.request.command.action) ?
        existingReply(thread, publication.request) : publishedComment(thread, bundle, publication.request.command.action);
    if (existing) {
        return { existing, thread };
    }
    requireOpen(thread);
    const evidenceThread = publication.proposal ? { target: thread.target,
        comments: thread.comments.filter(comment => comment.id !== publication.proposal.comment.id &&
            Date.parse(comment.createdAt) <= Date.parse(bundle.createdAt)) } : thread;
    requireValue(snapshotHash(evidenceThread) === bundle.snapshotHash, publication.proposal ||
        publication.request.command.action === "propose" ? "The target context changed. Request /typechat propose." :
        publication.request.command.action === "reply" ?
            "The target context changed. Post a new reply command after reviewing the discussion." :
            "The target context changed. Request and approve a new draft.");
    await verifyReferences(github, bundle.draft.pullRequests, publication.proposal ? "propose" : publication.request.command.action);
    return { existing: null, thread };
}

export async function checkPublication(github, context, env, bundle, clock = () => new Date()) {
    const publication = await identifyPublication(github, context, env, clock);
    const { existing } = await verifyBundleContext(github, publication, bundle);
    if (existing) {
        await acknowledgeAcceptance(github, publication.request);
        return { shouldPost: false, url: existing.url };
    }
    const prior = await priorIntent(github, publicationIntentName(publication));
    requireValue(!prior, "A previous publication intent exists without a confirmed comment. Inspect that run; automatic retry is blocked.");
    return {
        shouldPost: true,
        intentName: publicationIntentName(publication),
        intent: {
            version: 3, authorization: publication.request.command.action,
            artifactId: publication.artifact.id, bodyHash: publicationContent(bundle, publication.request.command.action).bodyHash,
            target: bundle.target, approvalComment: publication.request.commentId,
            runId: publication.request.runId, attempt: publication.request.attempt,
        },
    };
}

export async function publishDraft(github, context, env, bundle, intentId, clock = () => new Date()) {
    const publication = await identifyPublication(github, context, env, clock);
    const { existing } = await verifyBundleContext(github, publication, bundle);
    if (existing) {
        await acknowledgeAcceptance(github, publication.request);
        return { posted: false, url: existing.url, bodyHash: digest(existing.body) };
    }
    const intent = (await github.rest.actions.getArtifact({ ...API_REPO, artifact_id: integer(Number(intentId), "Missing durable publication intent.") })).data;
    requireValue(intent.id === Number(intentId) &&
        intent.name === publicationIntentName(publication) &&
        intent.workflow_run?.id === publication.request.runId &&
        intent.workflow_run.repository_id === REPOSITORY.id && intent.workflow_run.head_sha === context.sha &&
        intent.expired === false &&
        Date.parse(intent.expires_at) >= publication.validUntil, "The publication intent is missing, stale, or insufficiently retained.");
    requireValue(!await priorIntent(github, publicationIntentName(publication), intent.id),
        "A previous publication attempt exists. No second write will be attempted.");
    const latest = await identifyPublication(github, context, env, clock);
    const rechecked = await verifyBundleContext(github, latest, bundle);
    if (rechecked.existing) {
        await acknowledgeAcceptance(github, latest.request);
        return { posted: false, url: rechecked.existing.url, bodyHash: digest(rechecked.existing.body) };
    }
    await verifyCommand(github, latest.request);
    const content = publicationContent(bundle, latest.request.command.action);
    const comment = await writeDiscussionComment(github, bundle.target, content.body);
    await acknowledgeAcceptance(github, latest.request);
    return { posted: true, id: comment.id, url: comment.url, bodyHash: content.bodyHash };
}

async function acknowledgeAcceptance(github, request) {
    if (request.command.action !== "accept") {
        return;
    }
    await verifyCommand(github, request);
    try {
        const result = await github.graphql(`mutation DiscussionPilotAcceptReaction($id:ID!) {
          addReaction(input:{subjectId:$id,content:THUMBS_UP}) {
            subject { ... on Node { id } }
            reaction { content }
          }
        }`, { id: request.commentId });
        requireValue(result.addReaction?.subject?.id === request.commentId &&
            result.addReaction?.reaction?.content === "THUMBS_UP", "The reaction response does not confirm the target and content.");
    } catch (error) {
        throw new Error("Acceptance is recorded, but its confirmation reaction failed. Inspect the command before retrying; do not recreate accepted work.",
            { cause: error });
    }
}

async function writeDiscussionComment(github, target, body, existing = null) {
    const commentId = existing && target.kind === "issue" ?
        integer(Number(existing.url.split("#issuecomment-")[1]), "Invalid receipt comment URL.") : null;
    let comment;
    try {
        if (target.kind === "issue") {
            const result = existing ?
                await github.rest.issues.updateComment({
                    ...API_REPO, comment_id: commentId, body,
                }) :
                await github.rest.issues.createComment({ ...API_REPO, issue_number: target.number, body });
            comment = { id: result.data.node_id, url: result.data.html_url, body: result.data.body };
        } else if (existing) {
            const result = await github.graphql(`mutation DiscussionPilotUpdate($id:ID!,$body:String!) {
              updateDiscussionComment(input:{commentId:$id,body:$body}) { comment { id url body } }
            }`, { id: existing.id, body });
            comment = result.updateDiscussionComment?.comment;
        } else {
            const result = await github.graphql(`mutation DiscussionPilotPost($id:ID!,$body:String!) {
              addDiscussionComment(input:{discussionId:$id,body:$body}) { comment { id url body } }
            }`, { id: target.id, body });
            comment = result.addDiscussionComment?.comment;
        }
    } catch (error) {
        throw new Error("Publication outcome is uncertain. The intent is retained; inspect GitHub before any manual recovery.", { cause: error });
    }
    requireValue(comment && typeof comment.id === "string" && typeof comment.url === "string" &&
        comment.url.startsWith(target.url + "#") && typeof comment.body === "string" && lf(comment.body) === body &&
        (!existing || (comment.id === existing.id && comment.url === existing.url)),
    "GitHub did not confirm the exact comment. The intent is retained; inspect before retrying.");
    return comment;
}

function statusKey(data) {
    return digest({ kind: data.kind, number: data.number, commentId: data.commentId });
}

function validStatusData(data) {
    return data !== null && typeof data === "object" && !Array.isArray(data) &&
        equal(Object.keys(data).sort(), ["version", "kind", "number", "commentId", "runId", "attempt", "started",
            "action", "outcome", "result"].sort()) &&
        data.version === 1 && ["issue", "discussion"].includes(data.kind) &&
        ["number", "commentId", "runId", "attempt", "started"].every(key => Number.isSafeInteger(data[key]) && data[key] > 0) &&
        ["draft", "reply", "propose"].includes(data.action) && STATUS_OUTCOMES.includes(data.outcome) &&
        (["ready", "input", "outdated", "unavailable"].includes(data.outcome) ? data.action === "draft" : true) &&
        (["unconfirmed", "replied"].includes(data.outcome) ? ["reply", "propose"].includes(data.action) : true) &&
        (data.outcome === "replied" ? typeof data.result === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(data.result) : data.result === "");
}

export function renderStatusReceipt(data) {
    requireValue(validStatusData(data), "Invalid completion-receipt metadata.");
    const targetUrl = `${REPO_URL}/${data.kind === "issue" ? "issues" : "discussions"}/${data.number}`;
    const fragment = data.kind === "issue" ? "issuecomment" : "discussioncomment";
    const messages = {
        ready: "Draft and work-acceptance preview prepared for owner review.",
        input: "Draft prepared; owner or maintainer input is still needed before work acceptance.",
        outdated: "The draft is no longer current. Review the thread and request a fresh draft.",
        unavailable: "The run finished without an available, verified review artifact. Maintainer inspection is needed.",
        failed: "The request failed. Check the run and thread before retrying.",
        cancelled: "The request was cancelled or timed out. Check the run and thread before retrying.",
        invalid: data.action === "propose" ?
            "The request was rejected. Post only /typechat propose in a new Issue comment." :
            "The request was rejected. Post only /typechat draft or /typechat reply in a new comment.",
        unconfirmed: data.action === "propose" ?
            "A proposal was not confirmed. Inspect the run and thread before retrying; do not assume nothing was posted." :
            "A reply was not confirmed. Inspect the run and thread before retrying; do not assume nothing was posted.",
        replied: data.action === "propose" ? "The requested proposal is available." : "The requested reply is available.",
    };
    const sections = [
        `**TypeChat: ${messages[data.outcome]}**`,
        `[Owner request](${targetUrl}#${fragment}-${data.commentId}) | ` +
            `[Run${data.action === "draft" ? " and preview" : ""}](${REPO_URL}/actions/runs/${data.runId}/attempts/${data.attempt})`,
    ];
    if (data.result) {
        sections.push(`[Existing reply](${targetUrl}#${fragment}-${data.result})`);
    }
    sections.push("*Operational receipt only. This comment does not publish draft text, accept work, " +
        "authorize implementation, or approve merging.*");
    sections.push(`<!-- typechat-status:v1:${statusKey(data)}:${data.kind}:${data.number}:${data.commentId}:` +
        `${data.runId}:${data.attempt}:${data.started}:${data.action}:${data.outcome}:${data.result} -->`);
    return sections.join("\n\n") + "\n";
}

function statusReceiptData(comment) {
    // A marker alone must never hide arbitrary discussion text from the snapshot.
    if (comment.author?.type !== "Bot" || comment.author.id !== ACTIONS_BOT_ID || comment.parentId !== null ||
        typeof comment.body !== "string" || comment.body.length > MAX_COMMENT_BYTES) {
        return null;
    }
    const match = /<!-- typechat-status:v1:([a-f0-9]{64}):(issue|discussion):([0-9]+):([0-9]+):([0-9]+):([0-9]+):([0-9]+):(draft|reply|propose):([a-z]+):([A-Za-z0-9_-]*) -->\n?$/.exec(lf(comment.body));
    if (!match) {
        return null;
    }
    const data = {
        version: 1, kind: match[2], number: Number(match[3]), commentId: Number(match[4]),
        runId: Number(match[5]), attempt: Number(match[6]), started: Number(match[7]),
        action: match[8], outcome: match[9], result: match[10],
    };
    const targetUrl = `${REPO_URL}/${data.kind === "issue" ? "issues" : "discussions"}/${data.number}`;
    return validStatusData(data) && match[1] === statusKey(data) &&
        comment.url?.startsWith(targetUrl + "#") && lf(comment.body) === renderStatusReceipt(data) ? data : null;
}

export function parseStatusRunTitle(title) {
    const match = /^TypeChat response: (issue_comment|discussion_comment) #([1-9][0-9]*) \/ comment ([1-9][0-9]*)$/.exec(
        string(title, "Missing source run title.", 256));
    if (!match) {
        requireValue(!title.startsWith("TypeChat response:"), "Malformed source owner-request binding.");
        return null;
    }
    return {
        kind: match[1] === "issue_comment" ? "issue" : "discussion",
        number: integer(Number(match[2]), "Invalid receipt target number."),
        commentId: integer(Number(match[3]), "Invalid receipt request ID."),
    };
}

export async function identifyStatus(github, context, env, clock = () => new Date()) {
    const event = object(context.payload, "Missing completion event.");
    requireValue(context.eventName === "workflow_run" && event.action === "completed" &&
        event.repository?.id === REPOSITORY.id && event.repository.full_name === REPO_NAME &&
        event.repository.private === false, "Only completion events in the public target repository can authorize a receipt.");
    const branch = identifier(event.repository.default_branch, "Missing default branch.");
    requireValue(env.GITHUB_WORKFLOW_REF === `${REPO_NAME}/${STATUS_WORKFLOW}@refs/heads/${branch}` &&
        env.GITHUB_REF === `refs/heads/${branch}` && SHA1.test(context.sha),
    "Completion receipts require trusted default-branch code.");
    const attempt = integer(Number(env.GITHUB_RUN_ATTEMPT), "Invalid receipt workflow attempt.");
    requireValue(attempt === 1 || env.GITHUB_TRIGGERING_ACTOR === OWNER.login,
        "Only the owner can rerun a completion-receipt job.");
    const runId = integer(event.workflow_run?.id, "Missing source workflow run.");
    const sourceAttempt = integer(event.workflow_run?.run_attempt, "Missing source completion attempt.");
    const run = (await github.rest.actions.getWorkflowRun({ ...API_REPO, run_id: runId })).data;
    const workflow = (await github.rest.actions.getWorkflow({ ...API_REPO, workflow_id: path.posix.basename(DRAFT_WORKFLOW) })).data;
    requireValue(run?.id === runId && run.workflow_id === workflow.id &&
        [DRAFT_WORKFLOW, `${DRAFT_WORKFLOW}@refs/heads/${branch}`].includes(run.path) &&
        run.repository?.id === REPOSITORY.id && run.head_repository?.id === REPOSITORY.id &&
        run.head_branch === branch && SHA1.test(run.head_sha) &&
        run.actor?.type === "User" && run.actor.id === OWNER.id &&
        run.triggering_actor?.type === "User" && run.triggering_actor.id === OWNER.id &&
        ["issue_comment", "discussion_comment"].includes(run.event),
    "The source run is not an authorized owner request on the default branch.");
    integer(run.run_attempt, "Missing source attempt.");
    if (run.status !== "completed" || run.run_attempt !== sourceAttempt) {
        return { eligible: false, reason: "A newer source attempt is pending or this completion event is stale." };
    }
    const started = Date.parse(timestamp(run.run_started_at, "Missing source start time."));
    const created = Date.parse(timestamp(run.created_at, "Missing source creation time."));
    const now = clock().getTime();
    requireValue(created <= started && now >= started && now < started + MAX_AGE_MS, "The completion event is stale or has invalid timing.");
    requireValue(["success", "failure", "cancelled", "timed_out", "action_required", "neutral", "skipped", "stale", "startup_failure"]
        .includes(run.conclusion), "Missing or unsupported source conclusion.");
    const locator = parseStatusRunTitle(run.display_title);
    if (!locator || run.conclusion === "skipped") {
        return { eligible: false, reason: "This ignored or older run has no supported owner-request binding." };
    }
    requireValue(run.event === `${locator.kind}_comment` && env.TYPECHAT_STATUS_KIND === locator.kind,
        "The receipt job does not have authority for this target kind.");
    const controls = await currentControls(github);
    const executing = await readControls(github, context.sha);
    requireValue(equal(executing.fingerprints, controls.fingerprints), "Receipt code or policy changed while queued.");
    const targetResult = await github.graphql(`query DiscussionStatusTarget($owner:String!,$repo:String!,$number:Int!) {
      repository(owner:$owner,name:$repo) {
        nameWithOwner isPrivate
        target:${locator.kind === "issue" ? "issue" : "discussion"}(number:$number) { id number url }
      }
    }`, { ...API_REPO, number: locator.number });
    validateRepository(targetResult.repository);
    const item = object(targetResult.repository.target, "The receipt target is unavailable.");
    const target = {
        kind: locator.kind, number: locator.number, id: identifier(item.id, "Missing receipt target ID."),
        url: `${REPO_URL}/${locator.kind === "issue" ? "issues" : "discussions"}/${locator.number}`,
    };
    requireValue(item.number === target.number && item.url === target.url, "Unexpected receipt target.");
    const thread = await readThread(github, target);
    const commandUrl = `${target.url}#${target.kind === "issue" ? "issuecomment" : "discussioncomment"}-${locator.commentId}`;
    const matches = thread.comments.filter(comment => comment.url === commandUrl);
    requireValue(matches.length <= 1, "Duplicate owner-request metadata.");
    const comment = matches[0];
    if (!comment || comment.author?.type !== "User" || comment.author.login !== OWNER.login ||
        comment.minimized || comment.lastEditedAt !== null || thread.target.state !== "OPEN" || thread.target.locked) {
        return { eligible: false, reason: "The owner request is unavailable, edited, withdrawn, closed, or locked; no receipt was posted." };
    }
    requireValue(Date.parse(comment.createdAt) <= created, "The source run predates this owner command.");
    const prefix = /^\/typechat (draft|reply|propose)/.exec(comment.body);
    if (!prefix) {
        return { eligible: false, reason: "The source comment is not a discussion draft/reply request." };
    }
    const valid = comment.body.length <= 2000 && /^\/typechat (draft|reply|propose)\s*$/.test(comment.body);
    const request = {
        target, commentId: comment.id, commandBody: comment.body, commandCreatedAt: comment.createdAt,
        command: valid ? parseCommand(comment.body) : null,
    };
    await verifyOwnerCommand(github, request);
    const data = {
        version: 1, ...locator, runId: run.id, attempt: run.run_attempt, started,
        action: prefix[1], outcome: "failed", result: "",
    };
    let artifact = null;
    let existing = null;
    if (!valid) {
        data.outcome = "invalid";
    } else if (["reply", "propose"].includes(request.command.action) && (existing = existingReply(thread, request))) {
        data.outcome = "replied";
        const result = new RegExp(`^${target.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}#(?:issuecomment|discussioncomment)-([A-Za-z0-9_-]{1,128})$`).exec(existing.url);
        requireValue(result, "The existing reply has an invalid target URL.");
        data.result = result[1];
    } else if (["cancelled", "timed_out"].includes(run.conclusion)) {
        data.outcome = "cancelled";
    } else if (["reply", "propose"].includes(request.command.action)) {
        data.outcome = "unconfirmed";
    } else if (run.conclusion === "success") {
        const produced = await readControls(github, run.head_sha);
        if (!equal(produced.fingerprints, controls.fingerprints)) {
            data.outcome = "outdated";
        } else {
            const name = `${DRAFT_ARTIFACT_PREFIX}${run.run_attempt}`;
            const response = (await github.rest.actions.listWorkflowRunArtifacts({
                ...API_REPO, run_id: run.id, name, per_page: 2, page: 1,
            })).data;
            requireValue(response && Array.isArray(response.artifacts) &&
                Number.isSafeInteger(response.total_count) && response.total_count >= 0 &&
                response.total_count <= 1 && response.artifacts.length === response.total_count,
            "The sealed-output listing is incomplete or ambiguous.");
            artifact = response.artifacts[0] ?? null;
            data.outcome = "unavailable";
            if (artifact) {
                integer(artifact.id, "Missing sealed artifact ID.");
                requireValue(artifact.name === name && artifact.workflow_run?.id === run.id &&
                    artifact.workflow_run.repository_id === REPOSITORY.id &&
                    artifact.workflow_run.head_repository_id === REPOSITORY.id &&
                    artifact.workflow_run.head_sha === run.head_sha &&
                    Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 &&
                    artifact.size_in_bytes <= MAX_BUNDLE_BYTES * 2,
                "The receipt artifact does not belong to the successful source run.");
                timestamp(artifact.created_at, "Missing sealed artifact creation time.");
                timestamp(artifact.expires_at, "Missing sealed artifact expiry.");
                requireValue(typeof artifact.expired === "boolean" &&
                    Date.parse(artifact.created_at) >= created && Date.parse(artifact.created_at) <= now,
                "The sealed artifact has invalid availability or timing metadata.");
                if (artifact.expired !== false || now >= Math.min(Date.parse(artifact.expires_at), Date.parse(artifact.created_at) + MAX_AGE_MS)) {
                    artifact = null;
                }
            }
        }
    }
    return { eligible: true, request, thread, data, run, artifact, controls, existing, validUntil: started + MAX_AGE_MS };
}

async function statusPlan(github, context, env, bundle, clock) {
    const status = await identifyStatus(github, context, env, clock);
    if (!status.eligible) {
        return { shouldWrite: false, reason: status.reason };
    }
    if (status.artifact) {
        validateSealedDraft(bundle, status);
        requireValue(equal(bundle.request, originalRequest(status.request)), "The sealed output belongs to another owner command.");
        status.data.outcome = snapshotHash(status.thread) !== bundle.snapshotHash ||
            await changedReference(github, bundle.draft.pullRequests) !== null ? "outdated" :
            bundle.acceptance ? "ready" : "input";
    }
    const key = statusKey(status.data);
    const prefix = `<!-- typechat-status:v1:${key}:`;
    const matches = status.thread.comments.filter(comment => comment.parentId === null &&
        comment.author?.type === "Bot" && comment.author.id === ACTIONS_BOT_ID && comment.body.includes(prefix));
    requireValue(matches.length <= 1, "More than one completion receipt exists; maintainer inspection is required.");
    const existing = matches[0] ?? null;
    if (existing) {
        const prior = statusReceiptData(existing);
        requireValue(prior, "The completion receipt was edited or is invalid; it will not be overwritten.");
        if (prior.started > status.data.started ||
            (prior.runId === status.data.runId && prior.attempt > status.data.attempt)) {
            return { shouldWrite: false, reason: "A newer completion receipt already exists.", url: existing.url };
        }
    } else if (status.existing) {
        return { shouldWrite: false, reason: "The existing public reply is already the completion message.", url: status.existing.url };
    }
    const body = renderStatusReceipt(status.data);
    if (existing && existing.body === body) {
        return { shouldWrite: false, reason: "This completion outcome is already recorded.", url: existing.url };
    }
    const age = clock().getTime() - Date.parse(status.request.commandCreatedAt);
    requireValue(age >= 0 && age < MAX_AGE_MS, "An old command needs a new request; its receipt will not be created or updated.");
    const previousHash = existing ? digest(existing.body) : null;
    // Lock the observed receipt, not the source attempt, until that mutation is visible.
    const intentName = `${STATUS_INTENT_PREFIX}${key}${existing ? `-${previousHash}` : ""}`;
    return {
        shouldWrite: true, ...status, existing, body, bodyHash: digest(body), intentName,
        previousHash,
    };
}

export async function checkStatus(github, context, env, bundle, clock = () => new Date()) {
    const plan = await statusPlan(github, context, env, bundle, clock);
    if (!plan.shouldWrite) {
        return plan;
    }
    requireValue(!await priorIntent(github, plan.intentName),
        "A previous status-write intent exists without a confirmed result. Inspect the run before retrying.");
    return {
        shouldWrite: true, intentName: plan.intentName, outcome: plan.data.outcome,
        intent: {
            version: 1, target: plan.request.target, commandId: plan.request.commentId,
            sourceRunId: plan.run.id, sourceAttempt: plan.run.run_attempt,
            runId: integer(Number(context.runId), "Invalid receipt run ID."),
            attempt: integer(Number(env.GITHUB_RUN_ATTEMPT), "Invalid receipt attempt."),
            operation: plan.existing ? "update" : "create",
            commentId: plan.existing?.id ?? null, previousHash: plan.previousHash, bodyHash: plan.bodyHash,
        },
    };
}

export async function publishStatus(github, context, env, bundle, intentId, clock = () => new Date()) {
    const plan = await statusPlan(github, context, env, bundle, clock);
    if (!plan.shouldWrite) {
        return { posted: false, ...plan };
    }
    const intent = (await github.rest.actions.getArtifact({ ...API_REPO, artifact_id: integer(Number(intentId), "Missing durable status intent.") })).data;
    requireValue(intent.id === Number(intentId) && intent.name === plan.intentName &&
        intent.workflow_run?.id === Number(context.runId) && intent.workflow_run.repository_id === REPOSITORY.id &&
        intent.workflow_run.head_sha === context.sha && intent.expired === false &&
        Date.parse(intent.expires_at) >= plan.validUntil, "The status-write intent is missing, stale, or insufficiently retained.");
    requireValue(!await priorIntent(github, plan.intentName, intent.id), "A previous status-write attempt exists; no blind retry is allowed.");
    const latest = await statusPlan(github, context, env, bundle, clock);
    if (!latest.shouldWrite) {
        return { posted: false, ...latest };
    }
    requireValue(latest.intentName === plan.intentName && latest.bodyHash === plan.bodyHash &&
        latest.existing?.id === plan.existing?.id && latest.previousHash === plan.previousHash,
    "The completion outcome changed during the write handoff; inspect the run before recovery.");
    await verifyOwnerCommand(github, latest.request);
    const comment = await writeDiscussionComment(github, latest.request.target, latest.body, latest.existing);
    return {
        posted: true, updated: latest.existing !== null, id: comment.id, url: comment.url,
        bodyHash: latest.bodyHash, outcome: latest.data.outcome,
    };
}

export async function draftSummary(core, bundle, artifactId, artifactUrl) {
    integer(Number(artifactId), "Missing sealed artifact ID.");
    const action = parseCommand(bundle.request.commandBody).action;
    const directReply = ["reply", "propose"].includes(action);
    core.summary.addHeading(`${action === "propose" ? `Public proposal P${bundle.proposalVersion}` :
        directReply ? "Checked reply" : "Draft"} for ${bundle.target.kind} #${bundle.target.number}`)
        .addRaw("This response does not accept work or authorize implementation.\n\n")
        .addLink("Sealed response artifact", artifactUrl);
    if (directReply) {
        core.summary.addRaw(action === "propose" ?
            "\n\nThe owner proposal command authorizes one checked public proposal. See the posting job for the result.\n" :
            "\n\nThe owner reply command authorizes one checked response. See the reply job for the posting result.\n");
    } else {
        core.summary.addRaw(`\n\nReview the exact preview, then post this command in the same ${bundle.target.kind} to approve it:\n\n`)
            .addCodeBlock(`/typechat publish ${artifactId}:${bundle.bodyHash}`, "text");
    }
    core.summary.addRaw("\n\n---\n\n" + bundle.body)
        .addRaw("\n\n---\n\n" + renderAssessment(bundle));
    if (bundle.acceptance) {
        core.summary.addHeading("Work acceptance preview (not yet accepted)", 2)
            .addRaw("This is a separate choice from publishing the response. Review every proposed term below, " +
                "then post this command in the same thread to accept exactly this scope and these criteria:\n\n")
            .addCodeBlock(action === "propose" ? `/typechat accept P${bundle.proposalVersion}` :
                `/typechat accept ${artifactId}:${bundle.acceptance.bodyHash}`, "text")
            .addRaw("\n\nThis does not authorize an automated implementation run or merging.\n\n---\n\n" + bundle.acceptance.body);
    } else {
        core.summary.addRaw(action === "propose" ?
            "\n\nThis proposal is not ready for acceptance. Discuss its questions and request `/typechat propose` again.\n" : directReply ?
            "\n\nA reply artifact cannot authorize acceptance. Request `/typechat draft` when the scope and criteria are ready for review.\n" :
            "\n\nNo acceptance proposal is ready. Resolve the open questions, scope, or evidence gaps before requesting a new draft.\n");
    }
    await core.summary.write();
}
