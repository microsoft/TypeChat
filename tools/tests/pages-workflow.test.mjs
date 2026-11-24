// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = parse(fs.readFileSync(new URL("../../.github/workflows/github-pages.yml", import.meta.url), "utf8"));

test("Pages deployments share a queue without cancelling an active publish", () => {
    assert.deepEqual(workflow.concurrency, { group: "pages", "cancel-in-progress": false });
    assert.equal(workflow.jobs.deploy.concurrency, undefined);
});

test("Pages reruns select only their own artifact while retaining earlier attempts", () => {
    const uploads = workflow.jobs.deploy.steps.filter(step => step.uses?.startsWith("actions/upload-pages-artifact@"));
    const deployments = workflow.jobs.deploy.steps.filter(step => step.uses?.startsWith("actions/deploy-pages@"));
    assert.equal(uploads.length, 1);
    assert.equal(deployments.length, 1);
    const upload = uploads[0];
    const deploy = deployments[0];
    assert.equal(upload.with.name, "github-pages-${{ github.run_attempt }}");
    assert.equal(deploy.with.artifact_name, upload.with.name);
    assert.equal(upload.with.path, "site/_site");

    const artifactName = (template, attempt) => template.replace("${{ github.run_attempt }}", String(attempt));
    const artifacts = [1, 2, 3].map(attempt => ({
        id: attempt, name: artifactName(upload.with.name, attempt),
    }));
    assert.equal(new Set(artifacts.map(artifact => artifact.name)).size, 3);
    for (const attempt of [1, 2, 3]) {
        const selected = artifacts.filter(artifact => artifact.name === artifactName(deploy.with.artifact_name, attempt));
        assert.deepEqual(selected.map(artifact => artifact.id), [attempt]);
    }
});

test("Pages deployment keeps its main-only trigger and existing permissions", () => {
    assert.deepEqual(workflow.on, { push: { branches: ["main"] } });
    assert.deepEqual(workflow.permissions, { contents: "read", "id-token": "write", pages: "write" });
    assert.equal(workflow.jobs.deploy.permissions, undefined);
    for (const step of workflow.jobs.deploy.steps.filter(step => step.uses)) {
        assert.match(step.uses, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
    }
});
