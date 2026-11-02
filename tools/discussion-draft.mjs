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
export const DRAFT_ARTIFACT_PREFIX = "typechat-discussion-draft-";
export const INTENT_PREFIX = "typechat-publish-intent-";
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
    const request = /^\/typechat (draft|reply)\s*$/.exec(body);
    if (request) {
        return { action: request[1] };
    }
    const publish = /^\/typechat (publish|accept) ([1-9][0-9]*):([a-fA-F0-9]{64})\s*$/.exec(body);
    if (publish) {
        return {
            action: publish[1],
            artifactId: integer(Number(publish[2]), "The draft artifact ID is not a safe positive integer."),
            bodyHash: publish[3].toLowerCase(),
        };
    }
    throw new Error("Invalid command. Use /typechat draft, /typechat reply, /typechat publish <artifact-id>:<sha256>, " +
        "or /typechat accept <artifact-id>:<sha256>.");
}

function isControlComment(comment) {
    return comment.author?.type === "User" && comment.author.login === OWNER.login &&
        (/^\/typechat (draft|reply)\s*$/.test(comment.body) ||
            /^\/typechat (publish|accept) [1-9][0-9]*:[a-fA-F0-9]{64}\s*$/.test(comment.body));
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
    if (["publish", "accept", "reply"].includes(action)) {
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
    requireValue(action === "draft" ? ["draft", "reply"].includes(command.action) : command.action === action,
        "The command does not authorize this operation.");
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
    function appendComment(value, parentId) {
        const comment = normalizeComment(value, parentId);
        commentBytes += Buffer.byteLength(JSON.stringify(comment));
        requireValue(comments.length < 1000 && commentBytes <= MAX_CONTEXT_BYTES,
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
        requireValue(total <= 1000, "This thread exceeds the pilot's 1,000-comment limit.");
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
                    requireValue(comments.length <= 1000, "This thread exceeds the pilot's 1,000-comment limit.");
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
        requireValue(comments.length <= 1000, "This thread exceeds the pilot's 1,000-comment limit.");
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
    requireValue(Buffer.byteLength(JSON.stringify(thread)) <= MAX_CONTEXT_BYTES, "This context exceeds the pilot's 1 MiB limit.");
    return thread;
}

export function snapshotHash(thread) {
    return digest({ target: thread.target, comments: thread.comments.filter(comment => !isControlComment(comment)) });
}

export async function verifyCommand(github, request) {
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
    requireValue(equal(parseCommand(comment.body), request.command), "The command changed after the event.");
    return comment;
}

export async function readControls(github, ref) {
    const result = await github.rest.git.getTree({ ...API_REPO, tree_sha: ref, recursive: "1" });
    const tree = result.data;
    requireValue(tree?.truncated === false && Array.isArray(tree.tree), "The control-file tree is incomplete.");
    const fingerprints = {};
    for (const file of CONTROL_PATHS) {
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
    return `${INTENT_PREFIX}reply-${replyKey(request)}`;
}

function existingReply(thread, request) {
    const marker = `<!-- typechat-discussion-reply:v2:${replyKey(request)} -->`;
    const matches = thread.comments.filter(comment => comment.parentId === null &&
        comment.author?.type === "Bot" && comment.author.id === ACTIONS_BOT_ID && comment.body.includes(marker));
    requireValue(matches.length <= 1, "More than one reply exists for this command. Human inspection is required.");
    if (matches.length) {
        requireValue(matches[0].url.startsWith(request.target.url + "#"), "The existing reply belongs to a different target.");
        return matches[0];
    }
    return null;
}

function requireFreshReply(request, now) {
    const age = now.getTime() - Date.parse(request.commandCreatedAt);
    requireValue(age >= 0 && age < MAX_AGE_MS, "The reply command has expired or has an invalid time. Post a new command.");
}

export async function prepareDraft(github, context, env, clock = () => new Date()) {
    const request = authorize(context, env, "draft");
    await verifyCommand(github, request);
    const controls = await readControls(github, request.commit);
    const thread = await readThread(github, request.target);
    if (request.command.action === "reply") {
        const current = await currentControls(github);
        requireValue(equal(current.fingerprints, controls.fingerprints), "Policy or workflow code changed. Post a new reply command.");
        const existing = existingReply(thread, request);
        if (existing) {
            return { alreadyReplied: true, url: existing.url };
        }
        requireFreshReply(request, clock());
        requireValue(!await priorIntent(github, replyIntentName(request)),
            "A previous reply intent exists without a confirmed comment. Inspect that run; automatic retry is blocked.");
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

export function validateDraft(value) {
    exactKeys(value, ["reply", "summary", "scope", "scopeReason", "readiness", "readinessReason", "questions",
        "existingRequirements", "suggestedCriteria", "proposal", "limitations", "pullRequests"], "Unexpected draft fields.");
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
    };
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
        requireValue(result.scope === "in_scope" && result.readiness === "ready_for_owner_decision" &&
            result.questions.length === 0, "Only ready, in-scope work without unresolved questions can have an acceptance proposal.");
        exactKeys(value.proposal, ["goal", "scope", "nonGoals"], "Unexpected acceptance-proposal fields.");
        result.proposal = {
            goal: plain(value.proposal.goal, "proposal.goal", 2000),
            scope: textList(value.proposal.scope, "proposal.scope"),
            nonGoals: textList(value.proposal.nonGoals, "proposal.nonGoals"),
        };
        requireValue(result.proposal.scope.length > 0 && result.proposal.nonGoals.length > 0,
            "An acceptance proposal needs explicit scope and non-goals.");
    }
    if (result.readiness === "ready_for_owner_decision") {
        requireValue(result.scope === "in_scope" && result.questions.length === 0 &&
            result.suggestedCriteria.length > 0 && result.proposal !== null,
        "A readiness recommendation needs an explicit in-scope proposal, testable criteria, and no unresolved questions.");
    }
    return result;
}

function markdown(text) {
    return text.replace(/&/g, "&amp;")
        .replace(/[<>]/g, character => character === "<" ? "&lt;" : "&gt;")
        .replace(/[\\`*_{}\[\]()#+\-.!|~@]/g, "\\$&");
}

export function renderDraft(bundle) {
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

export function renderAcceptance(bundle) {
    const { draft, target } = bundle;
    const proposal = object(draft.proposal, "This draft has no acceptance proposal.");
    const sections = [
        "## Accepted work",
        `Approved by the project owner, [${OWNER.login}](https://github.com/${OWNER.login}), for ` +
            `[${target.kind} #${target.number}](${target.url}).`,
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
        "increase any budget, or approve merging. Material scope changes require a new proposal and owner decision.*");
    sections.push(`<!-- typechat-work-acceptance:v1:${bundle.marker} -->`);
    const body = sections.join("\n\n") + "\n";
    requireValue(Buffer.byteLength(body) <= MAX_COMMENT_BYTES, "The rendered acceptance exceeds the comment-size limit.");
    return body;
}

function acceptanceFor(bundle) {
    if (parseCommand(bundle.request.commandBody).action !== "draft" || bundle.draft.proposal === null) {
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
        "## Assessment and evidence (not posted)",
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
    });
}

async function verifyReferences(github, references) {
    for (const reference of references) {
        const pr = (await github.rest.pulls.get({ ...API_REPO, pull_number: reference.number })).data;
        requireValue(pr.number === reference.number && pr.base?.repo?.id === REPOSITORY.id &&
            pr.head?.sha === reference.headSha && pr.updated_at === reference.updatedAt,
        `PR #${reference.number} changed or its inspected revision is unverified. Request a new draft.`);
    }
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
    requireValue(equal(current.fingerprints, prepared.fingerprints), "Policy or workflow code changed. Request a new draft.");
    const thread = await readThread(github, request.target);
    requireOpen(thread);
    requireValue(snapshotHash(thread) === prepared.snapshotHash, "The target discussion changed while drafting. Request a new draft.");
    const draft = validateDraft(candidate);
    await verifyReferences(github, draft.pullRequests);
    const bundle = {
        version: 3, target: request.target, request: originalRequest(request), producer: producer(request),
        fingerprints: prepared.fingerprints, snapshotHash: prepared.snapshotHash,
        createdAt: clock().toISOString(), draft,
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

export function stageCandidateForDetection(directory, detectionDirectory) {
    const text = readArtifact(directory, "discussion-draft.json", MAX_DRAFT_BYTES);
    validateDraft(parseJson(text));
    const outputPath = path.join(detectionDirectory, "agent_output.json");
    const output = fs.existsSync(outputPath) ? parseJson(fs.readFileSync(outputPath, "utf8")) : { items: [] };
    requireValue(output && Array.isArray(output.items), "The detector's agent output is malformed.");
    output.items.push({ type: "discussion-draft", content: text });
    fs.mkdirSync(detectionDirectory, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(output) + "\n");
    return digest(text);
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
    requireValue(["publish", "accept", "reply"].includes(action), "This command does not authorize publication.");
    const directReply = action === "reply";
    const request = authorize(context, env, action);
    const artifactId = directReply ?
        integer(Number(env.TYPECHAT_DRAFT_ARTIFACT_ID), "Missing sealed reply artifact.") : request.command.artifactId;
    const bodyHash = directReply ? env.TYPECHAT_DRAFT_BODY_SHA256 : request.command.bodyHash;
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
    const artifact = (await github.rest.actions.getArtifact({ ...API_REPO, artifact_id: artifactId })).data;
    requireValue(artifact.id === artifactId && artifact.expired === false &&
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
    requireValue(now.getTime() >= Date.parse(artifact.created_at) && now.getTime() < validUntil, "The draft has expired. Request a new draft.");
    requireValue(artifact.workflow_run?.repository_id === REPOSITORY.id &&
        artifact.workflow_run.head_repository_id === REPOSITORY.id, "The artifact belongs to a different repository.");
    const runId = integer(artifact.workflow_run.id, "Missing producer run.");
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
    requireValue(equal(produced.fingerprints, controls.fingerprints),
        "The artifact was produced under older policy or automation code. Request a new draft.");
    return { request, artifact, run, controls, validUntil, bodyHash };
}

function validateBundle(bundle, publication) {
    exactKeys(bundle, ["version", "target", "request", "producer", "fingerprints", "snapshotHash", "createdAt", "draft",
        "marker", "body", "bodyHash", "acceptance"], "Unexpected review-bundle fields.");
    requireValue(bundle.version === 3 && equal(bundle.target, publication.request.target), "The draft belongs to another target or protocol version.");
    requireValue(equal(bundle.producer, {
        runId: publication.run.id, attempt: publication.run.run_attempt,
        commit: publication.run.head_sha, workflow: DRAFT_WORKFLOW,
    }), "Producer provenance does not match the artifact.");
    requireValue(SHA256.test(bundle.snapshotHash) && SHA256.test(bundle.marker) && SHA256.test(bundle.bodyHash),
        "Missing draft integrity values.");
    timestamp(bundle.createdAt, "Missing draft creation time.");
    exactKeys(bundle.request, ["commentId", "commandBody", "commandCreatedAt"], "Missing original draft request.");
    identifier(bundle.request.commentId, "Missing original request ID.");
    const directReply = publication.request.command.action === "reply";
    requireValue(parseCommand(bundle.request.commandBody).action === (directReply ? "reply" : "draft"),
        "The source request does not authorize this publication mode.");
    if (directReply) {
        requireValue(equal(bundle.request, originalRequest(publication.request)),
            "The sealed reply belongs to a different owner command.");
    }
    timestamp(bundle.request.commandCreatedAt, "Missing original request time.");
    const createdAt = Date.parse(bundle.createdAt);
    // GitHub artifact creation timestamps have only whole-second precision.
    requireValue(createdAt >= Date.parse(bundle.request.commandCreatedAt) &&
        Math.floor(createdAt / 1000) <= Math.floor(Date.parse(publication.artifact.created_at) / 1000),
    "The draft's creation time does not match its recorded provenance.");
    requireValue(equal(validateDraft(bundle.draft), bundle.draft), "The draft does not match the supported schema.");
    requireValue(equal(bundle.fingerprints, publication.controls.fingerprints), "Policy or workflow code changed. Request a new draft.");
    requireValue(markerFor(bundle) === bundle.marker && renderDraft(bundle) === bundle.body &&
        digest(bundle.body) === bundle.bodyHash && equal(acceptanceFor(bundle), bundle.acceptance),
    "The sealed response or acceptance preview changed.");
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
    return publication.request.command.action === "reply" ?
        replyIntentName(publication.request) :
        `${INTENT_PREFIX}${publication.request.command.action === "accept" ? "accept-" : ""}${publication.artifact.id}`;
}

async function priorIntent(github, name, excludeId) {
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
    const existing = publication.request.command.action === "reply" ?
        existingReply(thread, publication.request) : publishedComment(thread, bundle, publication.request.command.action);
    if (existing) {
        return { existing, thread };
    }
    requireOpen(thread);
    requireValue(snapshotHash(thread) === bundle.snapshotHash, publication.request.command.action === "reply" ?
        "The target context changed. Post a new reply command after reviewing the discussion." :
        "The target context changed. Request and approve a new draft.");
    await verifyReferences(github, bundle.draft.pullRequests);
    return { existing: null, thread };
}

export async function checkPublication(github, context, env, bundle, clock = () => new Date()) {
    const publication = await identifyPublication(github, context, env, clock);
    const { existing } = await verifyBundleContext(github, publication, bundle);
    if (existing) {
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
        return { posted: false, url: rechecked.existing.url, bodyHash: digest(rechecked.existing.body) };
    }
    await verifyCommand(github, latest.request);
    const content = publicationContent(bundle, latest.request.command.action);
    let comment;
    try {
        if (bundle.target.kind === "issue") {
            const result = await github.rest.issues.createComment({
                ...API_REPO, issue_number: bundle.target.number, body: content.body,
            });
            comment = { id: result.data.node_id, url: result.data.html_url, body: result.data.body };
        } else {
            const result = await github.graphql(`mutation DiscussionPilotPost($id:ID!,$body:String!) {
              addDiscussionComment(input:{discussionId:$id,body:$body}) { comment { id url body } }
            }`, { id: bundle.target.id, body: content.body });
            comment = result.addDiscussionComment?.comment;
        }
    } catch (error) {
        throw new Error("Publication outcome is uncertain. The intent is retained; inspect GitHub before any manual recovery.", { cause: error });
    }
    requireValue(comment && typeof comment.id === "string" && typeof comment.url === "string" &&
        comment.url.startsWith(bundle.target.url + "#") &&
        typeof comment.body === "string" && lf(comment.body) === content.body,
    "GitHub did not confirm the exact comment. The intent is retained; inspect before retrying.");
    return { posted: true, id: comment.id, url: comment.url, bodyHash: content.bodyHash };
}

export async function draftSummary(core, bundle, artifactId, artifactUrl) {
    integer(Number(artifactId), "Missing sealed artifact ID.");
    const directReply = parseCommand(bundle.request.commandBody).action === "reply";
    core.summary.addHeading(`${directReply ? "Checked reply" : "Draft"} for ${bundle.target.kind} #${bundle.target.number}`)
        .addRaw("This response does not accept work or authorize implementation.\n\n")
        .addLink("Sealed response artifact", artifactUrl);
    if (directReply) {
        core.summary.addRaw("\n\nThe owner reply command authorizes one checked response. See the reply job for the posting result.\n");
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
            .addCodeBlock(`/typechat accept ${artifactId}:${bundle.acceptance.bodyHash}`, "text")
            .addRaw("\n\nThis does not authorize an automated implementation run or merging.\n\n---\n\n" + bundle.acceptance.body);
    } else {
        core.summary.addRaw(directReply ?
            "\n\nA reply artifact cannot authorize acceptance. Request `/typechat draft` when the scope and criteria are ready for review.\n" :
            "\n\nNo acceptance proposal is ready. Resolve the open questions, scope, or evidence gaps before requesting a new draft.\n");
    }
    await core.summary.write();
}
