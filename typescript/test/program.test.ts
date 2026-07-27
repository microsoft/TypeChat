import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateJsonProgram, createModuleTextFromProgram, Program } from "../dist/ts/index.js";

// ---------------------------------------------------------------------------
// evaluateJsonProgram result-reference bounds checking
// ---------------------------------------------------------------------------

describe("evaluateJsonProgram result references", () => {
    async function run(program: Program) {
        const calls: Array<{ func: string; args: unknown[] }> = [];
        const result = await evaluateJsonProgram(program, async (func, args) => {
            calls.push({ func, args });
            return { func, args };
        });
        return { result, calls };
    }

    it("resolves a valid reference to a preceding step", async () => {
        const program: Program = {
            "@steps": [
                { "@func": "first" },
                { "@func": "second", "@args": [{ "@ref": 0 }] },
            ],
        };
        const { calls } = await run(program);
        assert.deepEqual(calls[1].args, [{ func: "first", args: [] }]);
    });

    it("throws on a negative reference instead of yielding undefined", async () => {
        const program: Program = {
            "@steps": [
                { "@func": "first" },
                { "@func": "second", "@args": [{ "@ref": -1 }] },
            ],
        };
        await assert.rejects(run(program), /Invalid result reference/);
    });

    it("throws on a non-integer reference", async () => {
        const program: Program = {
            "@steps": [
                { "@func": "first" },
                { "@func": "second", "@args": [{ "@ref": 0.5 }] },
            ],
        };
        await assert.rejects(run(program), /Invalid result reference/);
    });

    it("throws on an out-of-upper-bound reference", async () => {
        const program: Program = {
            "@steps": [
                { "@func": "first" },
                { "@func": "second", "@args": [{ "@ref": 5 }] },
            ],
        };
        await assert.rejects(run(program), /Invalid result reference/);
    });
});

// ---------------------------------------------------------------------------
// createModuleTextFromProgram result-reference bounds checking
// ---------------------------------------------------------------------------

describe("createModuleTextFromProgram result references", () => {
    it("emits a step reference for a valid index", () => {
        const result = createModuleTextFromProgram({
            "@steps": [
                { "@func": "first" },
                { "@func": "second", "@args": [{ "@ref": 0 }] },
            ],
        });
        assert.equal(result.success, true);
        assert.match((result as { data: string }).data, /step1/);
    });

    it("rejects a negative index", () => {
        const result = createModuleTextFromProgram({
            "@steps": [
                { "@func": "first" },
                { "@func": "second", "@args": [{ "@ref": -1 }] },
            ],
        });
        assert.equal(result.success, false);
    });

    it("rejects a non-integer index", () => {
        const result = createModuleTextFromProgram({
            "@steps": [
                { "@func": "first" },
                { "@func": "second", "@args": [{ "@ref": 0.5 }] },
            ],
        });
        assert.equal(result.success, false);
    });

    it("rejects an out-of-upper-bound index", () => {
        const result = createModuleTextFromProgram({
            "@steps": [
                { "@func": "first" },
                { "@func": "second", "@args": [{ "@ref": 5 }] },
            ],
        });
        assert.equal(result.success, false);
    });
});

// ---------------------------------------------------------------------------
// @func name validation (source injection / unchecked dispatch)
// ---------------------------------------------------------------------------

describe("@func name validation", () => {
    const maliciousProgram: Program = {
    "@steps": [
        { "@func": "play('x'); /*", "@args": [] },
        { "@func": "deleteEverything", "@args": ["rm", "-rf", 0] },
        { "@func": "*/ api.play", "@args": ["x"] },
    ],
    };

    it("createModuleTextFromProgram rejects a comment-injection @func value", () => {
    const result = createModuleTextFromProgram(maliciousProgram);
    assert.equal(result.success, false);
    });

    it("createModuleTextFromProgram accepts a normal valid program", () => {
    const result = createModuleTextFromProgram({
        "@steps": [
            { "@func": "first", "@args": [] },
            { "@func": "second", "@args": [{ "@ref": 0 }] },
        ],
    });
    assert.equal(result.success, true);
    assert.match((result as { data: string }).data, /api\.first\(\)/);
    assert.match((result as { data: string }).data, /api\.second\(step1\)/);
    });

    it("evaluateJsonProgram throws instead of dispatching a comment-injection @func value", async () => {
    const calls: Array<{ func: string; args: unknown[] }> = [];
    await assert.rejects(
        evaluateJsonProgram(maliciousProgram, async (func, args) => {
            calls.push({ func, args });
            return undefined;
        }),
        /Invalid function name/
    );
    assert.equal(calls.length, 0, "no function should have been dispatched");
    });

    for (const badName of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
    it(`evaluateJsonProgram throws instead of dispatching prototype member "${badName}"`, async () => {
        const program: Program = { "@steps": [{ "@func": badName, "@args": [] }] };
        let dispatched = false;
        await assert.rejects(
            evaluateJsonProgram(program, async (func, args) => {
                dispatched = true;
                return undefined;
            }),
            /Invalid function name/
        );
        assert.equal(dispatched, false);
    });
    }

    it("evaluateJsonProgram dispatches a normal valid program correctly", async () => {
    const calls: Array<{ func: string; args: unknown[] }> = [];
    const result = await evaluateJsonProgram(
        {
            "@steps": [
                { "@func": "first", "@args": [] },
                { "@func": "second", "@args": [{ "@ref": 0 }] },
            ],
        },
        async (func, args) => {
            calls.push({ func, args });
            return `${func}-result`;
        }
    );
    assert.deepEqual(calls[0], { func: "first", args: [] });
    assert.deepEqual(calls[1], { func: "second", args: ["first-result"] });
    assert.equal(result, "second-result");
    });
});
