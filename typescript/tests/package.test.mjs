import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os, { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const directory = realpathSync(mkdtempSync(join(tmpdir(), "typechat-package-")));
const withPeers = join(directory, "with-peers");
const withoutPeers = join(directory, "without-peers");
const stagedPackage = join(withPeers, "node_modules", "typechat");
const entryPoints = [
    ["typechat", "index"],
    ["typechat/ts", "ts/index"],
    ["typechat/zod", "zod/index"],
    ["typechat/interactive", "interactive/index"],
];
const childEnv = { ...process.env, NODE_OPTIONS: "", VSCODE_INSPECTOR_OPTIONS: "", NODE_PATH: "" };
let packedFiles;

before(() => {
    const options = { cwd: packageRoot, encoding: "utf8", env: childEnv, timeout: 30000 };
    const packed = process.platform === "win32"
        ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm pack --ignore-scripts --dry-run --json"], options)
        : spawnSync("npm", ["pack", "--ignore-scripts", "--dry-run", "--json"], options);
    assert.ifError(packed.error);
    assert.equal(packed.status, 0, `${packed.stdout}${packed.stderr}`);
    packedFiles = JSON.parse(packed.stdout)[0].files.map(file => file.path);

    for (const consumer of [withPeers, withoutPeers]) {
        for (const file of packedFiles) {
            const destination = join(consumer, "node_modules", "typechat", file);
            mkdirSync(dirname(destination), { recursive: true });
            copyFileSync(join(packageRoot, file), destination);
        }
    }
    for (const peer of ["typescript", "zod"]) {
        symlinkSync(
            dirname(require.resolve(`${peer}/package.json`)),
            join(withPeers, "node_modules", peer),
            process.platform === "win32" ? "junction" : "dir"
        );
    }
    writeFileSync(join(withPeers, "requests.txt"), "first\n\nsecond\r\n");
});

after(() => {
    rmSync(directory, { recursive: true, force: true });
});

function runConsumer(consumer, fileName, source) {
    const file = join(consumer, fileName);
    writeFileSync(file, source);
    const result = spawnSync(process.execPath, [file], {
        cwd: consumer,
        encoding: "utf8",
        env: childEnv,
        timeout: 30000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
}

describe("published package", () => {
    test("includes both builds and their declarations for every entry point", () => {
        for (const [, entry] of entryPoints) {
            for (const [prefix, extensions] of [
                ["dist", [".js", ".d.ts"]],
                ["dist/esm", [".mjs", ".d.mts"]],
            ]) {
                for (const extension of extensions) {
                    assert.ok(packedFiles.includes(`${prefix}/${entry}${extension}`));
                }
            }
        }
        assert.ok(packedFiles.includes("dist/esm/package.json"));
        assert.equal(JSON.parse(readFileSync(join(stagedPackage, "dist", "esm", "package.json"), "utf8")).type, "module");
        assert.ok(!packedFiles.some(file => file.startsWith("src/") || file.startsWith("tests/")));
    });

    test("selects native ESM and CommonJS builds with identical named exports", () => {
        const expected = entryPoints.map(([specifier, entry]) => ({
            specifier,
            cjs: join(stagedPackage, "dist", `${entry}.js`),
            esm: pathToFileURL(join(stagedPackage, "dist", "esm", `${entry}.mjs`)).href,
        }));
        runConsumer(withPeers, "exports.mjs", `
            import assert from "node:assert/strict";
            import { createRequire } from "node:module";
            const require = createRequire(import.meta.url);
            for (const { specifier, cjs, esm } of ${JSON.stringify(expected)}) {
                assert.equal(require.resolve(specifier), cjs);
                assert.equal(import.meta.resolve(specifier), esm);
                const commonjs = require(specifier);
                const native = await import(specifier);
                const { default: defaultExport, ...namedExports } = native;
                assert.equal("default" in commonjs, false);
                assert.deepEqual(Object.keys(namedExports).sort(), Object.keys(commonjs).sort());
                assert.deepEqual(Object.keys(defaultExport).sort(), Object.keys(commonjs).sort());
                for (const name of Object.keys(commonjs)) {
                    assert.equal(defaultExport[name], native[name]);
                }
            }
        `);
    });

    test("resolves package entry points through a symlinked temporary directory", () => {
        const target = join(directory, "tmp");
        const link = join(directory, "tmp-link");
        mkdirSync(target);
        symlinkSync(target, link, directoryLinkType);
        const env = { ...childEnv, TMPDIR: link, TEMP: link, TMP: link };
        // The nested runner needs its own reporting context.
        delete env.NODE_TEST_CONTEXT;
        const result = spawnSync(process.execPath, [
            "--test",
            "--test-reporter=tap",
            "--test-name-pattern=selects native ESM and CommonJS builds with identical named exports",
            fileURLToPath(import.meta.url),
        ], {
            cwd: packageRoot,
            encoding: "utf8",
            env,
            timeout: 30000,
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
        assert.match(result.stdout, /^# pass 1$/m);
    });

    test("preserves native ESM default imports for every entry point", () => {
        runConsumer(withPeers, "default-imports.mjs", `
            import assert from "node:assert/strict";
            import core, { success } from "typechat";
            import ts, { createTypeScriptJsonValidator } from "typechat/ts";
            import adapter, { createZodJsonValidator } from "typechat/zod";
            import interactive, { processRequests } from "typechat/interactive";
            assert.equal(core.success, success);
            assert.equal(ts.createTypeScriptJsonValidator, createTypeScriptJsonValidator);
            assert.equal(adapter.createZodJsonValidator, createZodJsonValidator);
            assert.equal(interactive.processRequests, processRequests);
            assert.deepEqual(core.success("ok"), { success: true, data: "ok" });
        `);
    });

    for (const format of ["cjs", "esm"]) {
        test(`${format} core and interactive entry points load without optional peers`, () => {
            const imports = format === "esm"
                ? `import core, { success, getData } from "typechat";
                   import interactive, { processRequests } from "typechat/interactive";`
                : `const core = require("typechat");
                   const interactive = require("typechat/interactive");
                   const { success, getData } = core;
                   const { processRequests } = interactive;`;
            runConsumer(withoutPeers, `core.${format === "esm" ? "mjs" : "cjs"}`, `
                ${imports}
                ${format === "esm" ? 'import assert from "node:assert/strict";' : 'const assert = require("node:assert/strict");'}
                assert.equal(core.success, success);
                assert.equal(interactive.processRequests, processRequests);
                assert.deepEqual(success("ok"), { success: true, data: "ok" });
                assert.equal(getData(success("ok")), "ok");
                assert.equal(typeof processRequests, "function");
            `);
        });

        test(`${format} supports translation, both validators, programs, and interactive input`, () => {
            const imports = format === "esm"
                ? `import assert from "node:assert/strict";
                   import * as core from "typechat";
                   import * as ts from "typechat/ts";
                   import * as adapter from "typechat/zod";
                   import * as interactive from "typechat/interactive";
                   import { z } from "zod";`
                : `const assert = require("node:assert/strict");
                   const core = require("typechat");
                   const ts = require("typechat/ts");
                   const adapter = require("typechat/zod");
                   const interactive = require("typechat/interactive");
                   const { z } = require("zod");`;
            runConsumer(withPeers, `behavior.${format === "esm" ? "mjs" : "cjs"}`, `
                ${imports}
                (async () => {
                    const value = { value: "ok" };
                    const validator = ts.createTypeScriptJsonValidator(
                        "export interface Value { value: string; }", "Value"
                    );
                    try {
                        assert.deepEqual(validator.validate(value), core.success(value));
                        assert.equal(validator.validate({ value: 1 }).success, false);
                        const model = { complete: async () => core.success(JSON.stringify(value)) };
                        const translator = core.createJsonTranslator(model, validator);
                        assert.deepEqual(await translator.translate("test"), core.success(value));
                    } finally {
                        validator.close();
                    }
                    const schema = { Value: z.object({ value: z.string() }) };
                    const zodValidator = adapter.createZodJsonValidator(schema, "Value");
                    assert.deepEqual(zodValidator.validate(value), core.success(value));
                    assert.equal(zodValidator.validate({ value: 1 }).success, false);
                    assert.match(adapter.getZodSchemaAsTypeScript(schema), /interface Value/);
                    const calls = [];
                    await ts.evaluateJsonProgram(
                        { "@steps": [{ "@func": "echo", "@args": ["ok"] }] },
                        async (name, args) => { calls.push({ name, args }); return args[0]; }
                    );
                    assert.deepEqual(calls, [{ name: "echo", args: ["ok"] }]);
                    const requests = [];
                    await interactive.processRequests("> ", "requests.txt", async request => { requests.push(request); });
                    assert.deepEqual(requests, ["first", "second"]);
                })().catch(error => { console.error(error); process.exitCode = 1; });
            `);
        });

        test(`${format} translators preflight validators from the other module format`, () => {
            runConsumer(withPeers, `mixed-${format}.mjs`, `
                import assert from "node:assert/strict";
                import { createRequire } from "node:module";
                const require = createRequire(import.meta.url);
                const core = ${format === "esm" ? 'await import("typechat")' : 'require("typechat")'};
                const { createTypeScriptJsonValidator } = ${format === "esm" ? 'require("typechat/ts")' : 'await import("typechat/ts")'};
                let modelCalls = 0;
                const model = {
                    complete: async () => {
                        modelCalls++;
                        return core.success(JSON.stringify({ value: modelCalls === 1 ? 1 : "ok" }));
                    }
                };
                const invalidValidator = createTypeScriptJsonValidator(
                    "export interface Value { value: MissingType; }", "Value"
                );
                try {
                    const translator = core.createJsonTranslator(model, invalidValidator);
                    const result = await translator.translate("test");
                    assert.equal(result.success, false);
                    assert.equal(modelCalls, 0);
                    assert.match(result.message, /^Schema validation failed before model request:/);
                    assert.match(result.message, /Cannot find name 'MissingType'/);
                } finally {
                    invalidValidator.close();
                }
                const validValidator = createTypeScriptJsonValidator(
                    "export interface Value { value: string; }", "Value"
                );
                try {
                    const translator = core.createJsonTranslator(model, validValidator);
                    assert.deepEqual(await translator.translate("test"), core.success({ value: "ok" }));
                    assert.equal(modelCalls, 2);
                } finally {
                    validValidator.close();
                }
            `);
        });
    }

    for (const module of ["node16", "nodenext"]) {
        test(`resolves format-specific declarations using ${module}`, () => {
            const source = `
                import {
                    createJsonTranslator, success, type Result, type Success,
                    type TypeChatLanguageModel, type TypeChatJsonTranslator
                } from "typechat";
                import {
                    createTypeScriptJsonValidator, evaluateJsonProgram,
                    type TypeScriptJsonValidator, type Program
                } from "typechat/ts";
                import { createZodJsonValidator } from "typechat/zod";
                import { processRequests } from "typechat/interactive";
                import { z } from "zod";
                interface Value { value: string; }
                const model: TypeChatLanguageModel = { complete: async () => success('{"value":"ok"}') };
                const validator: TypeScriptJsonValidator<Value> = createTypeScriptJsonValidator<Value>(
                    "export interface Value { value: string; }", "Value"
                );
                const translator: TypeChatJsonTranslator<Value> = createJsonTranslator(model, validator);
                const result: Result<Value> = createZodJsonValidator(
                    { Value: z.object({ value: z.string() }) }, "Value"
                ).validate({ value: "ok" });
                const program: Program = { "@steps": [] };
                evaluateJsonProgram(program, async () => "ok");
                processRequests("> ", undefined, async request => { const text: string = request; });
                // @ts-expect-error The result must preserve its data type.
                const invalid: Success<number> = success("ok");
                // @ts-expect-error Request callbacks must return a promise.
                processRequests("> ", undefined, () => 1);
            `;
            const defaultImportSource = `
                import core from "typechat";
                import ts from "typechat/ts";
                import adapter from "typechat/zod";
                import interactive from "typechat/interactive";
                const defaultValidator: ts.TypeScriptJsonValidator<Value> = ts.createTypeScriptJsonValidator<Value>(
                    validator.getSchemaText(), validator.getTypeName()
                );
                const defaultTranslator: core.TypeChatJsonTranslator<Value> = core.createJsonTranslator(model, defaultValidator);
                const defaultResult: core.Result<Value> = adapter.createZodJsonValidator(
                    { Value: z.object({ value: z.string() }) }, "Value"
                ).validate({ value: "ok" });
                const defaultProgram: ts.Program = program;
                ts.evaluateJsonProgram(defaultProgram, async () => "ok");
                interactive.processRequests("> ", undefined, async request => { const text: string = request; });
                // @ts-expect-error Default imports must preserve their result types.
                const invalidDefault: core.Success<number> = core.success("ok");
                // @ts-expect-error Default imports must preserve callback types.
                interactive.processRequests("> ", undefined, () => 1);
            `;
            for (const extension of ["cts", "mts"]) {
                writeFileSync(
                    join(withPeers, `consumer.${extension}`),
                    extension === "mts" ? source + defaultImportSource : source
                );
            }
            writeFileSync(join(withPeers, "tsconfig.json"), JSON.stringify({
                compilerOptions: {
                    target: "es2021",
                    lib: ["es2021", "dom"],
                    module,
                    moduleResolution: module,
                    strict: true,
                    noEmit: true,
                    types: [],
                },
                files: ["consumer.cts", "consumer.mts"],
            }));
            const compiler = join(dirname(require.resolve("typescript/package.json")), "bin", "tsc");
            const result = spawnSync(process.execPath, [compiler, "-p", withPeers, "--traceResolution", "--pretty", "false"], {
                encoding: "utf8",
                env: childEnv,
                timeout: 30000,
            });
            assert.ifError(result.error);
            const diagnostics = result.stdout.split(/\r?\n/).filter(line => line.includes("error TS")).join("\n");
            assert.equal(result.status, 0, `${diagnostics}\n${result.stderr}`);
            const trace = result.stdout.replaceAll("\\", "/");
            for (const [specifier, entry] of entryPoints) {
                for (const [prefix, extension] of [["dist", ".d.ts"], ["dist/esm", ".d.mts"]]) {
                    const declaration = join(stagedPackage, prefix, `${entry}${extension}`).replaceAll("\\", "/");
                    assert.ok(
                        trace.includes(`Module name '${specifier}' was successfully resolved to '${declaration}'`),
                        `${specifier} must resolve ${declaration}`
                    );
                }
            }
        });
    }
});

const npmCli = process.env.npm_execpath ?? path.resolve(
    path.dirname(process.execPath),
    process.platform === "win32" ? "node_modules/npm/bin/npm-cli.js" : "../lib/node_modules/npm/bin/npm-cli.js"
);
const directoryLinkType = process.platform === "win32" ? "junction" : "dir";

function runNpm(args, cwd, cache) {
    try {
        return execFileSync(process.execPath, [npmCli, ...args], {
            cwd,
            env: {
                ...process.env,
                NPM_CONFIG_CACHE: cache,
                NPM_CONFIG_UPDATE_NOTIFIER: "false",
            },
            encoding: "utf8",
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
        const consumerModules = path.join(consumer, "node_modules");
        const consumerPackage = path.join(consumerModules, "typechat");
        mkdirSync(consumerPackage, { recursive: true });
        execFileSync("tar", ["-xzf", path.join(packDirectory, tarballs[0]), "-C", consumerPackage, "--strip-components=1"], {
            stdio: "ignore",
            timeout: 120_000,
        });
        assert.equal(
            readFileSync(path.join(consumerPackage, "metadata.md"), "utf8"),
            readFileSync(path.join(packageRoot, "metadata.md"), "utf8")
        );
        const readme = readFileSync(path.join(consumerPackage, "README.md"), "utf8");
        assert.equal(
            readme.match(/\[response metadata guide\]\(([^)]+)\)/)?.[1],
            "https://github.com/microsoft/TypeChat/blob/main/typescript/metadata.md",
            "Packaged README must link to the response metadata guide"
        );
        symlinkSync(path.join(buildPackage, "node_modules", "typescript"), path.join(consumerModules, "typescript"), directoryLinkType);
        const installedTypeScript = JSON.parse(readFileSync(path.join(consumerModules, "typescript", "package.json"), "utf8"));
        assert.match(installedTypeScript.version, /^7\./);

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
