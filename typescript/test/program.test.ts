import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import type { PromptSection } from "../dist/index.js";
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

    it("program: describes the JSON Program output and allowed API, then validates a program", async () => {
        const calls: PromptSection[][] = [];
        const translator = createProgramTranslator({
            async complete(prompt) {
                assert.ok(Array.isArray(prompt));
                calls.push(structuredClone(prompt));
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
            assert.equal(calls.length, 1);
            const [system] = calls[0];
            assert.match(String(system.content), /export type Program =/);
            assert.match(String(system.content), /"@steps": FunctionCall\[\]/);
            assert.ok(system.content.includes(apiSchema));
            assert.match(String(system.content), /Return only a JSON object of type Program/);
            assert.doesNotMatch(String(system.content), /add one and two/);
            assert.deepEqual(calls[0], [{ role: "system", content: system.content }, { role: "user", content: "add one and two" }]);
        } finally {
            (translator.validator as TypeScriptJsonValidator<Program>).close();
        }
    });

    it("legacy program prompt keeps both schemas and the request in the user role", async () => {
        const translator = createProgramTranslator({
            async complete(prompt) {
                assert.ok(Array.isArray(prompt));
                assert.deepEqual(prompt.map(section => section.role), ["user"]);
                const content = String(prompt[0].content);
                assert.match(content, /export type Program =/);
                assert.ok(content.includes(apiSchema));
                assert.match(content, /The following is a user request:\n"""\nadd one and two\n"""/);
                assert.match(content, /translated into a JSON program object/);
                return { success: true, data: '{"@steps":[]}' };
            }
        }, apiSchema, { promptLayout: "legacy" });
        try {
            assert.ok((await translator.translate("add one and two")).success);
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
            async complete(prompt) {
                if (modelCalls === 1) {
                    assert.ok(Array.isArray(prompt));
                    assert.deepEqual(prompt.map(section => section.role), ["system", "user", "assistant", "user"]);
                    assert.equal(prompt[2].content, responses[0]);
                    assert.match(String(prompt[3].content), /JSON program object is invalid[\s\S]+not assignable/);
                }
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

describe("literal __proto__ property preservation in generated modules", () => {
    for (const value of ["kept", { label: "kept" }, null]) {
        it(`preserves an own __proto__ data property with value ${JSON.stringify(value)}`, async () => {
            const input = JSON.parse(`{"__proto__": ${JSON.stringify(value)}, "value": 7}`);
            const program: Program = { "@steps": [{ "@func": "identity", "@args": [input] }] };
            const moduleResult = createModuleTextFromProgram(program);
            assert.ok(moduleResult.success);
            assert.match(moduleResult.data, /\["__proto__"\]: /);
            assert.doesNotMatch(moduleResult.data, /(?<!\[)"__proto__": /);
            assert.match(moduleResult.data, /"value": 7/);

            const executableSource = stripTypeScriptTypes(moduleResult.data.replace(/^import[^\n]*\n/, ""));
            const generatedProgram = runInNewContext(`${executableSource}\nprogram`) as
                (api: { identity: (arg: unknown) => unknown }) => unknown;
            const generatedResult = generatedProgram({ identity: arg => arg });

            assert.ok(typeof generatedResult === "object" && generatedResult !== null);
            assert.ok(Object.prototype.hasOwnProperty.call(generatedResult, "__proto__"));
            assert.equal(JSON.stringify(generatedResult), JSON.stringify(input));

            const interpretedResult = await evaluateJsonProgram(program, async (_func, args) => args[0]);
            assert.ok(typeof interpretedResult === "object" && interpretedResult !== null);
            assert.ok(Object.prototype.hasOwnProperty.call(interpretedResult, "__proto__"));
            assert.equal(JSON.stringify(generatedResult), JSON.stringify(interpretedResult));
        });
    }
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
