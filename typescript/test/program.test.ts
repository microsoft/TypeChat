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

    it("resolves a valid forward reference", async () => {
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
});
