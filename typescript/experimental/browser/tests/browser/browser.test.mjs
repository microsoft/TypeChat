import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { chromium } from "playwright";

test("the public prototype runs real browser validation without Node shims or live models", { timeout: 180000 }, async t => {
    const settings = {
        bundle: true,
        platform: "browser",
        format: "iife",
        target: "es2021",
        minify: true,
        write: false,
        metafile: true,
        logLevel: "silent"
    };
    const bundle = await build({
        ...settings,
        entryPoints: [fileURLToPath(new URL("./entry.mjs", import.meta.url))]
    });
    const library = await build({
        ...settings,
        format: "esm",
        entryPoints: [fileURLToPath(new URL("../../dist/experimental/browser/src/index.js", import.meta.url))]
    });
    assert.ok(!Object.keys(bundle.metafile.inputs).some(path => /(?:^|\/)(?:undici|model\.js)(?:\/|$)/.test(path)));
    assert.ok(Object.values(bundle.metafile.outputs).every(output => output.imports.length === 0));
    assert.ok(Object.values(library.metafile.outputs).every(output => output.imports.length === 0));
    const mismatch = await build({
        ...settings,
        entryPoints: [fileURLToPath(new URL("./version-mismatch.mjs", import.meta.url))],
        plugins: [{
            name: "test-compiler-version-mismatch",
            setup(builder) {
                builder.onResolve({ filter: /^typescript$/ }, () => ({ path: "version", namespace: "mismatch" }));
                builder.onLoad({ filter: /.*/, namespace: "mismatch" }, () => ({
                    contents: 'export const version = "0.0.0";',
                    loader: "js"
                }));
            }
        }]
    });
    const wasm = await readFile(new URL("../../node_modules/@typescript/typescript-wasip1-wasm/lib/tsc.wasm", import.meta.url));
    let wasmRequests = 0;
    const assets = new Map([
        ["/", ["text/html", '<script src="/probe.js"></script>']],
        ["/mismatch", ["text/html", '<script src="/mismatch.js"></script>']],
        ["/probe.js", ["text/javascript", bundle.outputFiles[0].contents]],
        ["/mismatch.js", ["text/javascript", mismatch.outputFiles[0].contents]],
        ["/tsc.wasm", ["application/wasm", wasm]]
    ]);
    const server = createServer((request, response) => {
        if (request.url === "/slow.wasm") {
            response.writeHead(200, { "Content-Type": "application/wasm" });
            response.write(wasm.subarray(0, 100));
            return;
        }
        const asset = assets.get(request.url);
        if (!asset) {
            response.writeHead(404);
            response.end();
            return;
        }
        if (request.url === "/tsc.wasm") {
            wasmRequests++;
        }
        response.writeHead(200, { "Content-Type": asset[0], "Cache-Control": "no-store" });
        response.end(asset[1]);
    });
    let browser;
    t.after(async () => {
        await browser?.close();
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    const result = await page.evaluate(() => globalThis.runBrowserProbe());
    assert.equal(result.nodeGlobalsAbsent, true);
    assert.equal(result.liveModelCalls, 0);
    assert.equal(result.stalledLoadTimedOut, true);
    assert.equal(wasmRequests, 1, "Validators should reuse the compiled module rather than refetching WASM.");
    assert.deepEqual(errors, []);
    await page.goto(`http://127.0.0.1:${address.port}/mismatch`);
    assert.deepEqual(await page.evaluate(() => globalThis.runMismatchProbe()), { rejected: true, fetchCalls: 0 });
    const metrics = {
        browser: `Chromium ${browser.version()}`,
        platform: process.platform,
        compiler: result.compiler,
        corpusOutcomes: result.observations.length,
        libraryJavascriptBytes: library.outputFiles[0].contents.length,
        libraryJavascriptGzipBytes: gzipSync(library.outputFiles[0].contents).length,
        testBundleBytes: bundle.outputFiles[0].contents.length,
        wasmBytes: wasm.length,
        wasmGzipBytes: gzipSync(wasm).length,
        loadCompileMs: Math.round(result.loadCompileMs),
        warmInitializationMs: result.warmInitializationMs.map(Math.round),
        crossOriginIsolated: result.crossOriginIsolated,
        largeSchema: result.largeSchema
    };
    assert.ok(metrics.libraryJavascriptBytes <= 512 * 1024, "Prototype JavaScript exceeded 512 KiB.");
    assert.ok(metrics.libraryJavascriptGzipBytes <= 128 * 1024, "Compressed prototype JavaScript exceeded 128 KiB.");
    assert.ok(metrics.wasmBytes <= 60 * 1024 * 1024, "Prototype WASM exceeded 60 MiB.");
    assert.ok(metrics.wasmGzipBytes <= 16 * 1024 * 1024, "Compressed prototype WASM exceeded 16 MiB.");
    assert.ok(metrics.largeSchema.finalLinearMemoryBytes <= 128 * 1024 * 1024, "One validator exceeded 128 MiB of linear memory.");
    t.diagnostic(JSON.stringify(metrics));
});
