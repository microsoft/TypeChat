import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, firefox, webkit } from "playwright";
import {
    contentSecurityPolicy, createWorkerExampleHandler, wasmAssetPath
} from "../../examples/worker/host.mjs";

for (const engine of [chromium, firefox, webkit]) {
    test(`${engine.name()}: hosted worker obeys CSP and consumes versioned compressed assets`, { timeout: 90000 }, async t => {
        const handle = await createWorkerExampleHandler();
        let workerSource;
        const assetRequests = [];
        const server = createServer((request, response) => {
            if (request.url === "/csp-probe.js") {
                response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
                response.end(`
                    globalThis.cspProbe = { evalBlocked: false };
                    try { new Function("return 1")(); }
                    catch (error) { globalThis.cspProbe.evalBlocked = error.name === "EvalError"; }
                `);
                return;
            }
            if (request.url === "/csp-denied-worker.js") {
                response.writeHead(200, {
                    "Content-Type": "text/javascript",
                    "Cache-Control": "no-store",
                    "Content-Security-Policy": contentSecurityPolicy.replace(" 'wasm-unsafe-eval'", "")
                });
                response.end(workerSource);
                return;
            }
            if (request.url === wasmAssetPath) {
                const writeHead = response.writeHead;
                t.mock.method(response, "writeHead", function (status, headers) {
                    assetRequests.push({
                        status,
                        encoding: headers["Content-Encoding"],
                        bytes: Number(headers["Content-Length"] ?? 0)
                    });
                    return writeHead.call(this, status, headers);
                });
            }
            if (!handle(request, response)) {
                response.writeHead(404, { "Cache-Control": "no-store" });
                response.end();
            }
        });
        let browser;
        t.after(async () => {
            try {
                await browser?.close();
            } finally {
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
        const origin = `http://127.0.0.1:${address.port}`;
        const sourceResponse = await fetch(`${origin}/validator.worker.js`);
        assert.equal(sourceResponse.status, 200);
        workerSource = Buffer.from(await sourceResponse.arrayBuffer());
        browser = await engine.launch({ headless: true });
        const page = await browser.newPage();
        const errors = [];
        const workersClosed = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("worker", worker => workersClosed.push(once(worker, "close")));
        const pageResponse = await page.goto(`${origin}/worker`);
        assert.equal(pageResponse.headers()["content-security-policy"], contentSecurityPolicy);
        assert.equal(await page.locator("body").getAttribute("data-wasm-url"), wasmAssetPath);

        for (let run = 0; run < 2; run++) {
            await page.locator("#run").click();
            await page.waitForFunction(() => !document.getElementById("run").disabled, null, { timeout: 65000 });
            assert.equal(await page.locator("#status").innerText(), "Completed; worker disposed");
            const report = JSON.parse(await page.locator("#result").innerText());
            assert.deepEqual(report.results.map(result => result.success), [true, false]);
            assert.equal(report.closedLinearMemoryBytes, 0);
        }
        const repeatRequests = assetRequests.slice();
        assert.ok(repeatRequests.length >= 1 && repeatRequests.length <= 2);
        assert.ok(repeatRequests.every(request => request.encoding === "gzip"), JSON.stringify(repeatRequests));
        assert.ok(repeatRequests.every(request => request.status === 304 || request.bytes < 16 * 1024 * 1024));

        // Execute the check as a real page script, not debugger evaluation that can bypass CSP.
        await page.addScriptTag({ url: `${origin}/csp-probe.js` });
        assert.equal(await page.evaluate(() => globalThis.cspProbe.evalBlocked), true);
        const denied = await page.evaluate(async () => {
            const { validateInWorker } = await import("/worker-client.js");
            try {
                await validateInWorker("/csp-denied-worker.js", {
                    wasmUrl: new URL(document.body.dataset.wasmUrl, location.href).href,
                    schema: "export interface Probe { value: number; }",
                    typeName: "Probe",
                    values: [{ value: 1 }]
                }, { signal: AbortSignal.timeout(30000) });
                return { rejected: false };
            } catch (error) {
                return { rejected: true, name: error.name, message: error.message };
            }
        });
        assert.equal(denied.rejected, true, "Omitting WASM permission must not silently bypass CSP.");
        assert.match(denied.message, /WebAssembly|Content Security Policy|CSP|unsafe-eval/i);
        await Promise.all(workersClosed);
        assert.equal(page.workers().length, 0);
        assert.deepEqual(errors, []);
        t.diagnostic(JSON.stringify({
            browser: `${engine.name()} ${browser.version()}`,
            cspEnforced: true,
            repeatedJobs: 2,
            networkArtifactResponses: repeatRequests,
            cacheAvoidedSecondRequest: repeatRequests.length === 1,
            wasmDeniedError: denied.name
        }));
    });
}
