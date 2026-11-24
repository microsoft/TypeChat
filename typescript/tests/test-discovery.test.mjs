import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function writeFixtureFile(root, relativePath, contents) {
    const file = path.join(root, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
}

function runTestCommand(root) {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    const command = manifest.scripts.test.split(/\s*&&\s*/).at(-1);
    assert.match(command, /^node --test(?:\s|$)/);
    const args = [...command.matchAll(/"([^"]*)"|(\S+)/g)].slice(1)
        .map(match => match[1] ?? match[2]);
    const env = { ...process.env };
    // The nested runner needs its own reporting context.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, args, {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 30_000,
    });
    assert.ifError(result.error);
    return result;
}

test("test command discovers new flat and nested compiled and runtime suites", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "typechat-test-discovery-"));
    const suites = [
        "out/unlisted.test.js",
        "out/nested/unlisted.test.js",
        "tests/unlisted.test.mjs",
        "tests/nested/unlisted.test.mjs",
    ];
    try {
        writeFixtureFile(root, "package.json", JSON.stringify({ private: true, type: "commonjs" }));
        for (const [index, suite] of suites.entries()) {
            const marker = path.join(root, `executed-${index}`);
            const imports = suite.endsWith(".mjs")
                ? 'import test from "node:test"; import { writeFileSync } from "node:fs";'
                : 'const test = require("node:test"); const { writeFileSync } = require("node:fs");';
            writeFixtureFile(root, suite, `${imports}
test(${JSON.stringify(suite)}, () => {
    writeFileSync(${JSON.stringify(marker)}, "executed");
});
`);
        }
        for (const helper of ["out/helper.js", "tests/helper.mjs", "test/uncompiled.test.ts"]) {
            writeFixtureFile(root, helper, 'throw new Error("Non-suite files must not run");');
        }

        const result = runTestCommand(root);
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        for (const index of suites.keys()) {
            assert.equal(readFileSync(path.join(root, `executed-${index}`), "utf8"), "executed");
        }
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("test command propagates a newly discovered suite failure", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "typechat-test-discovery-"));
    try {
        writeFixtureFile(root, "package.json", JSON.stringify({ private: true, type: "commonjs" }));
        writeFixtureFile(root, "out/nested/unlisted.test.js", `
require("node:test")("newly discovered suite failure", () => {
    throw new Error("new suite regression");
});
`);
        writeFixtureFile(root, "tests/unlisted.test.mjs", `
import test from "node:test";
test("new runtime suite", () => {});
`);

        const result = runTestCommand(root);
        assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout, /newly discovered suite failure/);
        assert.match(result.stdout, /new suite regression/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
