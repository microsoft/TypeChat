import { createServer } from "node:http";
import { createWorkerExampleHandler } from "./host.mjs";

const handleExample = await createWorkerExampleHandler();
const server = createServer((request, response) => {
    if (!handleExample(request, response)) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        response.end("Not found");
    }
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
