// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { createPrivateKey, sign } from "node:crypto";
import { REPOSITORY } from "./discussion-draft.mjs";

export const IMPLEMENTATION_APP = Object.freeze({
    id: 3299775, slug: "typeagent-bot", botId: 274150370, botLogin: "typeagent-bot[bot]",
});
export const IMPLEMENTATION_PERMISSIONS = Object.freeze({ contents: "write", pull_requests: "write" });

function requireValue(condition, message) {
    if (!condition) throw new Error(message);
}

export function validateAppGrant(grant, repositories, now) {
    requireValue(grant && typeof grant.token === "string" && grant.token.length > 20,
        "The App did not return an installation token.");
    const expires = Date.parse(grant.expires_at);
    requireValue(Number.isFinite(expires) && expires > now.getTime() && expires <= now.getTime() + 65 * 60 * 1000,
        "The App token is expired or is not short-lived.");
    const permissions = grant.permissions;
    requireValue(permissions && permissions.contents === "write" && permissions.pull_requests === "write" &&
        Object.entries(permissions).every(([key, value]) =>
            Object.hasOwn(IMPLEMENTATION_PERMISSIONS, key) && IMPLEMENTATION_PERMISSIONS[key] === value ||
            key === "metadata" && value === "read"),
    "The installation token has missing or excessive permissions.");
    requireValue(repositories?.total_count === 1 && Array.isArray(repositories.repositories) &&
        repositories.repositories.length === 1 && repositories.repositories[0].id === REPOSITORY.id &&
        repositories.repositories[0].full_name === `${REPOSITORY.owner}/${REPOSITORY.repo}`,
    "The installation token must be restricted to TypeChat alone.");
}

export async function withImplementationApp(getOctokit, core, credentials, operation, clock = () => new Date()) {
    requireValue(String(credentials.appId) === String(IMPLEMENTATION_APP.id),
        "DEPENDABOT_APP_ID does not identify the approved typeagent-bot App.");
    requireValue(typeof credentials.privateKey === "string" && credentials.privateKey.length > 100,
        "The existing App private-key binding is unavailable.");
    core.setSecret(credentials.privateKey);
    const now = clock();
    const seconds = Math.floor(now.getTime() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
        iat: seconds - 60, exp: seconds + 300, iss: IMPLEMENTATION_APP.id,
    })}`;
    const key = createPrivateKey(credentials.privateKey);
    requireValue(key.asymmetricKeyType === "rsa", "The App key is not an RSA private key.");
    const jwt = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url")}`;
    core.setSecret(jwt);
    const app = getOctokit(jwt, { baseUrl: "https://api.github.com", request: { retries: 0 } });
    const identity = (await app.rest.apps.getAuthenticated()).data;
    requireValue(identity.id === IMPLEMENTATION_APP.id && identity.slug === IMPLEMENTATION_APP.slug,
        "The credentials belong to a different GitHub App.");
    const installation = (await app.rest.apps.getRepoInstallation({
        owner: REPOSITORY.owner, repo: REPOSITORY.repo,
    })).data;
    requireValue(Number.isSafeInteger(installation.id) && installation.id > 0 &&
        installation.app_id === IMPLEMENTATION_APP.id && installation.account?.login === REPOSITORY.owner &&
        installation.target_type === "Organization" && installation.suspended_at === null,
    "The approved App is not actively installed for this repository owner.");
    const grant = (await app.rest.apps.createInstallationAccessToken({
        installation_id: installation.id,
        repository_ids: [REPOSITORY.id],
        permissions: { ...IMPLEMENTATION_PERMISSIONS },
    })).data;
    requireValue(typeof grant?.token === "string" && grant.token.length > 20, "The App token is unavailable.");
    core.setSecret(grant.token);
    const writer = getOctokit(grant.token, { baseUrl: "https://api.github.com", request: { retries: 0 } });
    try {
        const repositories = (await writer.rest.apps.listReposAccessibleToInstallation({ per_page: 2, page: 1 })).data;
        validateAppGrant(grant, repositories, now);
        const proof = {
            appId: IMPLEMENTATION_APP.id, installationId: installation.id, repositoryId: REPOSITORY.id,
            permissions: { ...IMPLEMENTATION_PERMISSIONS }, verifiedAt: now.toISOString(),
        };
        return await operation(writer, proof);
    } finally {
        await writer.rest.apps.revokeInstallationAccessToken();
    }
}
