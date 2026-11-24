import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export async function buildWorkerExample() {
    const assets = new Map([
        ["/worker", ["text/html; charset=utf-8", await readFile(new URL("./index.html", import.meta.url))]]
    ]);
    for (const [source, route] of [["client.ts", "/worker-client.js"], ["validator.worker.ts", "/validator.worker.js"]]) {
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
