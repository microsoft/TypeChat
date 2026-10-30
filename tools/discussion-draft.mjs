// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

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
    if (/^\/typechat draft\s*$/.test(body)) {
        return { action: "draft" };
    }
    const publish = /^\/typechat publish ([1-9][0-9]*):([a-fA-F0-9]{64})\s*$/.exec(body);
    if (publish) {
        return {
            action: "publish",
            artifactId: integer(Number(publish[1]), "The draft artifact ID is not a safe positive integer."),
            bodyHash: publish[2].toLowerCase(),
        };
    }
    throw new Error("Invalid command. Use /typechat draft or /typechat publish <artifact-id>:<sha256>.");
}

function isControlComment(comment) {
    return comment.author?.type === "User" && comment.author.login === OWNER.login &&
        (/^\/typechat draft\s*$/.test(comment.body) ||
            /^\/typechat publish [1-9][0-9]*:[a-fA-F0-9]{64}\s*$/.test(comment.body));
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
    const workflow = action === "draft" ? DRAFT_WORKFLOW : PUBLISH_WORKFLOW;
    requireValue(env.GITHUB_WORKFLOW_REF === `${REPO_NAME}/${workflow}@refs/heads/${branch}` &&
        env.GITHUB_REF === `refs/heads/${branch}` && SHA1.test(context.sha),
    "The workflow must use trusted default-branch code.");
    const kind = context.eventName === "issue_comment" ? "issue" : "discussion";
    if (action === "publish") {
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
    requireValue(command.action === action, "The command does not authorize this operation.");
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

export async function prepareDraft(github, context, env) {
    const request = authorize(context, env, "draft");
    await verifyCommand(github, request);
    const controls = await readControls(github, request.commit);
    const thread = await readThread(github, request.target);
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
    exactKeys(value, ["summary", "scope", "scopeReason", "readiness", "readinessReason", "questions",
        "existingRequirements", "suggestedCriteria", "limitations", "pullRequests"], "Unexpected draft fields.");
    requireValue(SCOPES.includes(value.scope) && READINESS.includes(value.readiness), "Unsupported scope or readiness recommendation.");
    const result = {
        summary: plain(value.summary, "summary", 2000),
        scope: value.scope,
        scopeReason: plain(value.scopeReason, "scopeReason"),
        readiness: value.readiness,
        readinessReason: plain(value.readinessReason, "readinessReason"),
        questions: textList(value.questions, "questions"),
        existingRequirements: textList(value.existingRequirements, "existingRequirements"),
        suggestedCriteria: textList(value.suggestedCriteria, "suggestedCriteria"),
        limitations: textList(value.limitations, "limitations"),
        pullRequests: [],
    };
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
    if (result.readiness === "ready_for_owner_decision") {
        requireValue(result.scope === "in_scope" && result.questions.length === 0 &&
            result.existingRequirements.length + result.suggestedCriteria.length > 0,
        "A readiness recommendation needs in-scope criteria and no unresolved questions.");
    }
    return result;
}

function markdown(text) {
    return text.replace(/&/g, "&amp;")
        .replace(/[<>]/g, character => character === "<" ? "&lt;" : "&gt;")
        .replace(/[\\`*_{}\[\]()#+\-.!|~]/g, "\\$&");
}

export function renderDraft(bundle) {
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
        "## TypeChat discussion draft",
        "**Draft for discussion only. Publishing this comment does not accept work or authorize implementation.**",
        markdown(draft.summary),
        `### Project direction\n${scope[draft.scope]}: ${markdown(draft.scopeReason)}`,
        `### Readiness recommendation\n${readiness[draft.readiness]}: ${markdown(draft.readinessReason)}`,
    ];
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
    sections.push(`<!-- typechat-discussion-draft:v1:${bundle.marker} -->`);
    const body = sections.join("\n\n") + "\n";
    requireValue(Buffer.byteLength(body) <= MAX_COMMENT_BYTES, "The rendered draft exceeds the comment-size limit.");
    return body;
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
        version: 1, target: request.target, request: originalRequest(request), producer: producer(request),
        fingerprints: prepared.fingerprints, snapshotHash: prepared.snapshotHash,
        createdAt: clock().toISOString(), draft,
    };
    bundle.marker = markerFor(bundle);
    bundle.body = renderDraft(bundle);
    bundle.bodyHash = digest(bundle.body);
    requireValue(Buffer.byteLength(JSON.stringify(bundle)) <= MAX_BUNDLE_BYTES, "The review bundle is too large.");
    return bundle;
}

export function readJson(directory, filename, maximum) {
    const entries = fs.readdirSync(directory);
    requireValue(entries.length === 1 && entries[0] === filename, "Unexpected files in the downloaded artifact.");
    const file = path.join(directory, filename);
    const info = fs.lstatSync(file);
    requireValue(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= maximum,
        "The artifact must contain one bounded regular JSON file.");
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error("The artifact does not contain valid JSON.");
        }
        throw error;
    }
}

export function writeJson(directory, filename, value) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, filename), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}

export async function identifyPublication(github, context, env, clock = () => new Date()) {
    const request = authorize(context, env, "publish");
    await verifyCommand(github, request);
    const controls = await currentControls(github);
    const executing = await readControls(github, request.commit);
    requireValue(equal(executing.fingerprints, controls.fingerprints),
        "The publisher's trusted code changed while queued. Post a new command after reviewing the changes.");
    const artifact = (await github.rest.actions.getArtifact({ ...API_REPO, artifact_id: request.command.artifactId })).data;
    requireValue(artifact.id === request.command.artifactId && artifact.expired === false &&
        Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= MAX_BUNDLE_BYTES * 2,
    "The approved artifact is unavailable, expired, or too large.");
    const attemptMatch = new RegExp(`^${DRAFT_ARTIFACT_PREFIX}([1-9][0-9]*)$`).exec(artifact.name);
    requireValue(attemptMatch, "The artifact is not a sealed discussion draft.");
    const attempt = integer(Number(attemptMatch[1]), "Invalid producer attempt.");
    timestamp(artifact.created_at, "Missing artifact creation time.");
    timestamp(artifact.expires_at, "Missing artifact expiry.");
    requireValue(Date.parse(request.commandCreatedAt) >= Date.parse(artifact.created_at),
        "Approval must be given after the sealed draft exists.");
    const validUntil = Math.min(Date.parse(artifact.expires_at), Date.parse(artifact.created_at) + MAX_AGE_MS);
    const now = clock();
    requireValue(now.getTime() >= Date.parse(artifact.created_at) && now.getTime() < validUntil, "The draft has expired. Request a new draft.");
    requireValue(artifact.workflow_run?.repository_id === REPOSITORY.id &&
        artifact.workflow_run.head_repository_id === REPOSITORY.id, "The artifact belongs to a different repository.");
    const runId = integer(artifact.workflow_run.id, "Missing producer run.");
    const run = (await github.rest.actions.getWorkflowRunAttempt({ ...API_REPO, run_id: runId, attempt_number: attempt })).data;
    const workflow = (await github.rest.actions.getWorkflow({ ...API_REPO, workflow_id: path.posix.basename(DRAFT_WORKFLOW) })).data;
    requireValue(run.id === runId && run.run_attempt === attempt && run.workflow_id === workflow.id &&
        [DRAFT_WORKFLOW, `${DRAFT_WORKFLOW}@refs/heads/${controls.branch}`].includes(run.path) &&
        run.status === "completed" && run.conclusion === "success" &&
        ["issue_comment", "discussion_comment"].includes(run.event) &&
        run.head_branch === controls.branch && run.head_sha === artifact.workflow_run.head_sha &&
        run.actor?.type === "User" && run.actor.id === OWNER.id &&
        run.triggering_actor?.type === "User" && run.triggering_actor.id === OWNER.id,
    "The artifact was not produced by a successful owner-authorized default-branch drafting run.");
    requireValue(SHA1.test(run.head_sha), "Invalid producer revision.");
    const produced = await readControls(github, run.head_sha);
    requireValue(equal(produced.fingerprints, controls.fingerprints),
        "The artifact was produced under older policy or automation code. Request a new draft.");
    return { request, artifact, run, controls, validUntil };
}

function validateBundle(bundle, publication) {
    exactKeys(bundle, ["version", "target", "request", "producer", "fingerprints", "snapshotHash", "createdAt", "draft",
        "marker", "body", "bodyHash"], "Unexpected review-bundle fields.");
    requireValue(bundle.version === 1 && equal(bundle.target, publication.request.target), "The draft belongs to another target.");
    requireValue(equal(bundle.producer, {
        runId: publication.run.id, attempt: publication.run.run_attempt,
        commit: publication.run.head_sha, workflow: DRAFT_WORKFLOW,
    }), "Producer provenance does not match the artifact.");
    requireValue(SHA256.test(bundle.snapshotHash) && SHA256.test(bundle.marker) && SHA256.test(bundle.bodyHash),
        "Missing draft integrity values.");
    timestamp(bundle.createdAt, "Missing draft creation time.");
    exactKeys(bundle.request, ["commentId", "commandBody", "commandCreatedAt"], "Missing original draft request.");
    identifier(bundle.request.commentId, "Missing original request ID.");
    requireValue(parseCommand(bundle.request.commandBody).action === "draft", "The source request was not a draft command.");
    timestamp(bundle.request.commandCreatedAt, "Missing original request time.");
    requireValue(Date.parse(bundle.createdAt) >= Date.parse(bundle.request.commandCreatedAt) &&
        Date.parse(bundle.createdAt) <= Date.parse(publication.artifact.created_at),
    "The draft's creation time does not match its recorded provenance.");
    requireValue(equal(validateDraft(bundle.draft), bundle.draft), "The draft does not match the supported schema.");
    requireValue(equal(bundle.fingerprints, publication.controls.fingerprints), "Policy or workflow code changed. Request a new draft.");
    requireValue(markerFor(bundle) === bundle.marker && renderDraft(bundle) === bundle.body &&
        digest(bundle.body) === bundle.bodyHash && bundle.bodyHash === publication.request.command.bodyHash,
    "The approval does not match the exact rendered draft.");
}

export function publishedComment(thread, bundle) {
    const marker = `<!-- typechat-discussion-draft:v1:${bundle.marker} -->`;
    const matches = thread.comments.filter(comment => comment.parentId === null &&
        comment.author?.type === "Bot" && comment.author.id === ACTIONS_BOT_ID && comment.body.includes(marker));
    requireValue(matches.length <= 1, "More than one publication marker exists. Human inspection is required.");
    if (!matches.length) {
        return null;
    }
    requireValue(lf(matches[0].body) === bundle.body, "An existing bot comment has different content. It will not be overwritten.");
    return matches[0];
}

async function listArtifacts(github, runId) {
    const artifacts = [];
    let total;
    for (let page = 1; page <= 10; page++) {
        const data = (await github.rest.actions.listWorkflowRunArtifacts({ ...API_REPO, run_id: runId, per_page: 100, page })).data;
        requireValue(Array.isArray(data.artifacts) && Number.isSafeInteger(data.total_count) &&
            data.total_count >= 0 && data.total_count <= 1000, "Artifact history is unavailable or exceeds the pilot limit.");
        requireValue(total === undefined || total === data.total_count, "Artifact history changed during pagination.");
        total = data.total_count;
        artifacts.push(...data.artifacts);
        if (artifacts.length === total) {
            return artifacts;
        }
        requireValue(artifacts.length < total && data.artifacts.length === 100, "Artifact history is incomplete.");
    }
    throw new Error("Artifact history exceeds the pilot limit. Human inspection is required.");
}

async function priorIntent(github, publication, excludeId) {
    const prefix = `${INTENT_PREFIX}${publication.artifact.id}-`;
    const current = await listArtifacts(github, publication.request.runId);
    const existing = current.find(artifact => artifact.id !== excludeId && artifact.name.startsWith(prefix));
    if (existing) {
        return { runId: publication.request.runId, artifactId: existing.id };
    }
    const seen = new Set();
    let total;
    for (let page = 1; page <= 10; page++) {
        const data = (await github.rest.actions.listWorkflowRuns({
            ...API_REPO, workflow_id: path.posix.basename(PUBLISH_WORKFLOW), actor: OWNER.login,
            created: `>=${publication.artifact.created_at}`, per_page: 100, page,
        })).data;
        requireValue(Array.isArray(data.workflow_runs) && Number.isSafeInteger(data.total_count) &&
            data.total_count >= 0 && data.total_count <= 1000, "Publication history is unavailable or exceeds the pilot limit.");
        requireValue(total === undefined || total === data.total_count, "Publication history changed during pagination.");
        total = data.total_count;
        for (const run of data.workflow_runs) {
            integer(run.id, "Invalid publication history run ID.");
            requireValue(!seen.has(run.id), "Publication history changed during pagination.");
            seen.add(run.id);
            if (run.id === publication.request.runId) {
                continue;
            }
            const found = (await listArtifacts(github, run.id)).find(artifact => artifact.name.startsWith(prefix));
            if (found) {
                return { runId: run.id, artifactId: found.id };
            }
        }
        if (seen.size === total) {
            return null;
        }
        requireValue(seen.size < total && data.workflow_runs.length === 100, "Publication history is incomplete.");
    }
    throw new Error("Publication history exceeds the pilot limit. No comment will be posted.");
}

async function verifyBundleContext(github, publication, bundle) {
    validateBundle(bundle, publication);
    await verifyCommand(github, {
        ...publication.request, ...bundle.request, command: { action: "draft" },
    });
    const thread = await readThread(github, publication.request.target);
    const existing = publishedComment(thread, bundle);
    if (existing) {
        return { existing, thread };
    }
    requireOpen(thread);
    requireValue(snapshotHash(thread) === bundle.snapshotHash, "The target context changed. Request and approve a new draft.");
    await verifyReferences(github, bundle.draft.pullRequests);
    return { existing: null, thread };
}

export async function checkPublication(github, context, env, bundle, clock = () => new Date()) {
    const publication = await identifyPublication(github, context, env, clock);
    const { existing } = await verifyBundleContext(github, publication, bundle);
    if (existing) {
        return { shouldPost: false, url: existing.url };
    }
    const prior = await priorIntent(github, publication);
    requireValue(!prior, "A previous publication intent exists without a confirmed comment. Inspect that run; automatic retry is blocked.");
    return {
        shouldPost: true,
        intentName: `${INTENT_PREFIX}${publication.artifact.id}-${publication.request.attempt}`,
        intent: {
            version: 1, artifactId: publication.artifact.id, bodyHash: bundle.bodyHash,
            target: bundle.target, approvalComment: publication.request.commentId,
            runId: publication.request.runId, attempt: publication.request.attempt,
        },
    };
}

export async function publishDraft(github, context, env, bundle, intentId, clock = () => new Date()) {
    const publication = await identifyPublication(github, context, env, clock);
    const { existing } = await verifyBundleContext(github, publication, bundle);
    if (existing) {
        return { posted: false, url: existing.url };
    }
    const intent = (await github.rest.actions.getArtifact({ ...API_REPO, artifact_id: integer(Number(intentId), "Missing durable publication intent.") })).data;
    requireValue(intent.id === Number(intentId) &&
        intent.name === `${INTENT_PREFIX}${publication.artifact.id}-${publication.request.attempt}` &&
        intent.workflow_run?.id === publication.request.runId &&
        intent.workflow_run.repository_id === REPOSITORY.id && intent.workflow_run.head_sha === context.sha &&
        intent.expired === false &&
        Date.parse(intent.expires_at) >= publication.validUntil, "The publication intent is missing, stale, or insufficiently retained.");
    requireValue(!await priorIntent(github, publication, intent.id),
        "A previous publication attempt exists. No second write will be attempted.");
    const latest = await identifyPublication(github, context, env, clock);
    const rechecked = await verifyBundleContext(github, latest, bundle);
    if (rechecked.existing) {
        return { posted: false, url: rechecked.existing.url };
    }
    await verifyCommand(github, latest.request);
    let comment;
    try {
        if (bundle.target.kind === "issue") {
            const result = await github.rest.issues.createComment({
                ...API_REPO, issue_number: bundle.target.number, body: bundle.body,
            });
            comment = { id: result.data.node_id, url: result.data.html_url, body: result.data.body };
        } else {
            const result = await github.graphql(`mutation DiscussionPilotPost($id:ID!,$body:String!) {
              addDiscussionComment(input:{discussionId:$id,body:$body}) { comment { id url body } }
            }`, { id: bundle.target.id, body: bundle.body });
            comment = result.addDiscussionComment?.comment;
        }
    } catch (error) {
        throw new Error("Publication outcome is uncertain. The intent is retained; inspect GitHub before any manual recovery.", { cause: error });
    }
    requireValue(comment && typeof comment.id === "string" && typeof comment.url === "string" &&
        comment.url.startsWith(bundle.target.url + "#") &&
        typeof comment.body === "string" && lf(comment.body) === bundle.body,
    "GitHub did not confirm the exact comment. The intent is retained; inspect before retrying.");
    return { posted: true, id: comment.id, url: comment.url, bodyHash: bundle.bodyHash };
}

export async function draftSummary(core, bundle, artifactId, artifactUrl) {
    integer(Number(artifactId), "Missing sealed artifact ID.");
    await core.summary.addHeading(`Draft for ${bundle.target.kind} #${bundle.target.number}`)
        .addRaw("Review the exact preview below. Publishing is not acceptance of work or permission to implement.\n\n")
        .addLink("Sealed review artifact", artifactUrl)
        .addRaw(`\n\nPost this command in the same ${bundle.target.kind} as the human project owner:\n\n`)
        .addCodeBlock(`/typechat publish ${artifactId}:${bundle.bodyHash}`, "text")
        .addRaw("\n\n---\n\n" + bundle.body).write();
}
