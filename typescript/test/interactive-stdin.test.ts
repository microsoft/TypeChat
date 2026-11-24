import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { processRequests } from "../dist/interactive/index.js";

// processRequests reads requests from process.stdin and writes prompts to process.stdout. Each test
// swaps both for PassThrough streams so it controls exactly when input lines and EOF arrive.
const stdinDescriptor = Object.getOwnPropertyDescriptor(process, "stdin")!;
const stdoutDescriptor = Object.getOwnPropertyDescriptor(process, "stdout")!;

function useFakeStdio() {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    stdout.resume(); // discard prompts
    Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
    Object.defineProperty(process, "stdout", { value: stdout, configurable: true });
    return stdin;
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(r => resolve = r);
    return { promise, resolve };
}

// Reports how a promise settled, or "pending" if it has not settled within `ms`, so a hang shows up
// as an assertion failure instead of a stuck test.
async function settled(promise: Promise<unknown>, ms = 1000): Promise<string> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<string>(resolve => { timer = setTimeout(() => resolve("pending"), ms); });
    try {
        return await Promise.race([
            promise.then(() => "resolved", (e: Error) => `rejected: ${e.message}`),
            timeout,
        ]);
    }
    finally {
        clearTimeout(timer);
    }
}

// Starts processRequests with a handler that records each request and holds "one" in flight
// until release() is called.
function startWithSlowFirstRequest() {
    const started = deferred();
    const release = deferred();
    const calls: string[] = [];
    const done = processRequests("> ", undefined, async request => {
        calls.push(request);
        if (request === "one") {
            started.resolve();
            await release.promise;
        }
    });
    return { calls, done, started: started.promise, release: release.resolve };
}

describe("processRequests reading from stdin", () => {
    afterEach(() => {
        Object.defineProperty(process, "stdin", stdinDescriptor);
        Object.defineProperty(process, "stdout", stdoutDescriptor);
    });

    it("processes a line typed while the previous request is still running", async () => {
        const stdin = useFakeStdio();
        const { calls, done, started, release } = startWithSlowFirstRequest();
        stdin.write("one\n");
        await started;
        stdin.write("two\n");
        await new Promise(setImmediate);
        release();
        await new Promise(setImmediate);
        stdin.write("quit\n");
        const result = await settled(done);
        assert.deepEqual({ calls, result }, { calls: ["one", "two"], result: "resolved" });
    });

    it("leaves input unread while more lines are waiting than readline buffers", async () => {
        const stdin = useFakeStdio();
        // Every request is held until released, so input can only drain as fast as requests finish.
        const gates: (() => void)[] = [];
        let hold = true;
        const calls: string[] = [];
        const done = processRequests("> ", undefined, request => {
            calls.push(request);
            return hold ? new Promise<void>(resolve => gates.push(resolve)) : Promise.resolve();
        });
        stdin.write("one\n");
        await new Promise(setImmediate);
        for (let i = 0; i < 3000; i++) {
            stdin.write(`line ${i}\n`);
        }
        await new Promise(setImmediate);
        gates.shift()!();
        for (let i = 0; i < 5; i++) {
            await new Promise(setImmediate);
        }
        const unread = stdin.readableLength;
        hold = false;
        gates.forEach(resolve => resolve());
        stdin.end();
        const result = await settled(done, 5000);
        assert.ok(unread > 0, "all waiting input was read into memory");
        assert.deepEqual({ count: calls.length, last: calls[calls.length - 1], result }, { count: 3001, last: "line 2999", result: "resolved" });
    });

    it("processes every line of a multi-line chunk, such as a paste or a pipe", async () => {
        const stdin = useFakeStdio();
        const calls: string[] = [];
        const done = processRequests("> ", undefined, async request => { calls.push(request); });
        stdin.write("one\n\ntwo\nthree\nquit\n");
        const result = await settled(done);
        assert.deepEqual({ calls, result }, { calls: ["one", "two", "three"], result: "resolved" });
    });

    it("resolves when input ends while a request is still running", async () => {
        const stdin = useFakeStdio();
        const { calls, done, started, release } = startWithSlowFirstRequest();
        stdin.write("one\n");
        await started;
        stdin.end("two\n");
        await once(stdin, "end");
        release();
        const result = await settled(done);
        assert.deepEqual({ calls, result }, { calls: ["one", "two"], result: "resolved" });
    });

    it("stops at quit or exit in the middle of the input", async () => {
        for (const word of ["quit", "EXIT"]) {
            const stdin = useFakeStdio();
            const calls: string[] = [];
            const done = processRequests("> ", undefined, async request => { calls.push(request); });
            stdin.write(`one\n${word}\nthree\n`);
            const result = await settled(done);
            assert.deepEqual({ calls, result }, { calls: ["one"], result: "resolved" });
        }
    });
});
