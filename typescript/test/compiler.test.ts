import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { typeChatSchemaValidation } from "../dist/typechat.js";
import { createTypeScriptJsonValidatorWithCompiler } from "../dist/ts/validation.js";
import { createCompiler } from "../dist/ts/compiler.js";

describe("compiler-independent validator lifecycle", () => {
    it("closes a backend that fails during initialization", () => {
        const failure = new Error("synthetic compiler initialization failure");
        let closed = 0;
        assert.throws(() => createTypeScriptJsonValidatorWithCompiler("", "Probe", "Probe", () => ({
            getStringEnumValues() { throw failure; },
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
});
