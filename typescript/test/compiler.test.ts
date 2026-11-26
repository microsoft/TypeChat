import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { typeChatSchemaValidation } from "../dist/typechat.js";
import { createTypeScriptJsonValidatorWithCompiler } from "../dist/ts/validation.js";
import { createCompiler, schemaFileName, type CompilerProject } from "../dist/ts/compiler.js";
import { error, success } from "../dist/result.js";

describe("compiler-independent validator lifecycle", () => {
    it("closes a backend that fails during initialization", () => {
        const failure = new Error("synthetic compiler initialization failure");
        let closed = 0;
        assert.throws(() => createTypeScriptJsonValidatorWithCompiler("", "Probe", "Probe", () => ({
            getStringEnumTypeTexts() { throw failure; },
            validateSchema() { throw new Error("unexpected check"); },
            validateJson() { throw new Error("unexpected check"); },
            close() { closed++; }
        })), error => error === failure);
        assert.equal(closed, 1);
    });

    it("reports unavailable compiler projects and remains explicitly closed afterwards", () => {
        let closed = 0;
        const validator = createTypeScriptJsonValidatorWithCompiler("", "Probe", "Probe", () => createCompiler({
            writeFile() {},
            update: () => undefined,
            close() { closed++; }
        }));
        const preflight = validator[typeChatSchemaValidation]();
        assert.equal(preflight.success, false);
        if (!preflight.success) {
            assert.match(preflight.message, /couldn't be loaded/);
        }
        const value = { value: 1 };
        const result = validator.validate(value);
        assert.equal(result.success, false);
        if (!result.success) {
            assert.equal(result.data, value);
        }
        validator.close();
        validator.close();
        assert.equal(closed, 1);
        assert.throws(() => validator.validate(value), /closed/);
        assert.throws(() => validator[typeChatSchemaValidation](), /closed/);
    });

    for (const throws of [false, true]) {
        it(`restores the original schema after an enum query ${throws ? "throws" : "fails"}`, () => {
            const schema = 'export enum E { Value = "x" }';
            const failure = new Error("enum query failed");
            const written: string[] = [];
            let current = schema;
            const project: CompilerProject = {
                getSourceFile: () => undefined,
                getSyntacticDiagnostics: () => [],
                getSemanticDiagnostics: () => [],
                getAssignments: () => [],
                getEnumInfo: () => success({
                    identifiers: new Set(["__TypeChatEnumValues0"]),
                    probes: [{ symbolId: 1, end: schema.length, enumName: "E", properties: ["Value: unknown"] }]
                }),
                getEnumTypeTexts(aliases) {
                    assert.deepEqual([...aliases], ["__TypeChatEnumValues0_"]);
                    assert.match(current, /typeof E/);
                    if (throws) {
                        throw failure;
                    }
                    return error(failure.message);
                }
            };
            const compiler = createCompiler({
                update: () => project,
                writeFile(name, text) {
                    assert.equal(name, schemaFileName);
                    written.push(text);
                    current = text;
                },
                close() {}
            });
            if (throws) {
                assert.throws(() => compiler.getStringEnumTypeTexts(schema), value => value === failure);
            } else {
                assert.deepEqual(compiler.getStringEnumTypeTexts(schema), error(failure.message));
            }
            assert.equal(written.length, 2);
            assert.equal(current, schema);
        });
    }

    it("keeps an enum query error explicit without replacing original schema diagnostics", () => {
        let invalidSchema = false;
        const validator = createTypeScriptJsonValidatorWithCompiler("", "Probe", "Probe", () => ({
            getStringEnumTypeTexts: () => error("enum query failed"),
            validateSchema: () => invalidSchema ? error("original schema error") : success(undefined),
            validateJson: () => [],
            close() {}
        }));
        const value = { value: 1 };
        assert.deepEqual(validator.validate(value), error("enum query failed", { data: value }));
        invalidSchema = true;
        assert.deepEqual(validator[typeChatSchemaValidation](), error("original schema error"));
        validator.close();
    });
});
