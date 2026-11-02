// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
    ACTIONS_BOT_ID, CONTROL_PATHS, MAX_COMMENT_BYTES, MAX_CONTEXT_BYTES, OWNER, REPOSITORY,
    digest, parseCommand, priorIntent, readControls, readJson, readThread, renderAcceptance, snapshotHash, stageDetectionContent, writeJson,
} from "./discussion-draft.mjs";
import { IMPLEMENTATION_APP, IMPLEMENTATION_PERMISSIONS } from "./implementation-app.mjs";

export const BUILD_WORKFLOW = ".github/workflows/issue-implementation.lock.yml";
export const BUILD_CONTROL_PATHS = Object.freeze([...CONTROL_PATHS,
    ".github/workflows/issue-implementation.md", BUILD_WORKFLOW, ".github/workflows/agent-workflow-check.yml",
    ".github/aw/actions-lock.json", "tools/issue-implementation.mjs", "tools/implementation-app.mjs",
    "tools/implementation-sandbox.mjs", ".nvmrc", "typescript/package.json", "typescript/package-lock.json",
    "python/pyproject.toml", "python/package.json", "python/package-lock.json", "site/package.json", "site/package-lock.json",
]);
export const BUILD_LIMITS = Object.freeze({
    mainCredits: 1000, detectionCredits: 400, maxTurns: 1000, agentMinutes: 60,
    commandHours: 24, preflightMinutes: 15, maxFiles: 20, candidateBytes: 65536, patchBytes: 131072,
});
export const BUILD_START_PREFIX = "typechat-build-start-";
export const BUILD_WRITE_PREFIX = "typechat-build-write-";
const API_REPO = Object.freeze({ owner: REPOSITORY.owner, repo: REPOSITORY.repo });
const REPO_NAME = `${REPOSITORY.owner}/${REPOSITORY.repo}`;
const REPO_URL = `https://github.com/${REPO_NAME}`;
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function requireValue(condition, message) {
    if (!condition) throw new Error(message);
}

function keys(value, expected, message) {
    requireValue(value && typeof value === "object" && !Array.isArray(value) &&
        Object.keys(value).sort().join("\n") === [...expected].sort().join("\n"), message);
}

function integer(value, message) {
    requireValue(Number.isSafeInteger(value) && value > 0, message);
    return value;
}

function text(value, maximum, message) {
    requireValue(typeof value === "string" && value.length > 0 && value.length <= maximum &&
        value.trim() === value && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value), message);
    return value;
}

function same(left, right) {
    return digest(left) === digest(right);
}

function timestamp(value, message) {
    requireValue(typeof value === "string" && Number.isFinite(Date.parse(value)), message);
    return Date.parse(value);
}

function commentNumber(comment) {
    const match = /#issuecomment-([1-9][0-9]*)$/.exec(comment.url);
    requireValue(match, "The Issue comment has an invalid URL.");
    return integer(Number(match[1]), "Invalid Issue comment identifier.");
}

export function buildCommand(acceptanceId, bodyHash) {
    integer(acceptanceId, "Invalid acceptance comment identifier.");
    requireValue(typeof bodyHash === "string" && SHA256.test(bodyHash), "Invalid acceptance hash.");
    return `/typechat build ${acceptanceId}:${bodyHash}`;
}

export function parseBuildCommand(body) {
    requireValue(typeof body === "string" && body.length <= 2000, "Missing build command.");
    const match = /^\/typechat build ([1-9][0-9]*):([a-fA-F0-9]{64})\s*$/.exec(body);
    requireValue(match, "Use /typechat build <acceptance-comment-id>:<sha256> without inline notes.");
    return { acceptanceId: integer(Number(match[1]), "Invalid acceptance comment identifier."), bodyHash: match[2].toLowerCase() };
}

function decodeMarkdown(value) {
    return value.replace(/\\([\\`*_{}\[\]()#+\-.!|~@])/g, "$1")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function parseAcceptedWork(body, target) {
    requireValue(typeof body === "string" && Buffer.byteLength(body) <= MAX_COMMENT_BYTES && target.kind === "issue",
        "The accepted work is not a bounded Issue record.");
    const sections = body.split("\n\n");
    requireValue(sections.length === 9 || sections.length === 10, "The accepted-work record has an unsupported shape.");
    function list(index, title) {
        const prefix = `### ${title}\n`;
        requireValue(sections[index].startsWith(prefix), `Missing accepted ${title}.`);
        const lines = sections[index].slice(prefix.length).split("\n");
        requireValue(lines.length > 0 && lines.length <= 12 && lines.every(line => line.startsWith("- ")),
            `Invalid accepted ${title}.`);
        return lines.map(line => text(decodeMarkdown(line.slice(2)), 800, `Invalid accepted ${title}.`));
    }
    requireValue(sections[2].startsWith("### Goal\n"), "Missing accepted goal.");
    const terms = {
        goal: text(decodeMarkdown(sections[2].slice("### Goal\n".length)), 2000, "Invalid accepted goal."),
        scope: list(3, "Scope"), nonGoals: list(4, "Non-goals"), criteria: list(5, "Acceptance criteria"),
    };
    const references = [];
    if (sections.length === 10) {
        requireValue(sections[6].startsWith("### Existing contributions\n"), "Invalid contribution evidence.");
        const lines = sections[6].slice("### Existing contributions\n".length).split("\n");
        requireValue(lines.length > 0 && lines.length <= 8, "Invalid contribution count.");
        for (const line of lines) {
            const match = /^- \[#([1-9][0-9]*)\]\(https:\/\/github\.com\/microsoft\/TypeChat\/pull\/\1\) at \[([a-f0-9]{7})\]\(https:\/\/github\.com\/microsoft\/TypeChat\/commit\/([a-f0-9]{40})\)$/.exec(line);
            requireValue(match && match[3].startsWith(match[2]), "Invalid accepted contribution revision.");
            references.push({ number: integer(Number(match[1]), "Invalid PR number."), headSha: match[3] });
        }
        requireValue(new Set(references.map(reference => reference.number)).size === references.length, "Duplicate contribution evidence.");
    }
    const provenance = /^\[Proposal run\]\(https:\/\/github\.com\/microsoft\/TypeChat\/actions\/runs\/([1-9][0-9]*)\/attempts\/([1-9][0-9]*)\) \| \[Approved scope policy\]\(https:\/\/github\.com\/microsoft\/TypeChat\/blob\/([a-f0-9]{40})\/GOALS\.md\)$/.exec(sections.at(-3));
    const marker = /^<!-- typechat-work-acceptance:v1:([a-f0-9]{64}) -->\n$/.exec(sections.at(-1));
    requireValue(provenance && marker, "Missing accepted-work provenance.");
    const producer = {
        runId: integer(Number(provenance[1]), "Invalid proposal run."), attempt: integer(Number(provenance[2]), "Invalid proposal attempt."),
        commit: provenance[3],
    };
    const reconstructed = renderAcceptance({
        target, producer, marker: marker[1],
        draft: { proposal: { goal: terms.goal, scope: terms.scope, nonGoals: terms.nonGoals },
            suggestedCriteria: terms.criteria, pullRequests: references },
    });
    requireValue(reconstructed === body, "The record is not an exact canonical acceptance.");
    return { terms, references, policyCommit: producer.commit };
}

export function authorizeBuild(context, env) {
    const event = context.payload;
    requireValue(event?.repository?.id === REPOSITORY.id && event.repository.full_name === REPO_NAME &&
        event.repository.private === false, "Implementation is restricted to public microsoft/TypeChat.");
    requireValue(event.sender?.type === "User" && event.sender.id === OWNER.id &&
        context.actor === OWNER.login && env.GITHUB_TRIGGERING_ACTOR === OWNER.login,
    "Only the human project owner can request implementation.");
    const branch = event.repository.default_branch;
    requireValue(typeof branch === "string" && branch.length > 0 && SHA1.test(context.sha) &&
        env.GITHUB_REF === `refs/heads/${branch}` &&
        env.GITHUB_WORKFLOW_REF === `${REPO_NAME}/${BUILD_WORKFLOW}@refs/heads/${branch}`,
    "Implementation must execute trusted default-branch workflow code.");
    integer(Number(context.runId), "Invalid implementation run.");
    integer(Number(env.GITHUB_RUN_ATTEMPT), "Invalid implementation attempt.");
    if (context.eventName === "workflow_dispatch") {
        requireValue(!event.inputs?.aw_context, "Inline implementation context is not supported.");
        const number = integer(Number(event.inputs?.issue), "Supply an Issue number.");
        const acceptanceId = integer(Number(event.inputs?.acceptance), "Supply an acceptance comment identifier.");
        return { mode: "command", number, acceptanceId, branch };
    }
    requireValue(context.eventName === "issue_comment" && event.action === "created" && !event.issue?.pull_request &&
        event.comment?.user?.id === OWNER.id && event.comment.user.type === "User",
    "Only a newly created owner comment on an Issue can authorize a build.");
    const number = integer(event.issue?.number, "Missing Issue number.");
    const target = { kind: "issue", number, id: text(event.issue.node_id, 256, "Missing Issue node ID."),
        url: `${REPO_URL}/issues/${number}` };
    requireValue(event.issue.html_url === target.url, "Unexpected Issue URL.");
    const command = parseBuildCommand(event.comment.body);
    const commentId = integer(event.comment.id, "Missing owner command identifier.");
    requireValue(event.comment.html_url === `${target.url}#issuecomment-${commentId}`, "Unexpected owner command URL.");
    return {
        mode: "build", target, command, branch, commentId, nodeId: text(event.comment.node_id, 256, "Missing owner command node ID."),
        body: event.comment.body.replace(/\r\n/g, "\n"),
        createdAt: new Date(timestamp(event.comment.created_at, "Missing command creation time.")).toISOString(),
        runId: Number(context.runId), attempt: Number(env.GITHUB_RUN_ATTEMPT), commit: context.sha,
    };
}

async function currentBuildControls(github, context) {
    const repo = (await github.rest.repos.get(API_REPO)).data;
    requireValue(repo.id === REPOSITORY.id && repo.full_name === REPO_NAME && repo.private === false &&
        repo.default_branch === context.payload.repository.default_branch, "Repository or default branch changed.");
    const commit = (await github.rest.repos.getBranch({ ...API_REPO, branch: repo.default_branch })).data.commit?.sha;
    requireValue(SHA1.test(commit), "The current default-branch revision is unavailable.");
    const controls = await readControls(github, commit, BUILD_CONTROL_PATHS);
    const executing = await readControls(github, context.sha, BUILD_CONTROL_PATHS);
    requireValue(same(controls.fingerprints, executing.fingerprints), "Implementation controls changed; request a new run.");
    return { ...controls, commit, branch: repo.default_branch };
}

function ownerComment(thread, request) {
    const comment = thread.comments.find(value => value.id === request.nodeId);
    requireValue(comment && comment.url === `${request.target.url}#issuecomment-${request.commentId}` &&
        comment.author?.type === "User" && comment.author.login === OWNER.login && !comment.minimized &&
        comment.lastEditedAt === null && comment.body === request.body &&
        Date.parse(comment.createdAt) === Date.parse(request.createdAt),
    "The owner command is missing, edited, hidden, or withdrawn.");
    return comment;
}

async function acceptanceRecord(github, thread, acceptanceId, expectedHash, current) {
    const comment = thread.comments.find(value => value.url === `${thread.target.url}#issuecomment-${acceptanceId}`);
    requireValue(comment && comment.author?.type === "Bot" && comment.author.id === ACTIONS_BOT_ID &&
        comment.parentId === null && comment.lastEditedAt === null && !comment.minimized,
    "The immutable Actions-bot acceptance record is missing, edited, or hidden.");
    const bodyHash = digest(comment.body);
    requireValue(expectedHash === undefined || bodyHash === expectedHash, "The accepted-work hash does not match.");
    const parsed = parseAcceptedWork(comment.body, thread.target);
    const approvals = thread.comments.filter(value => value.author?.type === "User" && value.author.login === OWNER.login &&
        value.lastEditedAt === null && !value.minimized &&
        /^\/typechat accept [1-9][0-9]*:[a-fA-F0-9]{64}\s*$/.test(value.body) &&
        parseCommand(value.body).bodyHash === bodyHash && Date.parse(value.createdAt) <= Date.parse(comment.createdAt))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    requireValue(approvals.length > 0, "No unchanged public owner approval binds this exact acceptance.");
    const approval = approvals[0];
    const rest = (await github.rest.issues.getComment({ ...API_REPO, comment_id: commentNumber(approval) })).data;
    requireValue(rest.node_id === approval.id && rest.user?.id === OWNER.id && rest.user.type === "User" &&
        rest.body.replace(/\r\n/g, "\n") === approval.body && rest.html_url === approval.url,
    "The prior acceptance approval does not belong to the human owner.");
    const comparison = (await github.rest.repos.compareCommitsWithBasehead({
        ...API_REPO, basehead: `${parsed.policyCommit}...${current.commit}`,
    })).data;
    requireValue(["ahead", "identical"].includes(comparison.status) && comparison.merge_base_commit?.sha === parsed.policyCommit,
        "The accepted policy revision is not approved default-branch history.");
    const policy = (await github.rest.repos.getContent({ ...API_REPO, path: "GOALS.md", ref: parsed.policyCommit })).data;
    requireValue(policy.type === "file" && policy.sha === current.fingerprints["GOALS.md"],
        "The scope policy changed after acceptance; obtain a new proposal and owner decision.");
    for (const reference of parsed.references) {
        const pr = (await github.rest.pulls.get({ ...API_REPO, pull_number: reference.number })).data;
        requireValue(pr.base?.repo?.id === REPOSITORY.id && pr.head?.sha === reference.headSha,
            `Accepted contribution #${reference.number} changed; obtain fresh agreement.`);
    }
    return {
        id: acceptanceId, nodeId: comment.id, url: comment.url, body: comment.body, bodyHash,
        createdAt: comment.createdAt, approvalId: approval.id, approvalUrl: approval.url,
        approvalBody: approval.body, ...parsed,
    };
}

export function scopeKey(target, acceptance) {
    return digest({ repositoryId: REPOSITORY.id, issue: target.number, acceptanceId: acceptance.id, bodyHash: acceptance.bodyHash });
}

export function buildBranch(target, acceptance) {
    return `typechat/implementation/${target.number}-${acceptance.id}-${acceptance.bodyHash.slice(0, 12)}`;
}

function requestKey(request) {
    return digest({ repositoryId: REPOSITORY.id, issue: request.target.number, commentId: request.commentId });
}

async function existingBuild(github, target, acceptance) {
    const branch = buildBranch(target, acceptance);
    const prs = (await github.rest.pulls.list({ ...API_REPO, state: "all", head: `${REPOSITORY.owner}:${branch}`, per_page: 2, page: 1 })).data;
    requireValue(Array.isArray(prs) && prs.length <= 1, "Implementation result history is ambiguous.");
    if (prs.length) {
        const pr = prs[0];
        const marker = new RegExp(`<!-- typechat-build:v1:${scopeKey(target, acceptance)}:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64} -->`);
        requireValue(pr.user?.id === IMPLEMENTATION_APP.botId && pr.user.type === "Bot" &&
            pr.head?.ref === branch && pr.head.repo?.id === REPOSITORY.id && pr.base?.repo?.id === REPOSITORY.id &&
            typeof pr.body === "string" && marker.test(pr.body) &&
            pr.html_url === `${REPO_URL}/pull/${integer(pr.number, "Invalid existing PR number.")}`,
        "The implementation branch or PR belongs to other work; it will not be overwritten.");
        return { mode: "existing", url: pr.html_url, number: pr.number };
    }
    try {
        await github.rest.git.getRef({ ...API_REPO, ref: `heads/${branch}` });
    } catch (error) {
        if (error.status !== 404) throw error;
        return null;
    }
    throw new Error("An implementation branch exists without a confirmed PR; inspect the earlier write before recovery.");
}

async function competingContributions(github, target, acceptance) {
    const associated = new Set(acceptance.references.map(reference => reference.number));
    const query = `query ImplementationContributions($owner:String!,$repo:String!,$number:Int!,$after:String) {
      repository(owner:$owner,name:$repo) { issue(number:$number) {
        timelineItems(first:100,after:$after,itemTypes:[CROSS_REFERENCED_EVENT,CONNECTED_EVENT]) {
          pageInfo { hasNextPage endCursor }
          nodes {
            ... on CrossReferencedEvent { source { ... on PullRequest { number state repository { nameWithOwner } } } }
            ... on ConnectedEvent { subject { ... on PullRequest { number state repository { nameWithOwner } } } }
          }
        }
      } }
    }`;
    let after = null;
    const cursors = new Set();
    let count = 0;
    do {
        const connection = (await github.graphql(query, { ...API_REPO, number: target.number, after }))
            .repository?.issue?.timelineItems;
        requireValue(Array.isArray(connection?.nodes) && typeof connection.pageInfo?.hasNextPage === "boolean",
            "Contribution-link evidence is unavailable.");
        count += connection.nodes.length;
        requireValue(count <= 1000, "The Issue's contribution history exceeds the pilot bound.");
        for (const event of connection.nodes) {
            const pr = event.source ?? event.subject;
            if (pr?.state === "OPEN") {
                throw new Error("An open contribution is already linked to this Issue; ask the owner before competing with it.");
            }
        }
        after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
        if (after) {
            requireValue(typeof after === "string" && !cursors.has(after), "Contribution pagination is incomplete.");
            cursors.add(after);
        } else {
            requireValue(connection.pageInfo.hasNextPage === false, "Missing contribution continuation cursor.");
        }
    } while (after);
    const mention = new RegExp(`(?:^|[^A-Za-z0-9_/])#${target.number}(?![0-9])|https://github\\.com/microsoft/TypeChat/issues/${target.number}(?![0-9])`);
    for (let page = 1; page <= 10; page++) {
        const prs = (await github.rest.pulls.list({ ...API_REPO, state: "open", per_page: 100, page })).data;
        requireValue(Array.isArray(prs) && prs.length <= 100, "Open-contribution coverage is unavailable.");
        for (const pr of prs) {
            requireValue(typeof pr.title === "string" && (pr.body === null || typeof pr.body === "string"),
                "Open-contribution metadata is incomplete.");
            requireValue(!associated.has(pr.number) && !mention.test(`${pr.title}\n${pr.body ?? ""}`),
                `Open PR #${pr.number} may already implement this Issue; obtain owner guidance instead of a competing patch.`);
        }
        if (prs.length < 100) return;
    }
    throw new Error("The open-contribution listing exceeds the pilot bound.");
}

function requireOpen(thread) {
    requireValue(thread.target.state === "OPEN" && thread.target.locked === false, "The Issue is closed or locked.");
}

export async function prepareBuild(github, context, env, clock = () => new Date()) {
    const request = authorizeBuild(context, env);
    const current = await currentBuildControls(github, context);
    let target = request.target;
    if (request.mode === "command") {
        const issue = (await github.rest.issues.get({ ...API_REPO, issue_number: request.number })).data;
        requireValue(!issue.pull_request && issue.number === request.number && issue.html_url === `${REPO_URL}/issues/${request.number}`,
            "Command preparation requires an Issue in TypeChat.");
        target = { kind: "issue", number: issue.number, id: text(issue.node_id, 256, "Missing Issue node ID."), url: issue.html_url };
    }
    const thread = await readThread(github, target);
    requireOpen(thread);
    if (request.mode === "build") ownerComment(thread, request);
    const acceptance = await acceptanceRecord(github, thread,
        request.mode === "command" ? request.acceptanceId : request.command.acceptanceId, request.command?.bodyHash, current);
    const existing = await existingBuild(github, target, acceptance);
    if (existing) return existing;
    await competingContributions(github, target, acceptance);
    requireValue(!await priorIntent(github, `${BUILD_WRITE_PREFIX}${scopeKey(target, acceptance)}`),
        "An earlier publication is unresolved; inspect it before requesting more work.");
    if (request.mode === "command") {
        return { mode: "command", command: buildCommand(acceptance.id, acceptance.bodyHash), acceptanceUrl: acceptance.url,
            enabled: env.TYPECHAT_IMPLEMENTATION_ENABLED === "true" };
    }
    const now = clock();
    const age = now.getTime() - Date.parse(request.createdAt);
    requireValue(env.TYPECHAT_IMPLEMENTATION_ENABLED === "true", "The implementation pilot is not activated.");
    requireValue(request.attempt === 1, "Reruns cannot spend implementation credits; use fresh owner authorization after inspection.");
    requireValue(age >= 0 && age < BUILD_LIMITS.commandHours * 3600000, "The build authorization is expired.");
    requireValue(Date.parse(acceptance.createdAt) <= Date.parse(request.createdAt), "The build command predates acceptance.");
    requireValue(current.commit === request.commit, "The source revision changed while queued; request a new build.");
    const startName = `${BUILD_START_PREFIX}${requestKey(request)}`;
    requireValue(!await priorIntent(github, startName), "This owner command already reserved a coding run; no retry spending is allowed.");
    return { mode: "build", target, request, acceptance, current, thread, startName, createdAt: now.toISOString() };
}

export function freezeBuild(plan, app, clock = () => new Date()) {
    requireValue(plan.mode === "build" && app.appId === IMPLEMENTATION_APP.id && app.repositoryId === REPOSITORY.id &&
        Number.isSafeInteger(app.installationId) && app.installationId > 0 && same(app.permissions, IMPLEMENTATION_PERMISSIONS),
    "Missing verified, least-privilege App access.");
    keys(app, ["appId", "installationId", "repositoryId", "permissions", "verifiedAt"], "Unexpected App proof fields.");
    const age = clock().getTime() - timestamp(app.verifiedAt, "Missing App verification time.");
    requireValue(age >= 0 && age < BUILD_LIMITS.preflightMinutes * 60000, "The App preflight is stale.");
    const prepared = {
        version: 1, target: plan.target, request: plan.request, acceptance: plan.acceptance,
        source: { commit: plan.current.commit, branch: plan.current.branch, fingerprints: plan.current.fingerprints },
        policyText: plan.current.policyText, thread: plan.thread, snapshotHash: snapshotHash(plan.thread),
        app, limits: { ...BUILD_LIMITS }, createdAt: plan.createdAt,
        expiresAt: new Date(Date.parse(plan.request.createdAt) + BUILD_LIMITS.commandHours * 3600000).toISOString(),
    };
    requireValue(Buffer.byteLength(JSON.stringify(prepared)) <= MAX_CONTEXT_BYTES, "The frozen implementation context exceeds 1 MiB.");
    return prepared;
}

export async function verifyBuildAuthorization(github, context, env, prepared, clock = () => new Date()) {
    const request = authorizeBuild(context, env);
    requireValue(request.mode === "build" && prepared.version === 1 && same(request, prepared.request) &&
        same(prepared.target, request.target) && same(prepared.limits, BUILD_LIMITS),
    "The frozen context belongs to a different command, run, revision, or budget.");
    requireValue(env.TYPECHAT_IMPLEMENTATION_ENABLED === "true" && request.attempt === 1,
        "Implementation is disabled or this is a retry-spending attempt.");
    requireValue(clock().getTime() < timestamp(prepared.expiresAt, "Missing build expiry.") &&
        clock().getTime() >= Date.parse(prepared.createdAt) &&
        Date.parse(prepared.expiresAt) === Date.parse(request.createdAt) + BUILD_LIMITS.commandHours * 3600000,
    "The frozen authorization has expired or has invalid timestamps.");
    const current = await currentBuildControls(github, context);
    requireValue(current.commit === prepared.source.commit && same(current.fingerprints, prepared.source.fingerprints),
        "The source revision, policy, or workflow controls changed; no publication is authorized.");
    const thread = await readThread(github, request.target);
    requireOpen(thread);
    ownerComment(thread, request);
    const acceptance = await acceptanceRecord(github, thread, request.command.acceptanceId, request.command.bodyHash, current);
    requireValue(same(acceptance, prepared.acceptance) && snapshotHash(thread) === prepared.snapshotHash,
        "The acceptance or discussion changed after authorization; obtain a new owner decision.");
    await competingContributions(github, request.target, acceptance);
    return request;
}

export async function verifyBuildArtifact(github, context, id, name, maximum, now = new Date()) {
    const artifact = (await github.rest.actions.getArtifact({ ...API_REPO, artifact_id: integer(Number(id), "Missing build artifact ID.") })).data;
    requireValue(artifact.id === Number(id) && artifact.name === name && artifact.expired === false &&
        artifact.workflow_run?.id === Number(context.runId) && artifact.workflow_run.repository_id === REPOSITORY.id &&
        artifact.workflow_run.head_repository_id === REPOSITORY.id && artifact.workflow_run.head_sha === context.sha &&
        Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= maximum * 2 &&
        timestamp(artifact.created_at, "Missing artifact time.") <= now.getTime() &&
        timestamp(artifact.expires_at, "Missing artifact expiry.") > now.getTime(),
    "The implementation artifact has invalid origin, size, availability, or lifetime.");
    return artifact;
}

export async function findBuildArtifact(github, context, env, name, maximum, clock = () => new Date()) {
    const request = authorizeBuild(context, env);
    requireValue(request.mode === "build" && request.attempt === 1, "Artifact handoff cannot authorize retry spending.");
    const listing = (await github.rest.actions.listWorkflowRunArtifacts({
        ...API_REPO, run_id: request.runId, name, per_page: 2, page: 1,
    })).data;
    requireValue(listing?.total_count === 1 && Array.isArray(listing.artifacts) && listing.artifacts.length === 1,
        "The exact implementation artifact is missing or ambiguous.");
    return (await verifyBuildArtifact(github, context, listing.artifacts[0].id, name, maximum, clock())).id;
}

export async function verifyBuildStart(github, context, env, prepared, intentId, clock = () => new Date()) {
    await verifyBuildAuthorization(github, context, env, prepared, clock);
    const age = clock().getTime() - Date.parse(prepared.app.verifiedAt);
    requireValue(age >= 0 && age < BUILD_LIMITS.preflightMinutes * 60000, "The App preflight is too old to start inference.");
    const name = `${BUILD_START_PREFIX}${requestKey(prepared.request)}`;
    const artifact = await verifyBuildArtifact(github, context, intentId, name, MAX_CONTEXT_BYTES, clock());
    requireValue(Date.parse(artifact.expires_at) > Date.parse(prepared.expiresAt), "The spending reservation expires before authorization.");
    requireValue(!await priorIntent(github, name, artifact.id), "A coding run was already reserved for this command.");
}

export function validateCandidate(candidate, prepared, tree) {
    keys(candidate, ["version", "contextHash", "baseSha", "summary", "limitations", "files"], "Unexpected patch candidate fields.");
    requireValue(candidate.version === 1 && candidate.contextHash === digest(prepared) &&
        candidate.baseSha === prepared.source.commit, "The patch does not bind the exact accepted context and source.");
    text(candidate.summary, 2000, "Missing bounded patch summary.");
    requireValue(Array.isArray(candidate.limitations) && candidate.limitations.length <= 8, "Invalid patch limitations.");
    candidate.limitations.forEach(value => text(value, 800, "Invalid patch limitation."));
    requireValue(Array.isArray(candidate.files) && candidate.files.length > 0 && candidate.files.length <= BUILD_LIMITS.maxFiles &&
        Buffer.byteLength(JSON.stringify(candidate)) <= BUILD_LIMITS.candidateBytes, "The candidate exceeds the pilot's patch bounds.");
    requireValue(tree?.truncated === false && Array.isArray(tree.tree), "The fixed source tree is incomplete.");
    const baseline = new Map(tree.tree.filter(entry => entry.type !== "tree").map(entry => [entry.path, entry]));
    const folded = new Map([...baseline.keys()].map(file => [file.toLowerCase(), file]));
    const seen = new Set();
    for (const file of candidate.files) {
        keys(file, ["path", "previousSha", "content"], "Unexpected changed-file fields.");
        const name = file.path;
        requireValue(typeof name === "string" && name.length <= 240 &&
            /^(?:README\.md|(?:typescript|python|site)\/[A-Za-z0-9_./-]+)$/.test(name) &&
            !name.split("/").some(part => !part || part === "." || part === ".." || part.startsWith(".") ||
                /^(?:node_modules|dist|out|build|coverage|__pycache__|con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) &&
            !/(?:^|\/)(?:AGENTS|CLAUDE|SKILL|GOALS|AUTOMATION|OWNER-CHEATSHEET)\.md$/i.test(name) &&
            !/(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|pyproject\.toml|(?:yarn|pnpm|poetry|uv|hatch)\.lock|pnpm-lock\.yaml|(?:tsconfig|jsconfig|pyrightconfig)(?:\.[^/]+)?\.json|[^/]*\.config\.[^/]+|Dockerfile|Makefile|requirements[^/]*|conftest\.py|(?:pytest|tox|setup)\.(?:ini|cfg|py))$/i.test(name) &&
            !/\.(?:agent|instructions|prompt)\.md$/i.test(name),
        "The pilot cannot change automation, policy, dependencies, configuration, credentials, or unsupported paths.");
        requireValue(!seen.has(name.toLowerCase()) && (!folded.has(name.toLowerCase()) || folded.get(name.toLowerCase()) === name),
            "Case-colliding or duplicated patch paths are not supported.");
        seen.add(name.toLowerCase());
        const previous = baseline.get(name);
        requireValue(previous ? previous.type === "blob" && previous.mode === "100644" && previous.sha === file.previousSha :
            file.previousSha === null, "A changed file does not match the fixed source blob or mode.");
        requireValue(previous || file.content !== null, "A new file cannot be deleted.");
        if (file.content !== null) {
            requireValue(typeof file.content === "string" && Buffer.byteLength(file.content) <= BUILD_LIMITS.candidateBytes &&
                Buffer.from(file.content).toString("utf8") === file.content && !file.content.includes("\0") &&
                !file.content.includes("\r"), "Only bounded UTF-8, LF text changes are supported.");
            requireValue(!previous || blobHash(file.content) !== previous.sha, "The patch contains an unchanged file.");
        }
    }
    return candidate;
}

export function blobHash(content) {
    const bytes = Buffer.from(content);
    return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

export function applyCandidateFiles(candidate, directory) {
    const root = fs.realpathSync(directory);
    for (const file of candidate.files) {
        const destination = path.join(root, ...file.path.split("/"));
        requireValue(destination.startsWith(root + path.sep), "A candidate path escapes the isolated checkout.");
        let parent = path.dirname(destination);
        while (parent !== root) {
            const info = fs.lstatSync(parent, { throwIfNoEntry: false });
            requireValue(!info || info.isDirectory() && !info.isSymbolicLink(), "A candidate parent is not an ordinary directory.");
            parent = path.dirname(parent);
        }
        const info = fs.lstatSync(destination, { throwIfNoEntry: false });
        requireValue(file.previousSha === null ? !info :
            info?.isFile() && !info.isSymbolicLink() && blobHash(fs.readFileSync(destination)) === file.previousSha,
        "The isolated checkout differs from the approved patch base.");
        if (file.content === null) {
            fs.unlinkSync(destination);
        } else {
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.writeFileSync(destination, file.content, { encoding: "utf8", mode: 0o644, flag: file.previousSha === null ? "wx" : "w" });
        }
    }
}

export function patchForDetection(candidate, prepared, directory) {
    const git = args => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", maxBuffer: BUILD_LIMITS.patchBytes });
    requireValue(git(["rev-parse", "HEAD"]).trim() === prepared.source.commit, "Detection is not using the frozen checkout.");
    requireValue(git(["status", "--porcelain", "--untracked-files=all"]).trim() === "", "Detection requires an untouched trusted checkout.");
    applyCandidateFiles(candidate, directory);
    const additions = candidate.files.filter(file => file.previousSha === null).map(file => file.path);
    if (additions.length) git(["add", "--intent-to-add", "--", ...additions]);
    git(["diff", "--check", "HEAD", "--", ...candidate.files.map(file => file.path)]);
    const patch = git(["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--full-index", "--no-renames", "HEAD",
        "--", ...candidate.files.map(file => file.path)]);
    requireValue(patch.length > 0 && Buffer.byteLength(patch) <= BUILD_LIMITS.patchBytes,
        "The full patch cannot be scanned within the pilot's bound.");
    return patch;
}

export function scanBinding(prepared, candidate, patch, runId, attempt) {
    return { version: 1, contextHash: digest(prepared), candidateHash: digest(candidate), patchHash: digest(patch),
        runId: integer(Number(runId), "Invalid scan run."), attempt: integer(Number(attempt), "Invalid scan attempt.") };
}

export function readBuildInputs(directory) {
    return {
        prepared: readJson(path.join(directory, "context"), "context.json", MAX_CONTEXT_BYTES),
        candidate: readJson(path.join(directory, "candidate"), "implementation-candidate.json", BUILD_LIMITS.candidateBytes),
        scan: readJson(path.join(directory, "scan"), "scan.json", 4096),
    };
}

export function completionEvidence(env) {
    return {
        agent: env.TYPECHAT_AGENT_RESULT, outputs: env.TYPECHAT_AGENT_OUTPUTS,
        detection: env.TYPECHAT_DETECTION_RESULT, detectionRan: env.TYPECHAT_DETECTION_RAN,
        detectionConclusion: env.TYPECHAT_DETECTION_CONCLUSION, tests: env.TYPECHAT_CHECKS_RESULT,
        mainCredits: env.TYPECHAT_MAIN_CREDITS, detectionCredits: env.TYPECHAT_DETECTION_CREDITS,
        limitsExceeded: env.TYPECHAT_LIMITS_EXCEEDED,
    };
}

export async function stageBuildDetection(github, context, env, prepared, candidate, repository, detectionDirectory, clock = () => new Date()) {
    await verifyBuildAuthorization(github, context, env, prepared, clock);
    const tree = (await github.rest.git.getTree({ ...API_REPO, tree_sha: prepared.source.commit, recursive: "1" })).data;
    validateCandidate(candidate, prepared, tree);
    const patch = patchForDetection(candidate, prepared, repository);
    stageDetectionContent(detectionDirectory, "implementation-agreement",
        JSON.stringify({ acceptance: prepared.acceptance.body, policy: prepared.policyText, source: prepared.source.commit }));
    stageDetectionContent(detectionDirectory, "implementation-full-patch", patch);
    stageDetectionContent(detectionDirectory, "implementation-candidate", JSON.stringify(candidate));
    return scanBinding(prepared, candidate, patch, context.runId, env.GITHUB_RUN_ATTEMPT);
}

export function requiredChecks(candidate) {
    const checks = new Set(["git diff --check"]);
    for (const file of candidate.files) {
        if (file.path.endsWith(".md") && !file.path.startsWith("site/")) continue;
        if (file.path.startsWith("typescript/")) {
            checks.add("typescript: npm run build");
            checks.add("typescript: npm run build-all");
            checks.add("typescript: npm test");
        } else if (file.path.startsWith("python/")) {
            checks.add("python: hatch run test");
            checks.add("python: npm run check");
        } else if (file.path.startsWith("site/")) {
            checks.add("site: npm run build");
        }
    }
    return [...checks].sort();
}

export function validateCompletion(prepared, candidate, scan, checks, evidence) {
    keys(scan, ["version", "contextHash", "candidateHash", "patchHash", "runId", "attempt"], "Missing exact-patch scan binding.");
    requireValue(scan.version === 1 && scan.contextHash === digest(prepared) && scan.candidateHash === digest(candidate) &&
        SHA256.test(scan.patchHash) && scan.runId === prepared.request.runId && scan.attempt === prepared.request.attempt,
    "Scan provenance does not match the exact implementation.");
    requireValue(evidence.agent === "success" && evidence.outputs === "noop" && evidence.detection === "success" &&
        evidence.detectionRan === "true" && evidence.detectionConclusion === "success" && evidence.tests === "success" &&
        evidence.limitsExceeded === "false",
    "Publication requires successful native completion, full-patch detection, and deterministic checks.");
    for (const [component, maximum] of [["mainCredits", BUILD_LIMITS.mainCredits], ["detectionCredits", BUILD_LIMITS.detectionCredits]]) {
        requireValue(typeof evidence[component] === "string" && /^\d+(?:\.\d+)?$/.test(evidence[component]) &&
            Number(evidence[component]) > 0 && Number(evidence[component]) <= maximum,
        "Verified inference usage is missing, invalid, or over budget.");
    }
    keys(checks, ["version", "binding", "commands", "conclusion"], "Missing deterministic-check evidence.");
    requireValue(checks.version === 1 && same(checks.binding, scan) && checks.conclusion === "success" &&
        same(checks.commands, requiredChecks(candidate)), "The required checks did not pass on this exact patch.");
    return { mainCredits: Number(evidence.mainCredits), detectionCredits: Number(evidence.detectionCredits) };
}

export async function checkBuildPublication(github, context, env, prepared, candidate, scan, checks, evidence, clock = () => new Date()) {
    const request = authorizeBuild(context, env);
    requireValue(request.mode === "build" && same(request, prepared.request), "The publication belongs to another request.");
    const existing = await existingBuild(github, request.target, prepared.acceptance);
    if (existing) return existing;
    await verifyBuildAuthorization(github, context, env, prepared, clock);
    const tree = (await github.rest.git.getTree({ ...API_REPO, tree_sha: prepared.source.commit, recursive: "1" })).data;
    validateCandidate(candidate, prepared, tree);
    const usage = validateCompletion(prepared, candidate, scan, checks, evidence);
    const intentName = `${BUILD_WRITE_PREFIX}${scopeKey(prepared.target, prepared.acceptance)}`;
    requireValue(!await priorIntent(github, intentName), "An earlier implementation write is unresolved; do not retry blindly.");
    return { mode: "publish", intentName, usage, intent: {
        version: 1, contextHash: digest(prepared), candidateHash: digest(candidate), patchHash: scan.patchHash,
        source: prepared.source.commit, runId: request.runId, attempt: request.attempt,
        branch: buildBranch(prepared.target, prepared.acceptance),
    } };
}

function markdown(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\\`*_{}\[\]()#+\-.!|~@]/g, "\\$&");
}

export function implementationPullRequest(prepared, candidate, scan, checks, usage) {
    const key = scopeKey(prepared.target, prepared.acceptance);
    return [
        `Implements the exact [accepted scope](${prepared.acceptance.url}) for [Issue #${prepared.target.number}](${prepared.target.url}).`,
        `Owner build authorization: ${prepared.target.url}#issuecomment-${prepared.request.commentId}`,
        `## Summary\n${markdown(candidate.summary)}`,
        `## Agreed work\n${prepared.acceptance.body}`,
        `## Verified execution\n- Fixed base: \`${prepared.source.commit}\`\n- Context SHA-256: \`${digest(prepared)}\`\n` +
            `- Candidate SHA-256: \`${digest(candidate)}\`\n- Full patch SHA-256: \`${scan.patchHash}\`\n` +
            checks.commands.map(command => `- Passed: \`${command}\``).join("\n") +
            `\n- Main inference: ${usage.mainCredits} / ${BUILD_LIMITS.mainCredits} AI credits\n` +
            `- Detection: ${usage.detectionCredits} / ${BUILD_LIMITS.detectionCredits} AI credits\n` +
            `- [Execution and usage records](${REPO_URL}/actions/runs/${prepared.request.runId}/attempts/${prepared.request.attempt})`,
        `## Limitations\n${candidate.limitations.length ? candidate.limitations.map(value => `- ${markdown(value)}`).join("\n") :
            "- The agent reported no additional limitations; this is not independent proof of completeness."}\n` +
            "- Normal PR CI and Copilot review have not yet been verified. Human review, approval, and merging remain separate.\n" +
            "- No automatic merge, issue closure, release, or scope expansion is authorized.",
        `<!-- typechat-build:v1:${key}:${requestKey(prepared.request)}:${digest(prepared)}:${digest(candidate)} -->`,
    ].join("\n\n") + "\n";
}

export async function publishBuild(github, writer, app, context, env, prepared, candidate, scan, checks, evidence, intentId, clock = () => new Date()) {
    const request = authorizeBuild(context, env);
    requireValue(request.mode === "build" && same(request, prepared.request), "The publication belongs to another request.");
    const existing = await existingBuild(github, request.target, prepared.acceptance);
    if (existing) return existing;
    await verifyBuildAuthorization(github, context, env, prepared, clock);
    requireValue(app.appId === prepared.app.appId && app.installationId === prepared.app.installationId &&
        app.repositoryId === REPOSITORY.id && same(app.permissions, IMPLEMENTATION_PERMISSIONS) &&
        clock().getTime() - Date.parse(app.verifiedAt) >= 0 &&
        clock().getTime() - Date.parse(app.verifiedAt) < BUILD_LIMITS.preflightMinutes * 60000,
    "The current App installation or scoped access differs from preflight.");
    const tree = (await github.rest.git.getTree({ ...API_REPO, tree_sha: prepared.source.commit, recursive: "1" })).data;
    validateCandidate(candidate, prepared, tree);
    const usage = validateCompletion(prepared, candidate, scan, checks, evidence);
    const intentName = `${BUILD_WRITE_PREFIX}${scopeKey(prepared.target, prepared.acceptance)}`;
    const artifact = await verifyBuildArtifact(github, context, intentId, intentName, MAX_CONTEXT_BYTES, clock());
    requireValue(Date.parse(artifact.expires_at) > Date.parse(prepared.expiresAt), "The publication intent is insufficiently retained.");
    requireValue(!await priorIntent(github, intentName, artifact.id), "A prior publication intent blocks blind retries.");
    const base = (await github.rest.git.getCommit({ ...API_REPO, commit_sha: prepared.source.commit })).data;
    requireValue(base.sha === prepared.source.commit && SHA1.test(base.tree?.sha), "The fixed base commit is unavailable.");
    const changes = [];
    for (const file of candidate.files) {
        let sha = null;
        if (file.content !== null) {
            const blob = (await writer.rest.git.createBlob({ ...API_REPO, content: Buffer.from(file.content).toString("base64"), encoding: "base64" })).data;
            requireValue(blob.sha === blobHash(file.content), "The uploaded blob differs from the scanned patch.");
            sha = blob.sha;
        }
        changes.push({ path: file.path, mode: "100644", type: "blob", sha });
    }
    const createdTree = (await writer.rest.git.createTree({ ...API_REPO, base_tree: base.tree.sha, tree: changes })).data;
    requireValue(SHA1.test(createdTree.sha), "GitHub did not return the proposed tree.");
    const expected = new Map(tree.tree.filter(entry => entry.type !== "tree")
        .map(entry => [entry.path, { path: entry.path, mode: entry.mode, type: entry.type, sha: entry.sha }]));
    for (const change of changes) {
        if (change.sha === null) expected.delete(change.path);
        else expected.set(change.path, change);
    }
    const actual = (await github.rest.git.getTree({ ...API_REPO, tree_sha: createdTree.sha, recursive: "1" })).data;
    requireValue(actual.truncated === false && Array.isArray(actual.tree), "The proposed tree cannot be fully verified.");
    const entries = actual.tree.filter(entry => entry.type !== "tree")
        .map(entry => ({ path: entry.path, mode: entry.mode, type: entry.type, sha: entry.sha }))
        .sort((left, right) => left.path.localeCompare(right.path));
    requireValue(same(entries, [...expected.values()].sort((left, right) => left.path.localeCompare(right.path))),
        "The proposed tree changes files outside the exact scanned patch.");
    const commit = (await writer.rest.git.createCommit({
        ...API_REPO, message: `Implement accepted Issue #${prepared.target.number}\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`,
        tree: createdTree.sha, parents: [prepared.source.commit],
    })).data;
    requireValue(SHA1.test(commit.sha) && commit.tree?.sha === createdTree.sha &&
        Array.isArray(commit.parents) && commit.parents.length === 1 && commit.parents[0].sha === prepared.source.commit,
    "The proposed commit has unexpected patch origin.");
    await verifyBuildAuthorization(github, context, env, prepared, clock);
    requireValue(!await existingBuild(github, prepared.target, prepared.acceptance), "Another implementation appeared before publication.");
    const branch = buildBranch(prepared.target, prepared.acceptance);
    const body = implementationPullRequest(prepared, candidate, scan, checks, usage);
    requireValue(Buffer.byteLength(body) <= 60000, "The reviewed PR description is too large.");
    try {
        const ref = (await writer.rest.git.createRef({ ...API_REPO, ref: `refs/heads/${branch}`, sha: commit.sha })).data;
        requireValue(ref.ref === `refs/heads/${branch}` && ref.object?.sha === commit.sha, "The created branch does not match the verified commit.");
        await verifyBuildAuthorization(github, context, env, prepared, clock);
        const pr = (await writer.rest.pulls.create({
            ...API_REPO, title: `Implement accepted Issue #${prepared.target.number}`, head: branch,
            base: prepared.source.branch, body, draft: false, maintainer_can_modify: false,
        })).data;
        requireValue(pr.user?.id === IMPLEMENTATION_APP.botId && pr.user.type === "Bot" &&
            pr.body === body && pr.head?.ref === branch && pr.head.sha === commit.sha &&
            pr.head.repo?.id === REPOSITORY.id && pr.base?.repo?.id === REPOSITORY.id &&
            pr.base.ref === prepared.source.branch && pr.base.sha === prepared.source.commit &&
            pr.html_url === `${REPO_URL}/pull/${integer(pr.number, "Missing created PR number.")}`,
        "The created PR does not match the authorized implementation.");
        return { mode: "published", number: pr.number, url: pr.html_url, branch, commit: commit.sha,
            contextHash: digest(prepared), candidateHash: digest(candidate), patchHash: scan.patchHash, usage };
    } catch (error) {
        throw new Error("Implementation publication is partial or uncertain. Inspect the owned branch, PR, and retained intent; do not retry blindly.",
            { cause: error });
    }
}

export function collectCandidate(prepared, directory, summary, limitations = []) {
    const git = args => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", maxBuffer: MAX_CONTEXT_BYTES });
    requireValue(git(["rev-parse", "HEAD"]).trim() === prepared.source.commit, "The coding checkout does not match the frozen source.");
    const tracked = git(["diff", "--name-only", "-z", "HEAD"]).split("\0").filter(Boolean);
    const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)
        .filter(file => file !== "implementation-candidate.json" && !file.startsWith(".typechat-build/"));
    const files = [...new Set([...tracked, ...untracked])].sort().map(file => {
        const entry = git(["ls-tree", "HEAD", "--", file]).trim();
        const match = /^100644 blob ([a-f0-9]{40})\t/.exec(entry);
        requireValue(!entry || match, "Only ordinary tracked text files are supported.");
        const filename = path.join(directory, ...file.split("/"));
        const info = fs.lstatSync(filename, { throwIfNoEntry: false });
        requireValue(!info || info.isFile() && !info.isSymbolicLink() && info.size <= BUILD_LIMITS.candidateBytes, "Unsupported candidate file.");
        return { path: file, previousSha: match?.[1] ?? null, content: info ? fs.readFileSync(filename, "utf8") : null };
    });
    return { version: 1, contextHash: digest(prepared), baseSha: prepared.source.commit, summary, limitations, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    requireValue(process.argv[2] === "collect" && process.argv.length === 5,
        "Usage: node tools/issue-implementation.mjs collect <context-directory> <plain-text-summary>");
    const prepared = readJson(process.argv[3], "context.json", MAX_CONTEXT_BYTES);
    const candidate = collectCandidate(prepared, process.cwd(), process.argv[4]);
    writeJson(process.cwd(), "implementation-candidate.json", candidate);
}
