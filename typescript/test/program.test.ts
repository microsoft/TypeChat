import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    createModuleTextFromProgram,
    createProgramTranslator,
    evaluateJsonProgram,
    type FunctionCall,
    type Program,
    type TypeScriptJsonValidator
} from "../dist/ts/index.js";

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

describe("createProgramTranslator", () => {
    const apiSchema = "export interface API { add(a: number, b: number): number; }";

    it("preflights an API-only schema and translates a valid program", async () => {
        let modelCalls = 0;
        const translator = createProgramTranslator({
            async complete() {
                modelCalls++;
                return {
                    success: true as const,
                    data: '{"@steps":[{"@func":"add","@args":[1,2]}]}'
                };
            }
        }, apiSchema);

        try {
            const result = await translator.translate("add one and two");
            assert.ok(result.success);
            assert.deepEqual(result.data, { "@steps": [{ "@func": "add", "@args": [1, 2] }] });
            assert.equal(modelCalls, 1);
        } finally {
            (translator.validator as TypeScriptJsonValidator<Program>).close();
        }
    });

    it("repairs a program response that does not match the API", async () => {
        const responses = [
            '{"@steps":[{"@func":"add","@args":["one",2]}]}',
            '{"@steps":[{"@func":"add","@args":[1,2]}]}'
        ];
        let modelCalls = 0;
        const translator = createProgramTranslator({
            async complete() {
                const data = responses[modelCalls++];
                return { success: true as const, data };
            }
        }, apiSchema);

        try {
            const result = await translator.translate("add one and two");
            assert.ok(result.success);
            assert.deepEqual(result.data, { "@steps": [{ "@func": "add", "@args": [1, 2] }] });
            assert.equal(modelCalls, 2);
        } finally {
            (translator.validator as TypeScriptJsonValidator<Program>).close();
        }
    });
});

// ---------------------------------------------------------------------------
// @func name validation (source injection / unchecked dispatch)
// ---------------------------------------------------------------------------

describe("hasOwnProperty shadowing in parsed programs", () => {
    it("returns an error result for a step with no @func", () => {
        const input = JSON.parse('{"@steps":[{"hasOwnProperty":1}]}');
        const result = createModuleTextFromProgram(input);
        assert.equal(result.success, false);
    });

    it("generates code for an object argument named hasOwnProperty", () => {
        const program = JSON.parse('{"@steps":[{"@func":"first","@args":[{"hasOwnProperty":1}]}]}');
        const result = createModuleTextFromProgram(program);
        assert.equal(result.success, true);
        assert.match((result as { data: string }).data, /"hasOwnProperty": 1/);
    });

    it("evaluates an object argument named hasOwnProperty", async () => {
        const program = JSON.parse('{"@steps":[{"@func":"first","@args":[{"hasOwnProperty":1}]}]}');
        const result = await evaluateJsonProgram(program, async (_func, args) => args[0]);
        assert.deepEqual(result, { hasOwnProperty: 1 });
    });
});

describe("__proto__ as object property key", () => {
    it("generates a computed property name for a string value", () => {
        const program = JSON.parse('{"@steps":[{"@func":"first","@args":[{"__proto__":"hello"}]}]}');
        const result = createModuleTextFromProgram(program);
        assert.equal(result.success, true);
        assert.match((result as { data: string }).data, /\["__proto__"\]: "hello"/);
        assert.doesNotMatch((result as { data: string }).data, /"__proto__": "hello"/);
    });

    it("generates a computed property name for a numeric value", () => {
        const program = JSON.parse('{"@steps":[{"@func":"first","@args":[{"__proto__":42}]}]}');
        const result = createModuleTextFromProgram(program);
        assert.equal(result.success, true);
        assert.match((result as { data: string }).data, /\["__proto__"\]: 42/);
    });

    it("generates a computed property name for a null value", () => {
        const program = JSON.parse('{"@steps":[{"@func":"first","@args":[{"__proto__":null}]}]}');
        const result = createModuleTextFromProgram(program);
        assert.equal(result.success, true);
        assert.match((result as { data: string }).data, /\["__proto__"\]: null/);
    });

    it("evaluates an object with __proto__ as an own data property", async () => {
        const program = JSON.parse('{"@steps":[{"@func":"first","@args":[{"__proto__":"value"}]}]}');
        const result = await evaluateJsonProgram(program, async (_func, args) => args[0]);
        assert.ok(Object.prototype.hasOwnProperty.call(result, "__proto__"));
        assert.equal((result as Record<string, unknown>)["__proto__"], "value");
    });
});

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

    it("createModuleTextFromProgram rejects a call object with a non-array @args", () => {
        const result = createModuleTextFromProgram({
            "@steps": [
                { "@func": "first", "@args": "not-an-array" as unknown as [] },
            ],
        });
        assert.equal(result.success, false);
    });

    it("createModuleTextFromProgram rejects a call object with extra unexpected keys", () => {
        const result = createModuleTextFromProgram({
            "@steps": [
                { "@func": "first", "@args": [], "extra": true } as unknown as FunctionCall,
            ],
        });
        assert.equal(result.success, false);
    });

    it("evaluateJsonProgram throws instead of dispatching a call object with a non-array @args", async () => {
        const program = {
            "@steps": [
                { "@func": "first", "@args": "not-an-array" },
            ],
        } as unknown as Program;
        let dispatched = false;
        await assert.rejects(
            evaluateJsonProgram(program, async (func, args) => {
                dispatched = true;
                return undefined;
            }),
            /Invalid function call/
        );
        assert.equal(dispatched, false);
    });

    it("evaluateJsonProgram throws instead of dispatching a call object with extra unexpected keys", async () => {
        const program = {
            "@steps": [
                { "@func": "first", "@args": [], "extra": true },
            ],
        } as unknown as Program;
        let dispatched = false;
        await assert.rejects(
            evaluateJsonProgram(program, async (func, args) => {
                dispatched = true;
                return undefined;
            }),
            /Invalid function call/
        );
        assert.equal(dispatched, false);
    });
});
