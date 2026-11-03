import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
    createJsonTranslator, error, getData, success,
    Result, TypeChatJsonValidator, TypeChatLanguageModel, PromptSection
} from "../dist/index.js";
import { createModuleTextFromProgram, createTypeScriptJsonValidator } from "../dist/ts/index.js";
import { createZodJsonValidator } from "../dist/zod/index.js";

type Example = { value: number };
type IsUnknown<T> = unknown extends T ? keyof T extends never ? true : false : false;

class GetterFailure {
    get success(): false { return false; }
    get message() { return "custom"; }
    get data(): unknown { return null; }
    get responseText() { return ""; }
}

function exampleValidator(): TypeChatJsonValidator<Example> {
    return {
        getSchemaText: () => "export interface Example { value: number; }",
        getTypeName: () => "Example",
        validate: value => "value" in value && typeof value.value === "number" ?
            success({ value: value.value }) : error("value must be a number")
    };
}

function translatorFor(responses: Result<string>[], validator = exampleValidator()) {
    const prompts: (string | PromptSection[])[] = [];
    let index = 0;
    const model: TypeChatLanguageModel = {
        async complete(prompt) {
            prompts.push(typeof prompt === "string" ? prompt : [...prompt]);
            const response = responses[index++];
            if (!response) {
                throw new Error("Unexpected model call");
            }
            return response;
        }
    };
    return { translator: createJsonTranslator(model, validator), prompts };
}

describe("failure result contract", () => {
    it("preserves the shape of message-only failures", () => {
        assert.deepEqual(error("failed"), { success: false, message: "failed" });
    });

    for (const data of [null, false, 0, "", undefined]) {
        it(`retains an explicitly supplied ${String(data)} payload`, () => {
            const result = error("failed", { data });
            assert.ok("data" in result);
            assert.equal(result.data, data);
        });
    }

    it("keeps failure data unknown and getData throwing", () => {
        const result = error("invalid", { data: { value: "invalid" } });
        const isUnknown: IsUnknown<typeof result.data> = true;
        assert.equal(isUnknown, true);
        assert.throws(() => getData(result), /invalid/);
    });

    it("preserves typed successful results", () => {
        const result = success({ value: 42 });
        const value: number = result.data.value;
        assert.equal(value, 42);
        assert.deepEqual(getData(result), { value: 42 });
    });

    it("retains an empty response text", () => {
        assert.equal(error("failed", { responseText: "" }).responseText, "");
    });

    it("accepts failure details supplied through getters", () => {
        assert.deepEqual(error("failed", new GetterFailure()), {
            success: false, message: "failed", data: null, responseText: ""
        });
    });
});

describe("direct validator failure payloads", () => {
    it("retains the TypeScript validator's rejected object", () => {
        const validator = createTypeScriptJsonValidator<Example>(
            "export interface Example { value: number; }", "Example"
        );
        try {
            const input = { value: "invalid" };
            const result = validator.validate(input);
            assert.ok(!result.success);
            assert.equal(result.data, input);
            assert.ok(!("responseText" in result));
            assert.match(result.message, /not assignable/);
        }
        finally {
            validator.close();
        }
    });

    it("preserves module-conversion failure metadata", () => {
        const validator = createTypeScriptJsonValidator<Example>(
            "export interface Example { value: number; }", "Example"
        );
        const original = error("conversion failed", { data: null, responseText: "custom" });
        validator.createModuleTextFromJson = () => original;
        try {
            assert.deepEqual(validator.validate({ value: 1 }), original);
        }
        finally {
            validator.close();
        }
    });

    it("adds the input to message-only module-conversion failures", () => {
        const validator = createTypeScriptJsonValidator<Example>(
            "export interface Example { value: number; }", "Example"
        );
        validator.createModuleTextFromJson = () => error("conversion failed");
        try {
            const input = { value: 1 };
            const result = validator.validate(input);
            assert.ok(!result.success);
            assert.equal(result.data, input);
        }
        finally {
            validator.close();
        }
    });

    it("retains the Zod validator's rejected object", () => {
        const validator = createZodJsonValidator({ Example: z.object({ value: z.number() }) }, "Example");
        const input = { value: "invalid" };
        const result = validator.validate(input);
        assert.ok(!result.success);
        assert.equal(result.data, input);
    });

    for (const input of [
        { "@steps": "invalid" },
        { "@steps": [{ "@func": "valid", "@args": [{ "@ref": -1 }] }] }
    ]) {
        it("retains a rejected program during module conversion", () => {
            const result = createModuleTextFromProgram(input);
            assert.ok(!result.success);
            assert.equal(result.data, input);
        });
    }
});

describe("translation failure context", () => {
    it("preserves immediate successful results", async () => {
        const { translator, prompts } = translatorFor([success('{"value":42}')]);
        assert.deepEqual(await translator.translate("request"), success({ value: 42 }));
        assert.equal(prompts.length, 1);
    });

    it("returns rejected data and the original response without repair", async () => {
        const responseText = 'before {"value":"invalid"} after';
        const { translator, prompts } = translatorFor([success(responseText)]);
        translator.attemptRepair = false;
        const result = await translator.translate("request");
        assert.ok(!result.success);
        assert.deepEqual(result.data, { value: "invalid" });
        assert.equal(result.responseText, responseText);
        assert.equal(result.message, 'JSON validation failed: value must be a number\n{"value":"invalid"}');
        assert.equal(prompts.length, 1);
    });

    for (const data of [null, false, 0, "", undefined]) {
        it(`preserves a custom validator's ${String(data)} payload and metadata`, async () => {
            const original = { ...error("custom", { data, responseText: "" }), code: "CUSTOM" };
            const validator = { ...exampleValidator(), validate: () => original };
            const { translator } = translatorFor([success('{"value":1}')], validator);
            translator.attemptRepair = false;
            const result = await translator.translate("request");
            assert.deepEqual(result, { ...original, message: 'JSON validation failed: custom\n{"value":1}' });
            assert.equal(original.message, "custom");
        });
    }

    it("does not mutate message-only custom failures", async () => {
        const original = error("custom");
        const validator = { ...exampleValidator(), validate: () => original };
        const { translator } = translatorFor([success('{"value":1}')], validator);
        translator.attemptRepair = false;
        const result = await translator.translate("request");
        assert.ok(!result.success);
        assert.deepEqual(result.data, { value: 1 });
        assert.deepEqual(original, error("custom"));
    });

    it("preserves a custom validator's inherited failure fields", async () => {
        const validator = { ...exampleValidator(), validate: () => new GetterFailure() };
        const { translator } = translatorFor([success('{"value":1}')], validator);
        translator.attemptRepair = false;
        assert.deepEqual(await translator.translate("request"), {
            success: false, message: 'JSON validation failed: custom\n{"value":1}', data: null, responseText: ""
        });
    });

    it("retains the transformed instance rejected by additional validation", async () => {
        const validator = createZodJsonValidator({ Example: z.object({ value: z.coerce.number() }) }, "Example");
        const responseText = '{"value":"42"}';
        const { translator } = translatorFor([success(responseText)], validator);
        translator.attemptRepair = false;
        translator.validateInstance = () => error("instance rejected");
        const result = await translator.translate("request");
        assert.ok(!result.success);
        assert.deepEqual(result.data, { value: 42 });
        assert.equal(result.responseText, responseText);
    });

    it("distinguishes preprocessed data from the original response", async () => {
        const responseText = '{"value":"invalid","optional":null}';
        const { translator } = translatorFor([success(responseText)]);
        translator.attemptRepair = false;
        translator.stripNulls = true;
        const result = await translator.translate("request");
        assert.ok(!result.success);
        assert.deepEqual(result.data, { value: "invalid" });
        assert.equal(result.responseText, responseText);
    });

    for (const responseText of ["not JSON", 'before {"value":} after', ""]) {
        it("retains unparseable output without inventing data or changing repair behavior", async () => {
            const { translator, prompts } = translatorFor([success(responseText)]);
            const result = await translator.translate("request");
            assert.ok(!result.success);
            assert.ok(!("data" in result));
            assert.equal(result.responseText, responseText);
            assert.equal(prompts.length, 1);
        });
    }

    it("propagates an initial model failure unchanged", async () => {
        const original = error("network failure");
        const { translator } = translatorFor([original]);
        assert.equal(await translator.translate("request"), original);
    });

    it("does not convert validator exceptions to failures", async () => {
        const validator = {
            ...exampleValidator(),
            validate: (): Result<Example> => { throw new Error("validator bug"); }
        };
        const { translator } = translatorFor([success('{"value":1}')], validator);
        await assert.rejects(translator.translate("request"), /validator bug/);
    });
});

describe("repair failure context", () => {
    it("preserves a successful repair and the existing repair prompt", async () => {
        const first = '{"value":"invalid"}';
        const { translator, prompts } = translatorFor([success(first), success('{"value":42}')]);
        assert.deepEqual(await translator.translate("request"), success({ value: 42 }));
        assert.equal(prompts.length, 2);
        const repairPrompt = prompts[1];
        assert.ok(Array.isArray(repairPrompt));
        assert.equal(repairPrompt[1].content, first);
        assert.match(String(repairPrompt[2].content), /value must be a number/);
    });

    it("returns the latest rejected candidate after exactly one repair", async () => {
        const responseText = '{"value":"second"}';
        const { translator, prompts } = translatorFor([
            success('{"value":"first"}'), success(responseText)
        ]);
        const result = await translator.translate("request");
        assert.ok(!result.success);
        assert.deepEqual(result.data, { value: "second" });
        assert.equal(result.responseText, responseText);
        assert.equal(prompts.length, 2);
    });

    it("retains the previous candidate when the repair request fails", async () => {
        const responseText = '{"value":"invalid"}';
        const original = error("network failure");
        const { translator } = translatorFor([success(responseText), original]);
        const result = await translator.translate("request");
        assert.ok(!result.success);
        assert.equal(result.message, "network failure");
        assert.deepEqual(result.data, { value: "invalid" });
        assert.equal(result.responseText, responseText);
        assert.deepEqual(original, error("network failure"));
    });

    it("preserves context explicitly supplied by the model", async () => {
        const original = error("model failure", { data: null, responseText: "" });
        const { translator } = translatorFor([success('{"value":"invalid"}'), original]);
        assert.deepEqual(await translator.translate("request"), original);
    });

    it("preserves a model's inherited failure fields", async () => {
        const { translator } = translatorFor([success('{"value":"invalid"}'), new GetterFailure()]);
        assert.deepEqual(await translator.translate("request"), {
            success: false, message: "custom", data: null, responseText: ""
        });
    });

    it("does not leak failure context into another translation", async () => {
        const original = error("new request failed");
        const { translator } = translatorFor([
            success('{"value":"invalid"}'), error("repair failed"), original
        ]);
        await translator.translate("first");
        assert.equal(await translator.translate("second"), original);
    });

    for (const responseText of ["not JSON", '{"value":}']) {
        it("retains the previous candidate when the repair response cannot be parsed", async () => {
            const { translator, prompts } = translatorFor([
                success('{"value":"invalid"}'), success(responseText)
            ]);
            const result = await translator.translate("request");
            assert.ok(!result.success);
            assert.deepEqual(result.data, { value: "invalid" });
            assert.equal(result.responseText, responseText);
            assert.equal(prompts.length, 2);
        });
    }
});
