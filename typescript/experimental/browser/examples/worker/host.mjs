import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { buildWorkerExample, wasmAssetPath } from "./build.mjs";
import { wasmByteLength, wasmSha256 } from "../../dist/experimental/browser/src/versions.js";

export { wasmAssetPath } from "./build.mjs";
export const contentSecurityPolicy = [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self'",
    "connect-src 'self'",
    "style-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
].join("; ");

function chooseEncoding(header) {
    if (!header?.trim()) {
        return "identity";
    }
    const qualities = new Map();
    for (const entry of header.split(",")) {
        const match = /^\s*([a-z0-9!#$%&'*+.^_`|~-]+)\s*(?:;\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/i.exec(entry);
        if (!match) {
            return { status: 400, message: "Invalid Accept-Encoding header." };
        }
        const name = match[1].toLowerCase();
        qualities.set(name, Math.max(qualities.get(name) ?? 0, Number(match[2] ?? 1)));
    }
    const gzip = qualities.get("gzip") ?? qualities.get("*") ?? 0;
    // Identity remains acceptable unless explicitly excluded, including by "*;q=0".
    const identity = qualities.get("identity") ?? (qualities.get("*") === 0 ? 0 : 1);
    if (gzip > 0 && gzip >= identity) {
        return "gzip";
    }
    return identity > 0 ? "identity" : { status: 406, message: "No acceptable content encoding." };
}

export async function createWorkerExampleHandler() {
    const assets = await buildWorkerExample();
    const wasm = await readFile(new URL("../../node_modules/@typescript/typescript-wasip1-wasm/lib/tsc.wasm", import.meta.url));
    if (wasm.length !== wasmByteLength || createHash("sha256").update(wasm).digest("hex") !== wasmSha256) {
        throw new Error("The hosted WASM artifact does not match the pinned compiler.");
    }
    assets.set(wasmAssetPath, ["application/wasm", wasm]);
    const representations = new Map();
    for (const [route, [type, source]] of assets) {
        const identity = Buffer.from(source);
        const gzip = gzipSync(identity);
        const etag = bytes => `"${createHash("sha256").update(bytes).digest("hex")}"`;
        representations.set(route, { type, identity, gzip, identityTag: etag(identity), gzipTag: etag(gzip) });
    }

    return (request, response) => {
        const asset = representations.get(request.url);
        if (!asset) {
            return false;
        }
        const headers = {
            "Content-Security-Policy": contentSecurityPolicy,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store"
        };
        const fail = (status, message, extra = {}) => {
            response.writeHead(status, { ...headers, "Content-Type": "text/plain; charset=utf-8", ...extra });
            response.end(request.method === "HEAD" ? undefined : message);
            return true;
        };
        if (request.method !== "GET" && request.method !== "HEAD") {
            return fail(405, "Only GET and HEAD are supported.", { Allow: "GET, HEAD" });
        }
        const encoding = chooseEncoding(request.headers["accept-encoding"]);
        if (typeof encoding !== "string") {
            return fail(encoding.status, encoding.message);
        }
        const body = asset[encoding];
        const tag = encoding === "gzip" ? asset.gzipTag : asset.identityTag;
        headers["Content-Type"] = asset.type;
        headers.Vary = "Accept-Encoding";
        if (encoding === "gzip") {
            headers["Content-Encoding"] = "gzip";
        }
        if (request.url === wasmAssetPath) {
            headers["Cache-Control"] = "public, max-age=31536000, immutable";
            headers.ETag = tag;
            const matches = request.headers["if-none-match"]?.split(",")
                .some(value => ["*", tag, `W/${tag}`].includes(value.trim()));
            if (matches) {
                response.writeHead(304, headers);
                response.end();
                return true;
            }
        }
        headers["Content-Length"] = body.length;
        response.writeHead(200, headers);
        response.end(request.method === "HEAD" ? undefined : body);
        return true;
    };
}
