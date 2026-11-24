// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = parse(fs.readFileSync(new URL("../../.github/workflows/ci.js.yml", import.meta.url), "utf8"));

test("Node CI runs the full TypeScript test suite in its build matrix", () => {
    assert.equal(workflow.defaults.run["working-directory"], "typescript");
    const build = workflow.jobs.build;
    const runSteps = build.steps.filter(step => Object.hasOwn(step, "run"));
    assert.deepEqual(runSteps.map(step => step.run), ["npm ci", "npm run build-all", "npm test"]);
    assert.equal(build["continue-on-error"] ?? false, false);
    const testStep = runSteps.at(-1);
    assert.equal(testStep.if, undefined);
    assert.equal(testStep["working-directory"], undefined);
    assert.equal(testStep["continue-on-error"] ?? false, false);
});
