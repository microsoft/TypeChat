import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { processRequests } from "../dist/interactive/index.js";

// ---------------------------------------------------------------------------
// processRequests reading requests from an input file
// ---------------------------------------------------------------------------

describe("processRequests with an input file", () => {
    async function run(text: string) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "typechat-interactive-"));
        const inputFile = path.join(dir, "input.txt");
        fs.writeFileSync(inputFile, text);
        const requests: string[] = [];
        const echoed: string[] = [];
        const log = console.log;
        console.log = (message: string) => { echoed.push(message); };
        try {
            await processRequests("> ", inputFile, async request => { requests.push(request); });
        }
        finally {
            console.log = log;
            fs.rmSync(dir, { recursive: true, force: true });
        }
        return { requests, echoed };
    }

    it("processes each line in order and echoes it after the prompt", async () => {
        const { requests, echoed } = await run("first request\nsecond request\n");
        assert.deepEqual(requests, ["first request", "second request"]);
        assert.deepEqual(echoed, ["> first request", "> second request"]);
    });

    it("skips blank lines", async () => {
        const { requests } = await run("\nfirst request\n\n\nsecond request\n\n");
        assert.deepEqual(requests, ["first request", "second request"]);
    });

    it("skips comment lines", async () => {
        const { requests } = await run("# a comment\nfirst request\n# another comment\nsecond request\n");
        assert.deepEqual(requests, ["first request", "second request"]);
    });

    it("keeps a request that only starts with #", async () => {
        const { requests } = await run("#1 priority order\n");
        assert.deepEqual(requests, ["#1 priority order"]);
    });

    it("splits CRLF line endings", async () => {
        const { requests } = await run("# a comment\r\nfirst request\r\nsecond request\r\n");
        assert.deepEqual(requests, ["first request", "second request"]);
    });
});
