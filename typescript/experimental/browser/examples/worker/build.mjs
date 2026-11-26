import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { compilerVersion, wasmSha256 } from "../../dist/experimental/browser/src/versions.js";

export const wasmAssetPath = `/typescript-${compilerVersion}-${wasmSha256}.wasm`;

export async function buildWorkerExample() {
    const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
    if (html.split("__TYPECHAT_WASM_ASSET__").length !== 2) {
        throw new Error("The worker example must contain exactly one WASM asset placeholder.");
    }
    const assets = new Map([
        ["/worker", ["text/html; charset=utf-8", html.replace("__TYPECHAT_WASM_ASSET__", wasmAssetPath)]],
        ["/worker.css", ["text/css; charset=utf-8", await readFile(new URL("./style.css", import.meta.url))]]
    ]);
    for (const [source, route] of [
        ["main.mjs", "/worker-main.js"],
        ["client.ts", "/worker-client.js"],
        ["validator.worker.ts", "/validator.worker.js"]
    ]) {
        const result = await build({
            entryPoints: [fileURLToPath(new URL(source, import.meta.url))],
            platform: "browser",
            format: "esm",
            target: "es2021",
            bundle: true,
            minify: true,
            write: false,
            metafile: true,
            logLevel: "silent"
        });
        if (Object.values(result.metafile.outputs).some(output => output.imports.length !== 0)) {
            throw new Error("Worker example bundles must be self-contained.");
        }
        assets.set(route, ["text/javascript", result.outputFiles[0].contents]);
    }
    return assets;
}
