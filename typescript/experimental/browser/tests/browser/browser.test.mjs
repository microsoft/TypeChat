import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright";
import { createWorkerExampleHandler } from "../../examples/worker/host.mjs";
import { sampleBrowserMemory } from "./process-memory.mjs";

for (const engine of [chromium, firefox, webkit]) {
    test(`${engine.name()}: main-thread and worker validation without Node shims or live models`, { timeout: 240000 }, async t => {
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
        const compressedWasm = gzipSync(wasm);
        const workerProbe = await build({
            ...settings,
            entryPoints: [fileURLToPath(new URL("./worker-entry.mjs", import.meta.url))]
        });
        let wasmRequests = 0;
        let throttledChunks = 0;
        const assets = new Map([
            ["/", ["text/html", '<script src="/probe.js"></script>']],
            ["/mismatch", ["text/html", '<script src="/mismatch.js"></script>']],
            ["/probe.js", ["text/javascript", bundle.outputFiles[0].contents]],
            ["/mismatch.js", ["text/javascript", mismatch.outputFiles[0].contents]],
            ["/tsc.wasm", ["application/wasm", wasm]],
            ["/worker-probe", ["text/html", '<script src="/worker-probe.js"></script>']],
            ["/worker-probe.js", ["text/javascript", workerProbe.outputFiles[0].contents]],
            ["/broken-worker.js", ["text/javascript", 'throw new Error("synthetic worker startup failure");']]
        ]);
        const handleExample = await createWorkerExampleHandler();
        const server = createServer((request, response) => {
            if (handleExample(request, response)) return;
            if (request.url === "/slow.wasm" || request.url === "/worker-slow.wasm") {
                response.writeHead(200, { "Content-Type": "application/wasm" });
                response.write(wasm.subarray(0, 100));
                if (request.url === "/worker-slow.wasm") {
                    response.once("close", () => server.emit("worker-slow-closed"));
                    server.emit("worker-slow-started");
                }
                return;
            }
            if (request.url === "/throttled.wasm") {
                response.writeHead(200, {
                    "Content-Type": "application/wasm",
                    "Content-Encoding": "gzip",
                    "Content-Length": compressedWasm.length,
                    "Cache-Control": "no-store"
                });
                let offset = 0;
                let timer;
                const send = () => {
                    if (offset >= compressedWasm.length) {
                        response.end();
                        return;
                    }
                    const chunk = compressedWasm.subarray(offset, offset + 256 * 1024);
                    offset += chunk.length;
                    throttledChunks++;
                    if (response.write(chunk)) {
                        schedule();
                    } else {
                        response.once("drain", schedule);
                    }
                };
                const schedule = () => { timer = setTimeout(send, 64); };
                response.once("close", () => {
                    clearTimeout(timer);
                    response.removeListener("drain", schedule);
                });
                send();
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
        let browserServer;
        t.after(async () => {
            try {
                await browser?.close();
            } finally {
                await browserServer?.close();
                server.closeAllConnections();
                await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            }
        });
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        browserServer = await engine.launchServer({ headless: true });
        browser = await engine.connect(browserServer.wsEndpoint());
        const page = await browser.newPage();
        const baselineMemory = await sampleBrowserMemory(browserServer.process().pid);
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
        await page.goto(`http://127.0.0.1:${address.port}/worker`);
        await page.locator("#run").click();
        await page.waitForFunction(() => !document.getElementById("run").disabled, null, { timeout: 65000 });
        assert.equal(await page.locator("#status").innerText(), "Completed; worker disposed");
        const demo = JSON.parse(await page.locator("#result").innerText());
        assert.deepEqual(demo.results.map(result => result.success), [true, false]);
        assert.equal(demo.closedLinearMemoryBytes, 0);
        await page.goto(`http://127.0.0.1:${address.port}/worker-probe`);
        const workerChecks = await page.evaluate(() => globalThis.runWorkerChecks());
        assert.equal(workerChecks.checks.length, 10);
        assert.ok(throttledChunks > 1, "The compressed artifact must be delivered over multiple delayed chunks.");
        const slowStarted = once(server, "worker-slow-started");
        await page.evaluate(() => globalThis.startStalledWorker());
        await slowStarted;
        const slowClosed = once(server, "worker-slow-closed");
        assert.deepEqual(await page.evaluate(() => globalThis.abortStalledWorker()), { aborted: true });
        await slowClosed;
        await page.evaluate(() => globalThis.startWorkerStress());
        await page.waitForFunction(() => globalThis.workerStressPhase === "validating");
        const processMemorySamples = [];
        for (let count = 0; count < 4 && await page.evaluate(() => globalThis.workerStressActive); count++) {
            const sample = await sampleBrowserMemory(browserServer.process().pid);
            processMemorySamples.push(sample);
            if (!sample.supported) break;
        }
        const workerStress = await page.evaluate(() => globalThis.workerStressResult);
        await Promise.all(page.workers().map(worker => once(worker, "close")));
        assert.equal(page.workers().length, 0, "All one-shot workers must be terminated after settling.");
        const afterJobsMemory = await sampleBrowserMemory(browserServer.process().pid);
        assert.deepEqual(errors, []);
        const metrics = {
            browser: `${engine.name()} ${browser.version()}`,
            platform: process.platform,
            compiler: result.compiler,
            corpusOutcomes: result.observations.length,
            libraryJavascriptBytes: library.outputFiles[0].contents.length,
            libraryJavascriptGzipBytes: gzipSync(library.outputFiles[0].contents).length,
            testBundleBytes: bundle.outputFiles[0].contents.length,
            wasmBytes: wasm.length,
            wasmGzipBytes: compressedWasm.length,
            loadCompileMs: Math.round(result.loadCompileMs),
            warmInitializationMs: result.warmInitializationMs.map(Math.round),
            crossOriginIsolated: result.crossOriginIsolated,
            largeSchema: result.largeSchema,
            workerChecks,
            workerStress,
            browserProcessTree: { baselineMemory, inFlightSamples: processMemorySamples, afterJobsMemory }
        };
        assert.ok(metrics.libraryJavascriptBytes <= 512 * 1024, "Prototype JavaScript exceeded 512 KiB.");
        assert.ok(metrics.libraryJavascriptGzipBytes <= 128 * 1024, "Compressed prototype JavaScript exceeded 128 KiB.");
        assert.ok(metrics.wasmBytes <= 60 * 1024 * 1024, "Prototype WASM exceeded 60 MiB.");
        assert.ok(metrics.wasmGzipBytes <= 16 * 1024 * 1024, "Compressed prototype WASM exceeded 16 MiB.");
        assert.ok(metrics.largeSchema.finalLinearMemoryBytes <= 128 * 1024 * 1024, "One validator exceeded 128 MiB of linear memory.");
        assert.ok(workerStress.maxLinearMemoryBytes <= 128 * 1024 * 1024, "The worker validator exceeded 128 MiB of linear memory.");
        t.diagnostic(JSON.stringify(metrics));
    });
}
