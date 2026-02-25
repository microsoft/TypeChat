/**
 * Tests for model.ts - verifies backward compatibility of Chat Completions API
 * and correct behavior of the new Responses API support.
 *
 * These tests use mocked fetch to avoid requiring real API keys.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

// Load the compiled module from dist
import { createOpenAILanguageModel, createOpenAIResponsesLanguageModel, createLanguageModel } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers: build mock Response objects
// ---------------------------------------------------------------------------

function makeChatCompletionsResponse(content) {
    return {
        ok: true,
        status: 200,
        json: () =>
            Promise.resolve({
                id: "chatcmpl-123",
                object: "chat.completion",
                choices: [{ message: { role: "assistant", content } }],
            }),
    };
}

function makeResponsesAPIResponse(text) {
    return {
        ok: true,
        status: 200,
        json: () =>
            Promise.resolve({
                id: "resp-123",
                object: "response",
                output: [
                    {
                        type: "message",
                        role: "assistant",
                        content: [{ type: "output_text", text }],
                    },
                ],
            }),
    };
}

function makeErrorResponse(status, statusText) {
    return { ok: false, status, statusText };
}

// ---------------------------------------------------------------------------
// Mock fetch utility
// ---------------------------------------------------------------------------

let capturedRequests = [];
let mockResponses = [];

function setupFetch(responses) {
    capturedRequests = [];
    mockResponses = [...responses];
    globalThis.fetch = async (url, options) => {
        capturedRequests.push({ url, options });
        const resp = mockResponses.shift();
        if (!resp) throw new Error("No mock response configured");
        return resp;
    };
}

function teardownFetch() {
    delete globalThis.fetch;
    capturedRequests = [];
    mockResponses = [];
}

// ---------------------------------------------------------------------------
// Chat Completions API (backward compatibility)
// ---------------------------------------------------------------------------

describe("createOpenAILanguageModel (Chat Completions API)", () => {
    after(teardownFetch);

    test("uses /chat/completions endpoint by default", async () => {
        setupFetch([makeChatCompletionsResponse("Hello!")]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        const result = await model.complete("Say hello");
        assert.equal(result.success, true);
        assert.equal(result.data, "Hello!");
        assert.ok(
            capturedRequests[0].url.includes("/chat/completions"),
            "Expected /chat/completions URL"
        );
    });

    test("sends messages field in request body", async () => {
        setupFetch([makeChatCompletionsResponse("Hi!")]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        await model.complete("Say hi");
        const body = JSON.parse(capturedRequests[0].options.body);
        assert.ok(Array.isArray(body.messages), "Expected messages array");
        assert.equal(body.messages[0].content, "Say hi");
        assert.equal(body.messages[0].role, "user");
    });

    test("parses string content from choices[0].message.content", async () => {
        setupFetch([makeChatCompletionsResponse("The answer is 42.")]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        const result = await model.complete("What is the answer?");
        assert.equal(result.success, true);
        assert.equal(result.data, "The answer is 42.");
    });

    test("accepts PromptSection array as input", async () => {
        setupFetch([makeChatCompletionsResponse("OK")]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        const prompt = [
            { role: "system", content: "You are helpful." },
            { role: "user", content: "Hello" },
        ];
        const result = await model.complete(prompt);
        assert.equal(result.success, true);
        const body = JSON.parse(capturedRequests[0].options.body);
        assert.equal(body.messages.length, 2);
    });

    test("returns error on non-transient HTTP error", async () => {
        setupFetch([makeErrorResponse(401, "Unauthorized")]);
        const model = createOpenAILanguageModel("invalid-key", "gpt-4");
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("401"));
    });
});

// ---------------------------------------------------------------------------
// Responses API
// ---------------------------------------------------------------------------

describe("createOpenAIResponsesLanguageModel (Responses API)", () => {
    after(teardownFetch);

    test("uses /responses endpoint by default", async () => {
        setupFetch([makeResponsesAPIResponse("Hello!")]);
        const model = createOpenAIResponsesLanguageModel("sk-test", "gpt-4");
        const result = await model.complete("Say hello");
        assert.equal(result.success, true);
        assert.equal(result.data, "Hello!");
        assert.ok(
            capturedRequests[0].url.includes("/responses"),
            "Expected /responses URL"
        );
    });

    test("sends input field (not messages) in request body", async () => {
        setupFetch([makeResponsesAPIResponse("Hi!")]);
        const model = createOpenAIResponsesLanguageModel("sk-test", "gpt-4");
        await model.complete("Say hi");
        const body = JSON.parse(capturedRequests[0].options.body);
        assert.ok("input" in body, "Expected input field in request body");
        assert.ok(!("messages" in body), "Should NOT have messages field");
    });

    test("parses text from output[0].content[0].text", async () => {
        setupFetch([makeResponsesAPIResponse("The answer is 42.")]);
        const model = createOpenAIResponsesLanguageModel("sk-test", "gpt-4");
        const result = await model.complete("What is the answer?");
        assert.equal(result.success, true);
        assert.equal(result.data, "The answer is 42.");
    });

    test("accepts custom endpoint URL", async () => {
        setupFetch([makeResponsesAPIResponse("Custom OK")]);
        const customUrl = "https://custom.endpoint.com/v1/responses";
        const model = createOpenAIResponsesLanguageModel("sk-test", "gpt-4", customUrl);
        await model.complete("test");
        assert.equal(capturedRequests[0].url, customUrl);
    });

    test("returns error on non-transient HTTP error", async () => {
        setupFetch([makeErrorResponse(401, "Unauthorized")]);
        const model = createOpenAIResponsesLanguageModel("invalid-key", "gpt-4");
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("401"));
    });

    test("returns error on unexpected response format", async () => {
        setupFetch([{
            ok: true,
            status: 200,
            json: () => Promise.resolve({ output: [] }),
        }]);
        const model = createOpenAIResponsesLanguageModel("sk-test", "gpt-4");
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("unexpected response format"));
    });
});

// ---------------------------------------------------------------------------
// createLanguageModel env-var routing
// ---------------------------------------------------------------------------

describe("createLanguageModel environment variable routing", () => {
    after(teardownFetch);

    test("defaults to Chat Completions API when OPENAI_USE_RESPONSES_API is not set", async () => {
        setupFetch([makeChatCompletionsResponse("OK")]);
        const model = createLanguageModel({
            OPENAI_API_KEY: "sk-test",
            OPENAI_MODEL: "gpt-4",
        });
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.ok(capturedRequests[0].url.includes("/chat/completions"));
    });

    test("uses Responses API when OPENAI_USE_RESPONSES_API=true", async () => {
        setupFetch([makeResponsesAPIResponse("OK")]);
        const model = createLanguageModel({
            OPENAI_API_KEY: "sk-test",
            OPENAI_MODEL: "gpt-4",
            OPENAI_USE_RESPONSES_API: "true",
        });
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.ok(capturedRequests[0].url.includes("/responses"));
    });

    test("OPENAI_ENDPOINT overrides default endpoint (Chat Completions path)", async () => {
        setupFetch([makeChatCompletionsResponse("OK")]);
        const customUrl = "https://proxy.example.com/v1/chat/completions";
        const model = createLanguageModel({
            OPENAI_API_KEY: "sk-test",
            OPENAI_MODEL: "gpt-4",
            OPENAI_ENDPOINT: customUrl,
        });
        await model.complete("test");
        assert.equal(capturedRequests[0].url, customUrl);
    });

    test("OPENAI_ENDPOINT overrides default when Responses API is selected", async () => {
        setupFetch([makeResponsesAPIResponse("OK")]);
        const customUrl = "https://proxy.example.com/v1/responses";
        const model = createLanguageModel({
            OPENAI_API_KEY: "sk-test",
            OPENAI_MODEL: "gpt-4",
            OPENAI_USE_RESPONSES_API: "true",
            OPENAI_ENDPOINT: customUrl,
        });
        await model.complete("test");
        assert.equal(capturedRequests[0].url, customUrl);
    });

    test("throws when OPENAI_API_KEY and AZURE_OPENAI_API_KEY are both missing", () => {
        assert.throws(() => createLanguageModel({}), /Missing environment variable/);
    });
});
