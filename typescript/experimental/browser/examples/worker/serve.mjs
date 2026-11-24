import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { buildWorkerExample } from "./build.mjs";

const assets = await buildWorkerExample();
assets.set("/tsc.wasm", [
    "application/wasm",
    await readFile(new URL("../../node_modules/@typescript/typescript-wasip1-wasm/lib/tsc.wasm", import.meta.url))
]);
const server = createServer((request, response) => {
    const asset = assets.get(request.url);
    if (request.method !== "GET" || !asset) {
        response.writeHead(404);
        response.end("Not found");
        return;
    }
    response.writeHead(200, { "Content-Type": asset[0], "Cache-Control": "no-store" });
    response.end(asset[1]);
});
server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Unable to determine the worker example address.");
    }
    console.log(`Worker example: http://127.0.0.1:${address.port}/worker`);
    console.log("Press Ctrl+C to stop the local example.");
});
process.once("SIGINT", () => {
    server.closeAllConnections();
    server.close();
});
