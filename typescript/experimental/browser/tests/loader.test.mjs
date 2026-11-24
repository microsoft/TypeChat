import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadBrowserTypeScriptCompiler, compilerVersion } from "@typechat/experimental-browser";
import { wasmByteLength, wasmSha256 } from "../dist/experimental/browser/src/versions.js";

const artifact = await readFile(new URL("../node_modules/@typescript/typescript-wasip1-wasm/lib/tsc.wasm", import.meta.url));

test("compiler and artifact are pinned to the same exact version and bytes", async () => {
    for (const name of ["typescript", "@typescript/typescript-wasip1-wasm"]) {
        const manifest = JSON.parse(await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8"));
        assert.equal(manifest.version, compilerVersion);
    }
    assert.equal(artifact.byteLength, wasmByteLength);
    assert.equal(createHash("sha256").update(artifact).digest("hex"), wasmSha256);
});

test("load failures are explicit and never retried", async t => {
    let calls = 0;
    const fetch = t.mock.method(globalThis, "fetch", async () => {
        calls++;
        return new Response("Not found", { status: 404 });
    });
    await assert.rejects(loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm"), /HTTP 404/);
    assert.equal(calls, 1);
    const networkError = new TypeError("synthetic network error");
    fetch.mock.mockImplementation(async () => { throw networkError; });
    await assert.rejects(loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm"), error => error === networkError);
});

test("an already-aborted load never fetches", async t => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("unexpected fetch"); });
    await assert.rejects(
        loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm", { signal: AbortSignal.abort() }),
        { name: "AbortError" }
    );
    assert.equal(calls, 0);
});

test("empty, truncated, and oversized artifacts are rejected", async t => {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null));
    await assert.rejects(loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm"), /no body/);
    fetch.mock.mockImplementation(async () => new Response(artifact.subarray(0, 100)));
    await assert.rejects(loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm"), /received 100/);
    let cancelled = false;
    fetch.mock.mockImplementation(async () => new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(artifact);
            controller.enqueue(new Uint8Array([0]));
        },
        cancel() { cancelled = true; }
    })));
    await assert.rejects(loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm"), /exceeds the expected/);
    assert.equal(cancelled, true);
});

test("equal-sized mismatched artifacts fail integrity verification", async t => {
    const incorrect = new Uint8Array(artifact);
    incorrect[incorrect.length - 1] ^= 1;
    t.mock.method(globalThis, "fetch", async () => new Response(incorrect));
    await assert.rejects(loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm"), /SHA-256 mismatch/);
});

test("one compiled module supports independent disposable validators without refetching", async t => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(artifact); });
    const compiler = await loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm");
    const [numbers, strings] = await Promise.all([
        compiler.createValidator("export interface Probe { value: number }", "Probe"),
        compiler.createValidator("export interface Probe { value: string }", "Probe")
    ]);
    try {
        assert.equal(numbers.validate({ value: 1 }).success, true);
        assert.equal(strings.validate({ value: 1 }).success, false);
        assert.ok(numbers.getWasmMemoryByteLength() > 0);
        numbers.close();
        numbers.close();
        assert.equal(numbers.getWasmMemoryByteLength(), 0);
        assert.throws(() => numbers.validate({ value: 1 }), /closed/);
        assert.equal(strings.validate({ value: "still active" }).success, true);
        assert.equal(calls, 1);
    } finally {
        numbers.close();
        strings.close();
    }
});
