import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "typechat-package-"));
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
            for (const prefix of ["dist", "dist/esm"]) {
                for (const extension of [".js", ".d.ts"]) {
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
            esm: pathToFileURL(join(stagedPackage, "dist", "esm", `${entry}.js`)).href,
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
                assert.equal("default" in native, false);
                assert.deepEqual(Object.keys(native).sort(), Object.keys(commonjs).sort());
            }
        `);
    });

    for (const format of ["cjs", "esm"]) {
        test(`${format} core and interactive entry points load without optional peers`, () => {
            const imports = format === "esm"
                ? `import { success, getData } from "typechat";
                   import { processRequests } from "typechat/interactive";`
                : `const { success, getData } = require("typechat");
                   const { processRequests } = require("typechat/interactive");`;
            runConsumer(withoutPeers, `core.${format === "esm" ? "mjs" : "cjs"}`, `
                ${imports}
                ${format === "esm" ? 'import assert from "node:assert/strict";' : 'const assert = require("node:assert/strict");'}
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
            for (const extension of ["cts", "mts"]) {
                writeFileSync(join(withPeers, `consumer.${extension}`), source);
            }
            writeFileSync(join(withPeers, "tsconfig.json"), JSON.stringify({
                compilerOptions: {
                    target: "es2021",
                    lib: ["es2021"],
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
                for (const prefix of ["dist", "dist/esm"]) {
                    const declaration = join(stagedPackage, prefix, `${entry}.d.ts`).replaceAll("\\", "/");
                    assert.ok(
                        trace.includes(`Module name '${specifier}' was successfully resolved to '${declaration}'`),
                        `${specifier} must resolve ${declaration}`
                    );
                }
            }
        });
    }
});
