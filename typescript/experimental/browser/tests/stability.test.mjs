import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WasmTransport } from "typescript/wasm";
import { createTypeScriptJsonValidator } from "../../../dist/ts/index.js";
import * as core from "@typechat/experimental-browser";

const artifact = await readFile(new URL("../node_modules/@typescript/typescript-wasip1-wasm/lib/tsc.wasm", import.meta.url));
const numericSchema = "export interface Probe { value: number; }";
const stringSchema = "export interface Probe { value: string; }";
const wasmUrl = "https://example.test/tsc.wasm";

test("stability: repeated loads and interleaved validators preserve results and close deterministically", async t => {
    let fetches = 0;
    t.mock.method(globalThis, "fetch", async () => { fetches++; return new Response(artifact); });
    const native = createTypeScriptJsonValidator(numericSchema, "Probe");
    try {
        for (let cycle = 0; cycle < 3; cycle++) {
            const compiler = await core.loadBrowserTypeScriptCompiler(wasmUrl);
            const [numbers, strings] = await Promise.all([
                compiler.createValidator(numericSchema, "Probe"),
                compiler.createValidator(stringSchema, "Probe")
            ]);
            try {
                for (const value of [{ value: "bad" }, { value: cycle }, {}, { value: cycle + 1 }]) {
                    const actual = numbers.validate(value);
                    assert.equal(actual.success, native.validate(value).success);
                    assert.equal(actual.data, value);
                    if (!actual.success) assert.ok(actual.message.length > 0);
                    assert.equal(strings.validate({ value: "independent" }).success, true);
                }
                assert.equal(numbers[core.typeChatSchemaValidation]().success, true);
                numbers.close();
                numbers.close();
                assert.equal(numbers.getWasmMemoryByteLength(), 0);
                assert.throws(() => numbers[core.typeChatSchemaValidation](), /closed/);
                assert.throws(() => numbers.validate({ value: 1 }), /closed/);
                assert.equal(strings.validate({ value: "after peer close" }).success, true);
            } finally {
                numbers.close();
                strings.close();
            }
            assert.equal(strings.getWasmMemoryByteLength(), 0);
        }
        assert.equal(fetches, 3);
    } finally {
        native.close();
    }
});

test("stability: initialization and write exceptions close or recover without poisoning siblings", async t => {
    t.mock.method(globalThis, "fetch", async () => new Response(artifact));
    const compiler = await core.loadBrowserTypeScriptCompiler(wasmUrl);
    const originalWrite = WasmTransport.prototype.setFile;
    const originalClose = WasmTransport.prototype.close;
    const initializationError = new Error("injected schema write failure");
    const validationError = new Error("injected candidate write failure");
    let failValidation = false;
    let closes = 0;
    t.mock.method(WasmTransport.prototype, "close", function () {
        closes++;
        return originalClose.call(this);
    });
    t.mock.method(WasmTransport.prototype, "setFile", function (name, value) {
        if (name === "/schema.ts" && value.includes("FailInitialization")) throw initializationError;
        if (name === "/json.ts" && failValidation) {
            failValidation = false;
            throw validationError;
        }
        return originalWrite.call(this, name, value);
    });
    const survivor = await compiler.createValidator(stringSchema, "Probe");
    let recovered;
    try {
        await assert.rejects(
            compiler.createValidator("export interface FailInitialization {}", "FailInitialization"),
            error => error === initializationError
        );
        assert.equal(closes, 1, "The partially initialized reactor must be closed.");
        assert.equal(survivor.validate({ value: "alive" }).success, true);
        recovered = await compiler.createValidator(numericSchema, "Probe");
        failValidation = true;
        assert.throws(() => recovered.validate({ value: 1 }), error => error === validationError);
        const rejected = { value: "still rejected" };
        assert.equal(recovered.validate(rejected).data, rejected);
        assert.equal(recovered.validate(rejected).success, false);
        assert.equal(recovered.validate({ value: 2 }).success, true);
        assert.equal(survivor.validate({ value: "still alive" }).success, true);
    } finally {
        recovered?.close();
        survivor.close();
    }
    assert.equal(closes, 3);
    assert.equal(recovered.getWasmMemoryByteLength(), 0);
    assert.equal(survivor.getWasmMemoryByteLength(), 0);
});

test("stability: invalid schema Results and concurrent translation metadata survive recovery", async t => {
    t.mock.method(globalThis, "fetch", async () => new Response(artifact));
    const compiler = await core.loadBrowserTypeScriptCompiler(wasmUrl);
    const invalid = await compiler.createValidator("export interface Probe { value: MissingType; }", "Probe");
    const valid = await compiler.createValidator(numericSchema, "Probe");
    try {
        assert.equal(invalid[core.typeChatSchemaValidation]().success, false);
        let calls = 0;
        const invalidTranslator = core.createJsonTranslator({
            async complete() { calls++; throw new Error("Invalid schema reached the model."); }
        }, invalid);
        const invalidResult = await invalidTranslator.translate("offline");
        assert.equal(invalidResult.success, false);
        assert.match(invalidResult.message, /Schema validation failed.*|MissingType/s);
        assert.equal(calls, 0);
        const responses = ['{"value":"first"}', '{"value":"second"}'];
        const results = await Promise.all(responses.map(async response => {
            const translator = core.createJsonTranslator({ async complete() { return core.success(response); } }, valid);
            translator.attemptRepair = false;
            return translator.translate("offline");
        }));
        results.forEach((result, index) => {
            assert.equal(result.success, false);
            assert.deepEqual(result.data, JSON.parse(responses[index]));
            assert.equal(result.responseText, responses[index]);
            assert.ok(result.message.length > 0);
        });
        assert.equal(valid[core.typeChatSchemaValidation]().success, true);
        assert.equal(valid.validate({ value: 1 }).success, true);
    } finally {
        invalid.close();
        valid.close();
    }
});

test("stability: cancellation at digest and compile boundaries rejects exactly and permits retry", async t => {
    t.mock.method(globalThis, "fetch", async () => new Response(artifact));
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const compile = WebAssembly.compile;
    let compilations = 0;
    const compileMock = t.mock.method(WebAssembly, "compile", async bytes => {
        compilations++;
        return compile(bytes);
    });
    const beforeCompile = new AbortController();
    const firstReason = new Error("cancelled after digest");
    const digestMock = t.mock.method(crypto.subtle, "digest", async (...args) => {
        const result = await digest(...args);
        beforeCompile.abort(firstReason);
        return result;
    });
    await assert.rejects(core.loadBrowserTypeScriptCompiler(wasmUrl, { signal: beforeCompile.signal }),
        error => error === firstReason);
    assert.equal(compilations, 0);
    digestMock.mock.restore();
    const duringCompile = new AbortController();
    const secondReason = new Error("cancelled during compile");
    compileMock.mock.mockImplementation(async bytes => {
        const module = await compile(bytes);
        duringCompile.abort(secondReason);
        return module;
    });
    await assert.rejects(core.loadBrowserTypeScriptCompiler(wasmUrl, { signal: duringCompile.signal }),
        error => error === secondReason);
    compileMock.mock.restore();
    const compiler = await core.loadBrowserTypeScriptCompiler(wasmUrl);
    const validator = await compiler.createValidator(numericSchema, "Probe");
    try {
        assert.equal(validator.validate({ value: 1 }).success, true);
    } finally {
        validator.close();
    }
});

test("stability: failed streams and corrupt artifacts do not invalidate existing handles", async t => {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(artifact));
    const compiler = await core.loadBrowserTypeScriptCompiler(wasmUrl);
    const validator = await compiler.createValidator(numericSchema, "Probe");
    try {
        const streamError = new Error("injected download failure");
        let reads = 0;
        const body = new ReadableStream({
            pull(controller) {
                if (reads++ === 0) controller.enqueue(artifact.subarray(0, 100));
                else controller.error(streamError);
            }
        });
        fetch.mock.mockImplementation(async () => new Response(body));
        await assert.rejects(core.loadBrowserTypeScriptCompiler(wasmUrl), error => error === streamError);
        assert.equal(body.locked, false);
        const corrupt = new Uint8Array(artifact);
        corrupt[corrupt.length - 1] ^= 1;
        fetch.mock.mockImplementation(async () => new Response(corrupt));
        await assert.rejects(core.loadBrowserTypeScriptCompiler(wasmUrl), /SHA-256 mismatch/);
        assert.equal(validator.validate({ value: 7 }).success, true);
        fetch.mock.mockImplementation(async () => new Response(artifact));
        const retry = await core.loadBrowserTypeScriptCompiler(wasmUrl);
        const fresh = await retry.createValidator(stringSchema, "Probe");
        try {
            assert.equal(fresh.validate({ value: "recovered" }).success, true);
            assert.equal(validator.validate({ value: "wrong" }).success, false);
        } finally {
            fresh.close();
        }
    } finally {
        validator.close();
    }
});

test("stability: a retained closed validator must not retain its compiled module", () => {
    // Inspect an actual strong retaining path, not whether GC happens within a timing budget.
    const probe = String.raw`
import { readFile } from "node:fs/promises";
import { getHeapSnapshot } from "node:v8";
import { loadBrowserTypeScriptCompiler } from "@typechat/experimental-browser";
async function createClosedValidator() {
    const bytes = await readFile(new URL("./node_modules/@typescript/typescript-wasip1-wasm/lib/tsc.wasm", import.meta.url));
    const originalFetch = globalThis.fetch;
    const originalCompile = WebAssembly.compile;
    globalThis.fetch = async () => new Response(bytes);
    WebAssembly.compile = async (...args) => {
        const module = await originalCompile(...args);
        module.__typechatStabilityModule = true;
        return module;
    };
    try {
        const compiler = await loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm");
        const validator = await compiler.createValidator("export interface Probe { value: number }", "Probe");
        validator.validate({ value: 1 });
        validator.close();
        validator.__typechatStabilityClosedValidator = true;
        globalThis.retainedClosedValidator = validator;
    } finally {
        globalThis.fetch = originalFetch;
        WebAssembly.compile = originalCompile;
    }
}
await createClosedValidator();
await new Promise(resolve => setImmediate(resolve));
const chunks = [];
for await (const chunk of getHeapSnapshot()) chunks.push(chunk);
const heap = JSON.parse(Buffer.concat(chunks).toString());
const nf = heap.snapshot.meta.node_fields, ef = heap.snapshot.meta.edge_fields;
const edgeTypes = heap.snapshot.meta.edge_types[0];
const size = nf.length, edgeSize = ef.length;
const nameIndex = nf.indexOf("name"), countIndex = nf.indexOf("edge_count");
const typeIndex = ef.indexOf("type"), edgeNameIndex = ef.indexOf("name_or_index"), toIndex = ef.indexOf("to_node");
const nodeName = offset => heap.strings[heap.nodes[offset + nameIndex]];
const edgeName = offset => ["element", "hidden"].includes(edgeTypes[heap.edges[offset + typeIndex]])
    ? String(heap.edges[offset + edgeNameIndex]) : heap.strings[heap.edges[offset + edgeNameIndex]];
const starts = new Map();
let cursor = 0, closedValidator, module;
for (let offset = 0; offset < heap.nodes.length; offset += size) {
    starts.set(offset, cursor);
    for (let i = 0; i < heap.nodes[offset + countIndex]; i++, cursor += edgeSize) {
        if (edgeName(cursor) === "__typechatStabilityClosedValidator") closedValidator = offset;
        if (edgeName(cursor) === "__typechatStabilityModule") module = offset;
    }
}
if (closedValidator === undefined) throw new Error("The heap probe did not find its retained validator.");
const parents = new Map([[closedValidator, null]]), queue = [closedValidator];
for (let q = 0; q < queue.length && module !== undefined && !parents.has(module); q++) {
    const offset = queue[q];
    for (let e = starts.get(offset), end = e + heap.nodes[offset + countIndex] * edgeSize; e < end; e += edgeSize) {
        if (edgeTypes[heap.edges[e + typeIndex]] === "weak") continue;
        const to = heap.edges[e + toIndex];
        if (!parents.has(to)) {
            parents.set(to, { from: offset, edge: edgeName(e) });
            queue.push(to);
        }
    }
}
let path = null;
if (module !== undefined && parents.has(module)) {
    path = [];
    for (let at = module; parents.get(at); at = parents.get(at).from) {
        const entry = parents.get(at);
        path.push(nodeName(entry.from) + " --" + entry.edge + "--> " + nodeName(at));
    }
    path.reverse();
}
console.log(JSON.stringify({ closedMemory: globalThis.retainedClosedValidator.getWasmMemoryByteLength(), path }));
`;
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: environment,
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 1024 * 1024
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.closedMemory, 0);
    assert.equal(result.path, null, `Closed validator retains its compiled module:\n${result.path?.join("\n")}`);
});

// Independent semantic gates for microsoft/TypeScript#65451 and #65458.
// The lone-surrogate/BOM cases must stay red until the declared value is preserved.
const upstreamCases = [
    {
        name: "leading-dot numeric literal",
        schema: "export interface Probe { value: .1; }",
        accepted: { value: 0.1 },
        rejected: { value: 0.2 }
    },
    {
        name: "leading-dot numeric initializer",
        schema: "export const decimal = .1; export interface Probe { value: typeof decimal; }",
        accepted: { value: 0.1 },
        rejected: { value: 0.2 }
    },
    {
        name: "large enum followed by interface",
        schema: "export enum E { X = 1e20 } export interface Probe { value: E; }",
        accepted: { value: 1e20 },
        rejected: { value: 0 }
    },
    {
        name: "leading BOM enum value",
        schema: 'export enum E { X = "\\uFEFFx" } export interface Probe { value: E; }',
        accepted: { value: "\uFEFFx" },
        rejected: { value: "x" }
    },
    {
        name: "BOM after lone surrogate enum value",
        schema: 'export enum E { X = "\\ud800\\uFEFFx" } export interface Probe { value: E; }',
        accepted: { value: "\ud800\uFEFFx" },
        rejected: { value: "\ud800x" }
    }
];

for (const backend of ["stable-native", "pinned-wasm"]) {
    for (const example of upstreamCases) {
        test(`stability upstream: ${backend}: ${example.name}`, t => {
            const probe = String.raw`
import { readFile } from "node:fs/promises";
import * as core from "@typechat/experimental-browser";
import { createTypeScriptJsonValidator } from "../../dist/ts/index.js";
const { backend, example } = JSON.parse(process.env.TYPECHAT_STABILITY_CASE);
let validator, phase = "loading", result;
try {
    let createValidator = createTypeScriptJsonValidator;
    if (backend === "pinned-wasm") {
        const artifact = await readFile(new URL("./node_modules/@typescript/typescript-wasip1-wasm/lib/tsc.wasm", import.meta.url));
        globalThis.fetch = async () => new Response(artifact);
        const compiler = await core.loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm");
        createValidator = (...args) => compiler.createValidator(...args);
    }
    phase = "createValidator";
    validator = await createValidator(example.schema, "Probe");
    phase = "schema preflight";
    const schema = validator[core.typeChatSchemaValidation]();
    phase = "validate declared value";
    const accepted = validator.validate(example.accepted);
    phase = "validate different value";
    const rejected = validator.validate(example.rejected);
    result = { kind: "results", schema, accepted, rejected };
} catch (error) {
    result = { kind: "exception", phase, name: error.name, message: error.message };
} finally {
    try { validator?.close(); }
    catch (error) { result.closeError = error.message; }
}
console.log("STABILITY_UPSTREAM_RESULT=" + JSON.stringify(result));
`;
            const environment = { ...process.env, TYPECHAT_STABILITY_CASE: JSON.stringify({ backend, example }) };
            delete environment.NODE_TEST_CONTEXT;
            const child = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
                cwd: fileURLToPath(new URL("..", import.meta.url)),
                env: environment,
                encoding: "utf8",
                timeout: 15000,
                maxBuffer: 1024 * 1024
            });
            const line = child.stdout?.split(/\r?\n/).find(line => line.startsWith("STABILITY_UPSTREAM_RESULT="));
            const result = line ? JSON.parse(line.slice("STABILITY_UPSTREAM_RESULT=".length)) : undefined;
            t.diagnostic(JSON.stringify({ backend, case: example.name, result, status: child.status,
                error: child.error?.message, stderr: child.stderr?.slice(-1500) }));
            assert.ifError(child.error);
            assert.equal(child.status, 0, child.stderr);
            assert.equal(result?.kind, "results", `${example.name} must not throw: ${JSON.stringify(result)}`);
            assert.equal(result.schema.success, true, result.schema.message);
            assert.equal(result.accepted.success, true, `The declared value must validate: ${result.accepted.message}`);
            assert.deepEqual(result.accepted.data, example.accepted);
            assert.equal(result.rejected.success, false, "A different value must not validate.");
            assert.deepEqual(result.rejected.data, example.rejected);
            assert.equal(result.closeError, undefined);
        });
    }
}

// Opt in so ordinary experimental Node tests do not acquire a browser dependency at runtime.
for (const engineName of ["chromium", "firefox", "webkit"]) {
    test(`stability: ${engineName} worker cancellation, sibling survival, and recovery`, {
        skip: process.env.TYPECHAT_STABILITY_BROWSERS !== "1",
        timeout: 90000
    }, async t => {
        const { build } = await import("esbuild");
        const { [engineName]: engine } = await import("playwright");
        const { buildWorkerExample } = await import("../examples/worker/build.mjs");
        const settings = { bundle: true, platform: "browser", format: "iife", write: false, logLevel: "silent" };
        const entry = await build({
            ...settings,
            stdin: {
                contents: `import * as core from "@typechat/experimental-browser";
import { validateInWorker } from "./examples/worker/client.ts";
globalThis.stability = { core, validateInWorker };`,
                resolveDir: fileURLToPath(new URL("..", import.meta.url))
            }
        });
        const mismatch = await build({
            ...settings,
            stdin: {
                contents: `import { loadBrowserTypeScriptCompiler } from "@typechat/experimental-browser";
globalThis.mismatchedLoader = loadBrowserTypeScriptCompiler;`,
                resolveDir: fileURLToPath(new URL("..", import.meta.url))
            },
            plugins: [{
                name: "stability-version-mismatch",
                setup(builder) {
                    builder.onResolve({ filter: /^typescript$/ }, () => ({ path: "version", namespace: "mismatch" }));
                    builder.onLoad({ filter: /.*/, namespace: "mismatch" }, () => ({
                        contents: 'export const version = "0.0.0";', loader: "js"
                    }));
                }
            }]
        });
        const assets = await buildWorkerExample();
        assets.set("/", ["text/html", '<script src="/entry.js"></script><script src="/mismatch.js"></script>']);
        assets.set("/entry.js", ["text/javascript", entry.outputFiles[0].contents]);
        assets.set("/mismatch.js", ["text/javascript", mismatch.outputFiles[0].contents]);
        assets.set("/tsc.wasm", ["application/wasm", artifact]);
        assets.set("/short.wasm", ["application/wasm", artifact.subarray(0, 100)]);
        let mismatchRequests = 0;
        const server = createServer((request, response) => {
            if (request.url === "/never-fetch.wasm") mismatchRequests++;
            const asset = assets.get(request.url);
            response.writeHead(asset ? 200 : 404, { "Content-Type": asset?.[0] ?? "text/plain" });
            response.end(asset?.[1] ?? "Not found");
        });
        const scratch = fileURLToPath(new URL(`./.stability-${process.pid}-${engineName}`, import.meta.url));
        const previousEnvironment = { TMP: process.env.TMP, TEMP: process.env.TEMP };
        let browser;
        t.after(async () => {
            try {
                await browser?.close();
            } finally {
                server.closeAllConnections();
                await new Promise(resolve => server.close(resolve));
                for (const [name, value] of Object.entries(previousEnvironment)) {
                    if (value === undefined) delete process.env[name];
                    else process.env[name] = value;
                }
                await rm(scratch, { recursive: true, force: true });
            }
        });
        await mkdir(scratch, { recursive: true });
        process.env.TMP = process.env.TEMP = scratch;
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        browser = await engine.launch({ headless: true, downloadsPath: scratch, artifactsDir: scratch });
        const page = await browser.newPage();
        const workerClosures = [];
        const errors = [];
        page.on("worker", worker => workerClosures.push(once(worker, "close")));
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        const result = await page.evaluate(async ({ numericSchema, stringSchema }) => {
            const { core, validateInWorker } = globalThis.stability;
            const check = (condition, message) => { if (!condition) throw new Error(message); };
            const job = (schema, values, path = "/tsc.wasm") => ({
                wasmUrl: new URL(path, location.href).href, schema, typeName: "Probe", values
            });
            let listeners = 0;
            function controller() {
                const controller = new AbortController();
                const add = controller.signal.addEventListener.bind(controller.signal);
                const remove = controller.signal.removeEventListener.bind(controller.signal);
                controller.signal.addEventListener = (...args) => { if (args[0] === "abort") listeners++; return add(...args); };
                controller.signal.removeEventListener = (...args) => { if (args[0] === "abort") listeners--; return remove(...args); };
                return controller;
            }
            const shared = controller();
            let mismatch;
            try { await globalThis.mismatchedLoader("/never-fetch.wasm"); }
            catch (error) { mismatch = error.message; }
            check(/Expected TypeScript .* loaded 0\.0\.0/.test(mismatch), "Version mismatch was not explicit.");
            const cancelled = controller();
            const reason = new Error("cancel only the numeric job");
            let validating = false;
            const [aborted, sibling] = await Promise.allSettled([
                validateInWorker("/validator.worker.js", job(numericSchema, Array.from({ length: 100 }, (_, value) => ({ value }))), {
                    signal: cancelled.signal,
                    onPhase(phase) {
                        if (phase === "validating") { validating = true; cancelled.abort(reason); }
                    }
                }),
                validateInWorker("/validator.worker.js", job(stringSchema, [{ value: "alive" }, { value: 1 }]), {
                    signal: shared.signal
                })
            ]);
            check(validating && aborted.status === "rejected" && aborted.reason === reason, "Cancellation lost its reason or phase.");
            check(sibling.status === "fulfilled" && sibling.value.results[0].success && !sibling.value.results[1].success,
                "Cancellation poisoned the sibling.");
            check(sibling.value.results[1].data.value === 1 && sibling.value.results[1].message.length > 0,
                "Rejected worker candidate metadata was lost.");
            check(sibling.value.closedLinearMemoryBytes === 0, "Sibling retained its owned memory.");
            for (const [schema, path, pattern] of [
                ["export interface Probe { value: MissingType; }", "/tsc.wasm", /Schema validation failed/],
                [numericSchema, "/short.wasm", /received 100/]
            ]) {
                let failure;
                try { await validateInWorker("/validator.worker.js", job(schema, [], path), { signal: shared.signal }); }
                catch (error) { failure = error.message; }
                check(pattern.test(failure), `Worker failure was not explicit: ${failure}`);
            }
            for (let cycle = 0; cycle < 3; cycle++) {
                const report = await validateInWorker("/validator.worker.js", job(numericSchema, [{ value: cycle }, { value: "bad" }]), {
                    signal: shared.signal
                });
                check(report.results[0].success && !report.results[1].success, "A fresh worker did not recover.");
                check(report.results[1].data.value === "bad", "Fresh worker lost rejected data.");
                check(report.closedLinearMemoryBytes === 0, "Fresh worker retained owned memory.");
                check(listeners === 0, "A settled job retained its AbortSignal listener.");
            }
            shared.abort(new Error("abort after settlement must have no effect"));
            const compiler = await core.loadBrowserTypeScriptCompiler("/tsc.wasm");
            const validator = await compiler.createValidator(numericSchema, "Probe");
            try {
                check(validator.validate({ value: 9 }).success, "Mismatched bundle poisoned the real compiler.");
            } finally {
                validator.close();
            }
            return { listeners, validating, closedMemory: validator.getWasmMemoryByteLength() };
        }, { numericSchema, stringSchema });
        assert.deepEqual(result, { listeners: 0, validating: true, closedMemory: 0 });
        await Promise.all(workerClosures);
        assert.equal(workerClosures.length, 7);
        assert.equal(page.workers().length, 0);
        assert.equal(mismatchRequests, 0);
        assert.deepEqual(errors, []);
        t.diagnostic(`${engineName}: seven workers closed; no abort listeners, page errors, or mismatch fetches.`);
    });
}
