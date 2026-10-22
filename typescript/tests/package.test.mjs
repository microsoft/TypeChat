import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const directoryLinkType = process.platform === "win32" ? "junction" : "dir";

function runNpm(args, cwd, cache) {
    try {
        return execFileSync(npmCommand, args, {
            cwd,
            env: {
                ...process.env,
                NPM_CONFIG_CACHE: cache,
                NPM_CONFIG_UPDATE_NOTIFIER: "false",
            },
            encoding: "utf8",
            shell: process.platform === "win32",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 300_000,
        });
    } catch (error) {
        const stdout = error.stdout?.toString() ?? "";
        const stderr = error.stderr?.toString() ?? "";
        throw new Error(`npm ${args.join(" ")} failed\n${stdout}\n${stderr}`, { cause: error });
    }
}

test("published package works for a clean TypeScript 7 consumer", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "typechat-package-"));
    const cache = path.join(tempRoot, "npm-cache");
    const buildPackage = path.join(tempRoot, "package");

    try {
        cpSync(packageRoot, buildPackage, {
            recursive: true,
            filter: source => {
                const relativePath = path.relative(packageRoot, source);
                return !relativePath
                    .split(path.sep)
                    .some(segment => ["node_modules", "dist", "out", ".git"].includes(segment));
            },
        });
        symlinkSync(path.join(packageRoot, "node_modules"), path.join(buildPackage, "node_modules"), directoryLinkType);

        runNpm(["run", "build-all"], buildPackage, cache);
        assert.ok(existsSync(path.join(buildPackage, "dist", "ts", "validate.js")));

        const packDirectory = path.join(tempRoot, "pack");
        mkdirSync(packDirectory);
        const manifestPath = path.join(buildPackage, "package.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        assert.equal(manifest.scripts.prepare, "npm run build-all");
        delete manifest.scripts.prepare;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        runNpm(["pack", "--ignore-scripts", "--pack-destination", packDirectory], buildPackage, cache);
        const tarballs = readdirSync(packDirectory).filter(file => file.endsWith(".tgz"));
        assert.equal(tarballs.length, 1);

        const consumer = path.join(tempRoot, "consumer");
        mkdirSync(consumer);
        writeFileSync(
            path.join(consumer, "package.json"),
            JSON.stringify({ name: "typechat-package-consumer", private: true, type: "module" })
        );
        runNpm(
            [
                "install",
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
                path.join(packDirectory, tarballs[0]),
                "typescript@7.0.2",
            ],
            consumer,
            path.join(tempRoot, "consumer-cache")
        );

        const verification = path.join(consumer, "verify.mjs");
        writeFileSync(
            verification,
            `import assert from "node:assert/strict";
import { createTypeScriptJsonValidator } from "typechat/ts";

const validator = createTypeScriptJsonValidator(
    "export interface Payload { value: string; }",
    "Payload"
);
try {
    assert.deepEqual(validator.validate({ value: "ok" }), {
        success: true,
        data: { value: "ok" },
    });
    assert.equal(validator.validate({ value: 42 }).success, false);
} finally {
    validator.close?.();
}
`
        );
        execFileSync(process.execPath, [verification], {
            cwd: consumer,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 120_000,
        });
    } finally {
        rmSync(tempRoot, { recursive: true, force: true });
    }
});
