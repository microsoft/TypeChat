// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { blobHash, requiredChecks } from "../issue-implementation.mjs";
import { runIsolatedChecks } from "../implementation-sandbox.mjs";

test("real TypeScript and Python checks run without host credentials or network access", {
    skip: process.env.TYPECHAT_SANDBOX_SMOKE !== "true", timeout: 80 * 60 * 1000,
}, t => {
    const repository = fileURLToPath(new URL("../../", import.meta.url));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-sandbox-smoke-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const git = args => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", maxBuffer: 1048576 });
    const source = git(["rev-parse", "HEAD"]).trim();
    const filename = "typescript/tests/model.test.mjs";
    const previous = git(["show", `${source}:${filename}`]);
    const added = `
import { test as implementationIsolationTest } from "node:test";
import { strict as implementationIsolationAssert } from "node:assert";
import { networkInterfaces as implementationIsolationNetworks } from "node:os";
implementationIsolationTest("implementation isolation canary", () => {
    for (const name of ["GITHUB_TOKEN", "GH_TOKEN", "ACTIONS_RUNTIME_TOKEN", "TYPECHAT_APP_PRIVATE_KEY", "DEPENDABOT_APP_PRIVATE_KEY"]) {
        implementationIsolationAssert.equal(process.env[name], undefined);
    }
    implementationIsolationAssert.deepEqual(Object.keys(implementationIsolationNetworks()), ["lo"]);
});
`;
    const python = `import os
import socket

def test_implementation_isolation_canary():
    for name in ("GITHUB_TOKEN", "GH_TOKEN", "ACTIONS_RUNTIME_TOKEN", "TYPECHAT_APP_PRIVATE_KEY", "DEPENDABOT_APP_PRIVATE_KEY"):
        assert name not in os.environ
    assert [name for _, name in socket.if_nameindex()] == ["lo"]
`;
    const candidate = { baseSha: source, files: [
        { path: filename, previousSha: blobHash(previous), content: previous + added },
        { path: "python/tests/test_implementation_isolation_canary.py", previousSha: null, content: python },
    ] };
    const saved = process.env.TYPECHAT_APP_PRIVATE_KEY;
    process.env.TYPECHAT_APP_PRIVATE_KEY = "synthetic-host-only-canary-not-a-credential";
    try {
        const result = runIsolatedChecks({ source: { commit: source } }, candidate, { synthetic: true }, repository, directory);
        assert.equal(result.conclusion, "success");
        assert.deepEqual(result.commands, requiredChecks(candidate));
        const log = fs.readFileSync(path.join(directory, "checks.log"), "utf8");
        assert.ok(log.includes("implementation isolation canary"));
        assert.ok(!log.includes(process.env.TYPECHAT_APP_PRIVATE_KEY));
    } catch (error) {
        const log = path.join(directory, "checks.log");
        if (fs.existsSync(log)) {
            const stop = `typechat-${randomUUID()}`;
            console.log(`::stop-commands::${stop}`);
            console.log(fs.readFileSync(log, "utf8").slice(-18000));
            console.log(`::${stop}::`);
        }
        throw error;
    } finally {
        if (saved === undefined) delete process.env.TYPECHAT_APP_PRIVATE_KEY;
        else process.env.TYPECHAT_APP_PRIVATE_KEY = saved;
    }
});
