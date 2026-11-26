import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, request } from "node:http";
import { after, before, test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
    contentSecurityPolicy, createWorkerExampleHandler, wasmAssetPath
} from "../examples/worker/host.mjs";
import { compilerVersion, wasmByteLength, wasmSha256 } from "../dist/experimental/browser/src/versions.js";

let server;
let origin;
before(async () => {
    const handle = await createWorkerExampleHandler();
    server = createServer((request, response) => {
        if (!handle(request, response)) {
            response.writeHead(404, { "Cache-Control": "no-store" });
            response.end();
        }
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
    server?.closeAllConnections();
    if (server?.listening) {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});

function get(path, { method = "GET", headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = request(new URL(path, origin), { method, headers }, response => {
            const chunks = [];
            response.on("data", chunk => chunks.push(chunk));
            response.once("error", reject);
            response.once("end", () => resolve({
                status: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks)
            }));
        });
        req.once("error", reject);
        req.setTimeout(30000, () => req.destroy(new Error("Hosted asset request timed out.")));
        req.end();
    });
}

test("the HTML and worker use strict CSP without inline scripts/styles or JavaScript eval", async () => {
    const page = await get("/worker");
    assert.equal(page.status, 200);
    assert.equal(page.headers["content-security-policy"], contentSecurityPolicy);
    assert.equal(page.headers["cache-control"], "no-store");
    assert.equal(page.headers["x-content-type-options"], "nosniff");
    assert.ok(!contentSecurityPolicy.includes("'unsafe-inline'"));
    assert.ok(!contentSecurityPolicy.includes("'unsafe-eval'"));
    assert.ok(contentSecurityPolicy.includes("'wasm-unsafe-eval'"));
    const html = page.body.toString("utf8");
    assert.ok(html.includes(wasmAssetPath));
    assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>/i);
    assert.doesNotMatch(html, /<style(?:\s|>)/i);
    for (const path of ["/worker-main.js", "/worker.css", "/worker-client.js", "/validator.worker.js"]) {
        const asset = await get(path, { method: "HEAD" });
        assert.equal(asset.status, 200);
        assert.equal(asset.headers["content-security-policy"], contentSecurityPolicy);
        assert.equal(asset.headers["cache-control"], "no-store");
        assert.equal(asset.body.length, 0);
    }
});

test("the immutable versioned artifact preserves bytes in identity and gzip representations", async () => {
    assert.ok(wasmAssetPath.includes(compilerVersion));
    assert.ok(wasmAssetPath.includes(wasmSha256));
    const identity = await get(wasmAssetPath);
    const compressed = await get(wasmAssetPath, { headers: { "accept-encoding": "gzip" } });
    for (const result of [identity, compressed]) {
        assert.equal(result.status, 200);
        assert.equal(result.headers["content-type"], "application/wasm");
        assert.equal(result.headers.vary, "Accept-Encoding");
        assert.equal(result.headers["cache-control"], "public, max-age=31536000, immutable");
        assert.equal(Number(result.headers["content-length"]), result.body.length);
        assert.equal(result.headers.etag, `"${createHash("sha256").update(result.body).digest("hex")}"`);
    }
    assert.equal(identity.headers["content-encoding"], undefined);
    assert.equal(identity.body.length, wasmByteLength);
    assert.equal(identity.headers.etag, `"${wasmSha256}"`);
    assert.equal(compressed.headers["content-encoding"], "gzip");
    assert.ok(compressed.body.length < 16 * 1024 * 1024);
    assert.deepEqual(gunzipSync(compressed.body), identity.body);
    assert.notEqual(compressed.headers.etag, identity.headers.etag);
});

test("conditional requests have no body and use the selected representation's validator", async () => {
    const first = await get(wasmAssetPath, { method: "HEAD", headers: { "accept-encoding": "gzip" } });
    const cached = await get(wasmAssetPath, {
        headers: { "accept-encoding": "gzip", "if-none-match": `"other", W/${first.headers.etag}` }
    });
    assert.equal(cached.status, 304);
    assert.equal(cached.body.length, 0);
    assert.equal(cached.headers.etag, first.headers.etag);
    assert.equal(cached.headers["content-length"], undefined);
    const different = await get(wasmAssetPath, { method: "HEAD", headers: { "if-none-match": first.headers.etag } });
    assert.equal(different.status, 200);
    assert.equal(different.headers.etag, `"${wasmSha256}"`);
    assert.equal(Number(different.headers["content-length"]), wasmByteLength);
    const missing = await get(wasmAssetPath.replace(wasmSha256, "0".repeat(64)), { headers: { "if-none-match": "*" } });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers["cache-control"], "no-store");
});

test("encoding exclusions, preferences, malformed headers, and unsupported methods are explicit", async () => {
    for (const [encoding, status, expected] of [
        ["gzip;q=0", 200, undefined],
        ["GZIP; q=1, identity;q=0", 200, "gzip"],
        ["gzip;q=0.1, identity;q=0.9", 200, undefined],
        ["*", 200, "gzip"],
        ["gzip;q=0, *;q=1", 200, undefined],
        ["gzip;q=0, identity;q=0", 406, undefined],
        ["*;q=0", 406, undefined],
        ["gzip;q=2", 400, undefined],
        ["gzip;q=1;q=0", 400, undefined],
        ["gzip;quality=1", 400, undefined],
        ["!" + " ".repeat(8000) + "?", 400, undefined],
        ["gzip" + " ".repeat(8000) + ";q=0", 200, undefined],
        ["gzip;q=" + "0".repeat(8000), 400, undefined]
    ]) {
        const result = await get(wasmAssetPath, { method: "HEAD", headers: { "accept-encoding": encoding } });
        assert.equal(result.status, status, encoding);
        assert.equal(result.headers["content-encoding"], expected, encoding);
        assert.equal(result.body.length, 0);
        if (status !== 200) assert.equal(result.headers["cache-control"], "no-store");
    }
    const post = await get(wasmAssetPath, { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, "GET, HEAD");
    assert.match(post.body.toString("utf8"), /Only GET and HEAD/);
});
