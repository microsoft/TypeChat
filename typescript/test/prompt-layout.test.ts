import assert from "node:assert/strict";
import { test } from "node:test";
import { createJsonTranslator, error, success, type PromptSection, type TypeChatJsonValidator, type TypeChatLanguageModel } from "../dist/index.js";

const schema = "export type Reply = { value: number };";
const validator: TypeChatJsonValidator<{ value: number }> = {
    getSchemaText: () => schema,
    getTypeName: () => "Reply",
    validate: obj => "value" in obj && typeof obj.value === "number" ? success({ value: obj.value }) : error("expected a number")
};
const request = '  CURRENT_MARKER\n""" \r\n☕  ';

function recorder() {
    const calls: PromptSection[][] = [];
    const model: TypeChatLanguageModel = {
        async complete(prompt) {
            assert.ok(Array.isArray(prompt));
            calls.push(structuredClone(prompt));
            return success('{"value":1}');
        }
    };
    return { model, calls };
}

test("fresh: system schema, then one verbatim user request", async () => {
    const { model, calls } = recorder();
    const translator = createJsonTranslator(model, validator);
    assert.deepEqual(await translator.translate(request), success({ value: 1 }));
    assert.equal(calls.length, 1);
    const [system] = calls[0];
    assert.equal(typeof system.content, "string");
    assert.ok(system.content.includes(schema));
    assert.match(String(system.content), /type "Reply"/);
    assert.match(String(system.content), /Return only the JSON object/);
    assert.doesNotMatch(String(system.content), /CURRENT_MARKER/);
    assert.deepEqual(calls[0], [{ role: "system", content: system.content }, { role: "user", content: request }]);
});

test("history: caller sections keep their roles and stay out of the generated system message", async () => {
    const { model, calls } = recorder();
    const translator = createJsonTranslator(model, validator);
    const history: PromptSection[] = [
        { role: "user", content: ["PAST_USER", { type: "text", text: "CAPTION" },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA", detail: "low" } }] },
        { role: "assistant", content: 'PAST_ANSWER\n{"value":1}' },
        { role: "system", content: "CALLER_SYSTEM" }
    ];
    const original = structuredClone(history);
    assert.ok((await translator.translate(request, history)).success);
    assert.ok((await translator.translate("fresh again")).success);
    const [system] = calls[1];
    assert.equal(system.role, "system");
    assert.doesNotMatch(String(system.content), /PAST_|CAPTION|base64|CALLER_SYSTEM|CURRENT_MARKER|fresh again/);
    assert.deepEqual(calls, [
        [system, ...original, { role: "user", content: request }],
        [system, { role: "user", content: "fresh again" }]
    ]);
    assert.deepEqual(history, original);
});

test("custom system builder receives no request or history; a string preamble stays user", async () => {
    const { model, calls } = recorder();
    const translator = createJsonTranslator(model, validator);
    const base = translator.createSystemPrompt;
    const instructions = `${base()}\nUse the application vocabulary.`;
    translator.createSystemPrompt = (...args) => {
        assert.deepEqual(args, []);
        return instructions;
    };
    assert.ok((await translator.translate(request, "caller context")).success);
    assert.deepEqual(calls, [[
        { role: "system", content: instructions }, { role: "user", content: "caller context" }, { role: "user", content: request }
    ]]);
});

test("legacy: explicit 0.2 request layout", async () => {
    const { model, calls } = recorder();
    const translator = createJsonTranslator(model, validator, { promptLayout: "legacy" });
    const history: PromptSection[] = [{ role: "assistant", content: "previous reply" }];
    assert.ok((await translator.translate(request, history)).success);
    assert.deepEqual(calls, [[...history, { role: "user", content:
        `You are a service that translates user requests into JSON objects of type "Reply" according to the following TypeScript definitions:\n` +
        `\`\`\`\n${schema}\`\`\`\nThe following is a user request:\n"""\n${request}\n"""\n` +
        `The following is the user request translated into a JSON object with 2 spaces of indentation and no properties with the value undefined:\n`
    }]]);
});

test("legacy: custom request content stays in the user role", async () => {
    const { model, calls } = recorder();
    const translator = createJsonTranslator(model, validator, { promptLayout: "legacy" });
    translator.createRequestPrompt = text => [
        { type: "image_url", image_url: { url: "https://example.test/puzzle.png", detail: "high" } }, `wrapped:${text}`
    ];
    assert.ok((await translator.translate(request, "before")).success);
    assert.deepEqual(calls, [[{ role: "user", content: "before" }, { role: "user", content: [
        { type: "image_url", image_url: { url: "https://example.test/puzzle.png", detail: "high" } }, `wrapped:${request}`
    ] }]]);
});

test("unmigrated request hook fails before dispatch, without fallback", async () => {
    const { model, calls } = recorder();
    const translator = createJsonTranslator(model, validator);
    translator.createRequestPrompt = () => assert.fail("must not invoke or promote a request-bearing hook");
    const result = await translator.translate(request);
    assert.ok(!result.success);
    assert.match(result.message, /createRequestPrompt.*promptLayout: "legacy".*createSystemPrompt/);
    assert.deepEqual(calls, []);
});

test("a model rejecting roles is not retried with flattened history or implicit legacy", async () => {
    const calls: PromptSection[][] = [];
    const unsupported = error("This model supports a single user message only.");
    const model: TypeChatLanguageModel = {
        async complete(prompt) {
            assert.ok(Array.isArray(prompt));
            calls.push(structuredClone(prompt));
            return prompt.length === 1 && prompt[0].role === "user" ? success('{"value":1}') : unsupported;
        }
    };
    assert.deepEqual(await createJsonTranslator(model, validator).translate(request, "PAST"), unsupported);
    assert.deepEqual(calls.map(call => call.map(section => section.role)), [["system", "user", "user"]]);
    const legacy = createJsonTranslator(model, validator, { promptLayout: "legacy" });
    assert.ok((await legacy.translate(request)).success);
    assert.deepEqual(await legacy.translate(request, "PAST"), unsupported);
});
