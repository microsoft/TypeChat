import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createOpenAILanguageModel, createAzureOpenAILanguageModel, createJsonTranslator,
    success, error, getData, withResponseMetadata,
    Result, TypeChatLanguageModel, TypeChatJsonValidator, TypeChatResponseMetadata, PromptSection
} from "../dist/index.js";
import { createTypeScriptJsonValidator } from "../dist/ts/index.js";

type Payload = { value: number };
const valid = '{"value":42}';
const invalid = '{"value":"bad"}';
const first = { inputTokens: 13, outputTokens: 7, totalTokens: 20 };
const second = { inputTokens: 5, outputTokens: 3, totalTokens: 8 };
const validator: TypeChatJsonValidator<Payload> = {
    getSchemaText: () => "export interface Payload { value: number; }",
    getTypeName: () => "Payload",
    validate: value => "value" in value && typeof value.value === "number" ?
        success({ value: value.value }) : error("bad value")
};
const tagged = (result: Result<string>, metadata: TypeChatResponseMetadata) => withResponseMetadata(result, [metadata]);

function translatorFor(results: Result<string>[], schema = validator) {
    let calls = 0;
    const prompts: (string | PromptSection[])[] = [];
    // The pre-metadata custom-model signature remains assignable.
    const model: TypeChatLanguageModel = {
        async complete(prompt): Promise<Result<string>> {
            prompts.push(typeof prompt === "string" ? prompt : [...prompt]);
            const result = results[calls++];
            assert.ok(result, "unexpected model call");
            return result;
        }
    };
    return { translator: createJsonTranslator(model, schema), calls: () => calls, prompts };
}

for (const api of ["chat", "responses", "azure"] as const) {
    const factory = () => api === "azure" ? createAzureOpenAILanguageModel("test", "https://example.test/chat/completions") :
        createOpenAILanguageModel("test", "test", `https://example.test/${api === "responses" ? "responses" : "chat/completions"}`);
    const body = (text: unknown, usage?: unknown) => ({
        id: "raw-body-not-metadata", usage,
        ...(api === "responses" ? { output: [{ type: "message", content: [{ type: "output_text", text }] }] } :
            { choices: [{ message: { content: text } }] })
    });
    const wireUsage = (input: number, output: number, total: number) => api === "responses" ?
        { input_tokens: input, output_tokens: output, total_tokens: total } :
        { prompt_tokens: input, completion_tokens: output, total_tokens: total };

    test(`${api}: reported counts, zeros, absent and partial metadata`, async t => {
        for (const [usage, expected] of [
            [wireUsage(13, 7, 20), first], [wireUsage(0, 0, 0), { inputTokens: 0, outputTokens: 0, totalTokens: 0 }],
            [api === "responses" ? { input_tokens: 0 } : { prompt_tokens: 0 }, { inputTokens: 0 }],
            [undefined, undefined], [{}, undefined], [null, undefined]
        ] as const) {
            const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(body(valid, usage)));
            const result = await factory().complete("request");
            assert.ok(result.success);
            const text: string = result.data;
            assert.equal(text, valid);
            assert.deepEqual(result.metadata?.usage, expected);
            if (expected) {
                assert.equal(result.metadata?.responses[0].filtering, undefined);
                assert.deepEqual(result.metadata?.responses, [{ usage: expected }]);
                assert.ok(!JSON.stringify(result.metadata).includes("raw-body-not-metadata"));
            } else assert.ok(!("metadata" in result));
            assert.equal(fetch.mock.callCount(), 1);
            fetch.mock.restore();
        }
    });

    test(`${api}: filtering and refusal failures retain usage`, async t => {
        const json = body(valid, wireUsage(13, 7, 20));
        const filtered = api === "responses" ? {
            ...json, incomplete_details: { reason: "content_filter" },
            output: [{ type: "message", content: [{ type: "refusal", refusal: "declined" }] }]
        } : { ...json, choices: [{ finish_reason: "content_filter", message: { content: valid, refusal: "declined" } }] };
        const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(filtered));
        const translator = createJsonTranslator(factory(), validator);
        const result = await translator.translate("request");
        assert.ok(!result.success);
        assert.match(result.message, /unexpected response format/);
        assert.deepEqual(result.metadata?.usage, first);
        assert.deepEqual(result.metadata?.responses[0].filtering, { reason: "content_filter", blocked: true, refusals: ["declined"] });
        assert.equal(result.responseText, api === "responses" ? undefined : valid);
        assert.throws(() => getData(result), /unexpected response format/);
        assert.equal(fetch.mock.callCount(), 1);
    });

    test(`${api}: malformed successful response retains metadata`, async t => {
        t.mock.method(globalThis, "fetch", async () => Response.json({ usage: wireUsage(13, 7, 20) }));
        const result = await factory().complete("request");
        assert.ok(!result.success);
        assert.deepEqual(result.metadata?.usage, first);
    });
}

test("Azure filtering details and HTTP content-filter errors are bounded metadata", async t => {
    const input = [{ prompt_index: 0, content_filter_results: { hate: { filtered: false, severity: "safe" } } }];
    const output = { violence: { filtered: false, severity: "safe" } };
    const payloads = [
        { prompt_filter_results: input, choices: [{ message: { content: valid }, content_filter_results: output }] },
        { choices: [{ message: { content: valid }, content_filter_results: { hate: { filtered: true } } }] },
        { choices: [{ message: { content: valid }, content_filter_results: { custom_blocklists: [{ filtered: true }] } }] },
        { error: { code: "content_filter", message: "private error text", innererror: { content_filter_result: output } } }
    ];
    t.mock.method(globalThis, "fetch", async () => Response.json(payloads.shift(), { status: payloads.length ? 200 : 400, statusText: "Bad Request" }));
    const model = createAzureOpenAILanguageModel("test", "https://example.test/chat/completions");
    const ok = await model.complete("request");
    assert.ok(ok.success);
    assert.deepEqual(ok.metadata?.responses, [{ filtering: { input, output } }]);
    assert.equal(ok.metadata?.usage, undefined);
    for (let index = 0; index < 2; index++) {
        const blocked = await model.complete("request");
        assert.ok(!blocked.success);
        assert.equal(blocked.metadata?.responses[0].filtering?.blocked, true);
        assert.equal(blocked.responseText, valid);
    }
    const failed = await model.complete("request");
    assert.ok(!failed.success);
    assert.equal(failed.message, "REST API error 400: Bad Request");
    assert.deepEqual(failed.metadata?.responses, [{ filtering: { input: output, reason: "content_filter", blocked: true } }]);
    assert.ok(!JSON.stringify(failed.metadata).includes("private error text"));
});

test("repair totals count each ordered response once and stay outside validated data", async () => {
    const { translator, calls, prompts } = translatorFor([tagged(success(invalid), { usage: first }), tagged(success(valid), { usage: second })]);
    const result = await translator.translate("request");
    assert.ok(result.success);
    const data: Payload = getData(result);
    assert.deepEqual(data, { value: 42 });
    assert.deepEqual(result.metadata, {
        responses: [{ usage: first }, { usage: second }],
        usage: { inputTokens: 18, outputTokens: 10, totalTokens: 28 },
        usageReporting: { inputTokens: "complete", outputTokens: "complete", totalTokens: "complete" }
    });
    assert.equal(calls(), 2);
    assert.ok(!JSON.stringify(prompts).includes("inputTokens"));
    assert.ok(!translator.validator.getSchemaText().includes("metadata"));
});

test("partial reporting distinguishes missing counts, zero, and missing metadata", async () => {
    for (const tail of [{ usage: { inputTokens: 0 } }, {}, { filtering: { input: [] } }]) {
        const { translator } = translatorFor([
            tagged(success(invalid), { usage: { inputTokens: 13, outputTokens: 7 } }), tagged(success(valid), tail)
        ]);
        const result = await translator.translate("request");
        assert.deepEqual(result.metadata?.usage, { inputTokens: 13, outputTokens: 7 });
        assert.deepEqual(result.metadata?.usageReporting, { inputTokens: "usage" in tail ? "complete" : "partial", outputTokens: "partial" });
        assert.deepEqual(result.metadata?.responses[1], tail);
        assert.ok(!("totalTokens" in (result.metadata?.usage ?? {})));
    }
});

test("parse, schema and custom failures preserve messages, rejected data and responseText", async () => {
    const schema = createTypeScriptJsonValidator<Payload>(validator.getSchemaText(), "Payload");
    try {
        for (const text of ["not JSON", '{"value":}', invalid, valid]) {
            const plain = translatorFor([success(text)], schema).translator;
            const { translator, calls } = translatorFor([tagged(success(text), { usage: first })], schema);
            plain.attemptRepair = translator.attemptRepair = false;
            if (text === valid) {
                plain.validateInstance = translator.validateInstance = () => error("custom", { data: null, responseText: "" });
            }
            const expected = await plain.translate("request");
            const { metadata, ...actual } = await translator.translate("request");
            assert.ok(!actual.success);
            assert.deepEqual(actual, expected);
            assert.deepEqual(metadata?.usage, first);
            assert.equal(calls(), 1);
            assert.throws(() => getData(actual));
            if (text === valid) {
                assert.equal(actual.data, null);
                assert.equal(actual.responseText, "");
            }
        }
    } finally { schema.close(); }
});

test("HTTP retries retain reported metadata, including a later transport failure", async t => {
    for (const fail of [false, true]) {
        let calls = 0;
        const fetch = t.mock.method(globalThis, "fetch", async () => {
            if (calls++ === 0) return Response.json({ usage: { prompt_tokens: 13 } }, { status: 503 });
            if (fail) throw new Error("offline transport failure");
            return Response.json({ choices: [{ message: { content: valid } }], usage: { prompt_tokens: 5 } });
        });
        const model = createOpenAILanguageModel("test", "test");
        model.retryMaxAttempts = 1;
        model.retryPauseMs = 0;
        const result = await model.complete("request");
        assert.equal(result.success, !fail);
        assert.deepEqual(result.metadata?.usage, { inputTokens: fail ? 13 : 18 });
        assert.equal(result.metadata?.responses.length, fail ? 1 : 2);
        assert.equal(calls, 2);
        fetch.mock.restore();
    }
});

test("unreadable error metadata preserves HTTP messages and retry limits", async t => {
    for (const status of [400, 503]) {
        let calls = 0;
        const fetch = t.mock.method(globalThis, "fetch", async () => ++calls === 1 ?
            new Response("not JSON", { status, statusText: "Rejected", headers: { "content-type": "application/json" } }) :
            Response.json({ choices: [{ message: { content: valid } }], usage: { prompt_tokens: 0 } }));
        const model = createOpenAILanguageModel("test", "test");
        model.retryMaxAttempts = 1;
        model.retryPauseMs = 0;
        const result = await model.complete("request");
        assert.equal(result.success, status === 503);
        if (!result.success) assert.equal(result.message, "REST API error 400: Rejected");
        assert.deepEqual(result.metadata?.responses[0], { error: "SyntaxError" });
        assert.deepEqual(result.metadata?.usage, status === 503 ? { inputTokens: 0 } : undefined);
        assert.equal(result.metadata?.usageReporting?.inputTokens, status === 503 ? "partial" : undefined);
        assert.equal(calls, status === 503 ? 2 : 1);
        fetch.mock.restore();
    }
});

test("initial and repair failures retain all metadata without extending repair limits", async () => {
    const initial = tagged(error("initial failed"), { usage: first });
    assert.deepEqual(await translatorFor([initial]).translator.translate("request"), initial);
    for (const tail of [tagged(error("repair failed"), { usage: second }), error("repair failed"),
        tagged(success("not JSON"), { usage: second }), tagged(success('{"value":}'), { usage: second }), tagged(success(invalid), { usage: second })]) {
        const { translator, calls } = translatorFor([tagged(success(invalid), { usage: first }), tail]);
        const result = await translator.translate("request");
        assert.ok(!result.success);
        assert.deepEqual(result.data, { value: "bad" });
        assert.equal(result.responseText, tail.success ? tail.data : invalid);
        assert.equal(result.metadata?.responses.length, 2);
        assert.deepEqual(result.metadata?.usage, tail.metadata ? { inputTokens: 18, outputTokens: 10, totalTokens: 28 } : first);
        assert.equal(result.metadata?.usageReporting?.inputTokens, tail.metadata ? "complete" : "partial");
        assert.equal(calls(), 2);
    }
});

test("translations are isolated and metadata-free custom models retain their old shape", async () => {
    const { translator } = translatorFor([tagged(success(valid), { usage: first }), tagged(success(valid), { usage: second }), success(valid)]);
    const [a, b] = await Promise.all([translator.translate("a"), translator.translate("b")]);
    assert.deepEqual(a.metadata?.usage, first);
    assert.deepEqual(b.metadata?.usage, second);
    assert.notEqual(a.metadata?.responses, b.metadata?.responses);
    assert.deepEqual(await translator.translate("c"), success({ value: 42 }));
});

test("metadata preserves inherited envelope fields and leaves the original unchanged", () => {
    const original = new class {
        get success(): false { return false; }
        get message() { return "custom"; }
        get data(): unknown { return undefined; }
        get responseText() { return ""; }
    };
    const { metadata, ...result } = withResponseMetadata<string>(original, [{ usage: first }]);
    assert.deepEqual(result, { success: false, message: "custom", data: undefined, responseText: "" });
    assert.deepEqual(metadata?.usage, first);
    assert.ok(!("metadata" in original));
    assert.deepEqual(error("custom", { metadata }), { success: false, message: "custom", metadata });
});
