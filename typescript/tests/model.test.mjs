/**
 * Tests for model.ts - verifies backward compatibility of Chat Completions API
 * and correct behavior of the new Responses API support.
 *
 * These tests use mocked fetch to avoid requiring real API keys.
 */

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Load the compiled module from dist
import {
    createOpenAILanguageModel, createAzureOpenAILanguageModel, createLanguageModel,
    createOpenAILanguageModelFromClient
} from "../dist/index.js";

test("missing optional undici returns an actionable result for both API paths", async () => {
    const dir = mkdtempSync(join(tmpdir(), "typechat-no-undici-"));
    try {
        for (const name of ["model", "result"]) {
            cpSync(new URL(`../dist/${name}.js`, import.meta.url), join(dir, `${name}.js`));
        }
        const { createOpenAILanguageModel: isolatedModel } = createRequire(join(dir, "model.js"))("./model.js");
        for (const endpoint of ["https://api.openai.com/v1/chat/completions", "https://api.openai.com/v1/responses"]) {
            const model = isolatedModel("sk-test", "gpt-4", endpoint, "", { proxyUrl: "http://localhost:8080" });
            const result = await model.complete("test");
            assert.deepEqual(result, {
                success: false,
                message: 'REST API fetch error: A proxy was configured, but the optional "undici" package is not installed. Run "npm install undici" to enable proxy support.'
            });
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------------------
// Helpers: build mock Response objects
// ---------------------------------------------------------------------------

function makeChatCompletionsResponse(content) {
    return {
        ok: true,
        status: 200,
        headers: { get: (_name) => null },
        json: () =>
            Promise.resolve({
                id: "chatcmpl-123",
                object: "chat.completion",
                choices: [{ message: { role: "assistant", content } }],
            }),
    };
}

function makeJsonResponse(body) {
    return {
        ok: true,
        status: 200,
        headers: { get: (_name) => null },
        json: () => Promise.resolve(body),
    };
}

function makeResponsesAPIResponse(text) {
    return {
        ok: true,
        status: 200,
        headers: { get: (_name) => null },
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

function makeErrorResponse(status, statusText, retryAfterSec = null) {
    return {
        ok: false,
        status,
        statusText,
        headers: {
            get: (name) =>
                name.toLowerCase() === "retry-after" && retryAfterSec !== null
                    ? String(retryAfterSec)
                    : null,
        },
    };
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

describe("token-provider authentication", () => {
    after(teardownFetch);

    const factories = [
        ["Azure Chat", "chat", provider => createAzureOpenAILanguageModel(
            undefined, "https://example.test/chat/completions", { tokenProvider: provider })],
        ["OpenAI Chat", "chat", provider => createOpenAILanguageModel(
            undefined, "test-model", "https://example.test/chat/completions", "org-test", { tokenProvider: provider })],
        ["OpenAI Responses", "responses", provider => createOpenAILanguageModel(
            undefined, "test-model", "https://example.test/responses", "org-test", { tokenProvider: provider })]
    ];

    for (const [name, api, factory] of factories) {
        const reply = () => api === "responses" ? makeResponsesAPIResponse("reply") : makeChatCompletionsResponse("reply");

        test(`${name}: obtains a fresh synchronous token for each completion`, async () => {
            setupFetch([reply(), reply()]);
            let calls = 0;
            const model = factory(() => `token-${++calls}`);
            assert.deepEqual(await model.complete("first"), { success: true, data: "reply" });
            assert.deepEqual(await model.complete("second"), { success: true, data: "reply" });
            assert.equal(calls, 2);
            assert.deepEqual(capturedRequests.map(request => request.options.headers.Authorization), ["Bearer token-1", "Bearer token-2"]);
            assert.ok(capturedRequests.every(request => !("api-key" in request.options.headers)));
            if (name.startsWith("OpenAI")) {
                assert.equal(capturedRequests[0].options.headers["OpenAI-Organization"], "org-test");
            }
        });

        test(`${name}: pending credential promises keep the event loop responsive and delay fetch`, async () => {
            setupFetch([reply()]);
            let releaseToken;
            let invoked = false;
            const token = new Promise(resolve => { releaseToken = resolve; });
            const model = factory(() => {
                invoked = true;
                return token;
            });
            const completion = model.complete("request");
            let result;
            try {
                await new Promise(resolve => setImmediate(resolve));
                assert.equal(invoked, true);
                assert.equal(capturedRequests.length, 0);
            } finally {
                releaseToken("ready-token");
                result = await completion;
            }
            assert.deepEqual(result, { success: true, data: "reply" });
            assert.equal(capturedRequests.length, 1);
        });

        test(`${name}: awaits the provider again for each HTTP retry`, async () => {
            setupFetch([makeErrorResponse(429, "Too Many Requests"), makeErrorResponse(500, "Internal Server Error"), reply()]);
            let calls = 0;
            const model = factory(async () => {
                await Promise.resolve();
                return `token-${++calls}`;
            });
            model.retryMaxAttempts = 2;
            model.retryPauseMs = 0;
            assert.deepEqual(await model.complete("request"), { success: true, data: "reply" });
            assert.equal(calls, 3);
            assert.deepEqual(capturedRequests.map(request => request.options.headers.Authorization),
                ["Bearer token-1", "Bearer token-2", "Bearer token-3"]);
        });

        test(`${name}: acquisition errors use the existing retry/failure policy`, async () => {
            setupFetch([reply()]);
            let calls = 0;
            const model = factory(() => {
                if (++calls === 1) throw new Error("credential unavailable");
                return "fresh-token";
            });
            model.retryMaxAttempts = 1;
            model.retryPauseMs = 0;
            assert.deepEqual(await model.complete("request"), { success: true, data: "reply" });
            assert.equal(calls, 2);
            assert.equal(capturedRequests.length, 1);

            const failed = factory(async () => { throw new Error("credential unavailable"); });
            failed.retryMaxAttempts = 0;
            assert.deepEqual(await failed.complete("request"), {
                success: false, message: "REST API fetch error: credential unavailable"
            });
            assert.equal(capturedRequests.length, 1);
        });

        for (const token of [
            "", " ", undefined, null, 42, {}, "token value", " token",
            "token\r\nother", "token\u0100", "token\n", "token\r", "token\u0000", "token\u007f"
        ]) {
            test(`${name}: rejects invalid token ${JSON.stringify(token)} before fetch`, async () => {
                setupFetch([]);
                assert.deepEqual(await factory(() => token).complete("request"), {
                    success: false, message: "Token provider must return a nonempty, header-safe bearer-token string."
                });
                assert.equal(capturedRequests.length, 0);
            });
        }

        test(`${name}: does not silently retry unauthorized responses`, async () => {
            setupFetch([makeErrorResponse(401, "Unauthorized")]);
            let calls = 0;
            const model = factory(() => { calls++; return "token"; });
            assert.deepEqual(await model.complete("request"), { success: false, message: "REST API error 401: Unauthorized" });
            assert.equal(calls, 1);
        });
    }

    test("rejects ambiguous, missing, and non-callable authentication", () => {
        const factories = [
            (key, provider) => createAzureOpenAILanguageModel(key, "https://example.test", { tokenProvider: provider }),
            (key, provider) => createOpenAILanguageModel(key, "test", "https://example.test", "", { tokenProvider: provider })
        ];
        for (const factory of factories) {
            assert.throws(() => factory("key", () => "token"), /not both/);
            assert.throws(() => factory(undefined, undefined), /API key or a token provider/);
            assert.throws(() => factory(undefined, "not-a-function"), /must be a function/);
        }
    });

    test("retains proxy, timeout, and bounded-response controls", async () => {
        setupFetch([new Response(new Uint8Array(200))]);
        const model = createAzureOpenAILanguageModel(undefined, "https://example.test/chat/completions", {
            tokenProvider: () => "token",
            proxyUrl: "http://127.0.0.1:8080"
        });
        model.timeoutMs = 1234;
        model.maxResponseBytes = 32;
        try {
            const result = await model.complete("request");
            assert.equal(result.success, false);
            assert.match(result.message, /maximum allowed size of 32 bytes/);
            assert.ok(capturedRequests[0].options.signal instanceof AbortSignal);
            assert.ok(capturedRequests[0].options.dispatcher);
            assert.equal(capturedRequests[0].options.headers.Authorization, "Bearer token");
            assert.ok(!("api-key" in capturedRequests[0].options.headers));
        } finally {
            await capturedRequests[0]?.options.dispatcher?.close();
        }
    });

    test("keeps literal identity environment values on the legacy key path", async () => {
        setupFetch([makeChatCompletionsResponse("reply")]);
        const model = createLanguageModel({
            AZURE_OPENAI_API_KEY: "identity", AZURE_OPENAI_ENDPOINT: "https://example.test/chat/completions"
        });
        await model.complete("request");
        assert.equal(capturedRequests[0].options.headers["api-key"], "identity");
        assert.equal(capturedRequests[0].options.headers.Authorization, "Bearer identity");
    });

    test("preserves explicitly supplied empty-string API keys", async () => {
        setupFetch([makeChatCompletionsResponse("reply")]);
        await createAzureOpenAILanguageModel("", "https://example.test/chat/completions").complete("request");
        assert.equal(capturedRequests[0].options.headers["api-key"], "");
        assert.equal(capturedRequests[0].options.headers.Authorization, "Bearer ");
    });

    test("accepts printable ASCII bearer-token boundary characters", async () => {
        setupFetch([makeChatCompletionsResponse("reply")]);
        const model = createAzureOpenAILanguageModel(undefined, "https://example.test/chat/completions", {
            tokenProvider: () => "!~"
        });
        assert.deepEqual(await model.complete("request"), { success: true, data: "reply" });
        assert.equal(capturedRequests[0].options.headers.Authorization, "Bearer !~");
    });
});

function clientBody(api, text) {
    return api === "responses" ?
        { output: [{ type: "message", content: [{ type: "output_text", text }] }] } :
        { choices: [{ message: { content: text } }] };
}

function mockClient(api, responses) {
    const queue = [...responses];
    const calls = [];
    let closed = false;
    const resource = {
        async create(request) {
            assert.equal(this, resource, "client methods must retain their receiver");
            calls.push(structuredClone(request));
            assert.ok(queue.length, "unexpected client call");
            const response = queue.shift();
            if (response instanceof Error) throw response;
            return response;
        }
    };
    const client = Object.freeze({
        ...(api === "responses" ? { responses: resource } : { chat: { completions: resource } }),
        timeout: 1234,
        maxRetries: 0,
        close() { closed = true; }
    });
    return { client, calls, isClosed: () => closed };
}

describe("configured-client adapters", () => {
    for (const api of ["chat", "responses"]) {
        const options = { useResponsesApi: api === "responses" };

        test(`${api}: reuses the configured client without network-control or lifecycle changes`, async () => {
            const { client, calls, isClosed } = mockClient(api, [clientBody(api, "first"), clientBody(api, "second")]);
            const model = createOpenAILanguageModelFromClient(client, "deployment-name", options);
            assert.deepEqual(await model.complete("first prompt"), { success: true, data: "first" });
            assert.deepEqual(await model.complete("second prompt"), { success: true, data: "second" });
            assert.deepEqual(Object.keys(model), ["complete"]);
            assert.equal(client.timeout, 1234);
            assert.equal(client.maxRetries, 0);
            assert.equal(isClosed(), false);
            assert.deepEqual(calls, ["first prompt", "second prompt"].map(prompt => ({
                model: "deployment-name", temperature: 0, stream: false,
                ...(api === "responses" ? { input: prompt } : { messages: [{ role: "user", content: prompt }], n: 1 })
            })));
        });

        test(`${api}: maps mixed text and images without mutating prompts`, async () => {
            const { client, calls } = mockClient(api, [clientBody(api, "reply")]);
            const model = createOpenAILanguageModelFromClient(client, "test-model", options);
            const prompt = [
                { role: "system", content: [{ type: "text", text: "instructions" }] },
                { role: "user", content: [
                    "look", { type: "text", text: "describe" },
                    { type: "image_url", image_url: { url: "https://example.test/image.png", detail: "low" } },
                    { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }
                ] },
                { role: "assistant", content: "previous reply" }
            ];
            const original = structuredClone(prompt);
            assert.deepEqual(await model.complete(prompt), { success: true, data: "reply" });
            assert.deepEqual(prompt, original);
            const expected = api === "responses" ? [
                { role: "system", content: [{ type: "input_text", text: "instructions" }] },
                { role: "user", content: [
                    { type: "input_text", text: "look" }, { type: "input_text", text: "describe" },
                    { type: "input_image", image_url: "https://example.test/image.png", detail: "low" },
                    { type: "input_image", image_url: "data:image/png;base64,AAAA", detail: "auto" }
                ] },
                { role: "assistant", content: "previous reply" }
            ] : [
                original[0],
                { role: "user", content: [{ type: "text", text: "look" }, ...original[1].content.slice(1)] },
                original[2]
            ];
            assert.deepEqual(calls[0][api === "responses" ? "input" : "messages"], expected);
        });

        for (const content of [null, 42, undefined]) {
            test(`${api}: invalid output content ${content} is an explicit failure`, async () => {
                const { client } = mockClient(api, [clientBody(api, content)]);
                const model = createOpenAILanguageModelFromClient(client, "test", options);
                const result = await model.complete("request");
                assert.equal(result.success, false);
                assert.match(result.message, /unexpected response format/);
            });
        }

        test(`${api}: empty string output remains a successful completion`, async () => {
            const { client } = mockClient(api, [clientBody(api, "")]);
            const model = createOpenAILanguageModelFromClient(client, "test", options);
            assert.deepEqual(await model.complete("request"), { success: true, data: "" });
        });

        for (const thrown of [new Error("client failed"), new DOMException("cancelled", "AbortError")]) {
            test(`${api}: propagates ${thrown.name} without extra retries or closing the client`, async () => {
                const { client, calls, isClosed } = mockClient(api, [thrown, clientBody(api, "unused")]);
                const model = createOpenAILanguageModelFromClient(client, "test", options);
                await assert.rejects(model.complete("request"), error => error === thrown);
                assert.equal(calls.length, 1);
                assert.equal(isClosed(), false);
            });
        }

        test(`${api}: rejects unsupported/malformed input rather than dropping content`, async () => {
            const { client, calls } = mockClient(api, []);
            const model = createOpenAILanguageModelFromClient(client, "test", options);
            const prompts = [
                [{ role: "developer", content: "unsupported role" }],
                [{ role: "user", content: { type: "text", text: "not an array" } }],
                [{ role: "user", content: [{ type: "audio", data: "unsupported" }] }],
                [{ role: "user", content: [{ type: "text", text: 42 }] }],
                [{ role: "user", content: [{ type: "image_url", image_url: { url: "image", detail: "invalid" } }] }],
                [{ role: "assistant", content: [{ type: "image_url", image_url: { url: "image" } }] }]
            ];
            for (const prompt of prompts) {
                const result = await model.complete(prompt);
                assert.equal(result.success, false);
            }
            assert.equal(calls.length, 0);
        });
    }

    test("validates the requested client capability and model name", () => {
        const chat = mockClient("chat", []).client;
        const responses = mockClient("responses", []).client;
        assert.throws(() => createOpenAILanguageModelFromClient(chat, "test", { useResponsesApi: true }), /responses.create/);
        assert.throws(() => createOpenAILanguageModelFromClient(responses, "test"), /chat.completions.create/);
        assert.throws(() => createOpenAILanguageModelFromClient(chat, ""), /must not be empty/);
        assert.throws(() => createOpenAILanguageModelFromClient(chat, " "), /must not be empty/);
    });
});

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

    // Regression tests: a 200 OK response whose body does not conform to the
    // expected Chat Completions shape must return a recoverable error rather
    // than throwing a TypeError (which would reject the promise and can lead to
    // a Denial of Service in callers that expect a Result).
    test("returns error when choices array is missing", async () => {
        setupFetch([makeJsonResponse({ id: "chatcmpl-123" })]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("unexpected response format"));
    });

    test("returns error when choices array is empty", async () => {
        setupFetch([makeJsonResponse({ choices: [] })]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("unexpected response format"));
    });

    test("returns error when message is missing from choice", async () => {
        setupFetch([makeJsonResponse({ choices: [{}] })]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("unexpected response format"));
    });

    test("returns error when content is not a string", async () => {
        setupFetch([makeJsonResponse({ choices: [{ message: { role: "assistant", content: null } }] })]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("unexpected response format"));
    });

    test("returns error when response body is JSON null", async () => {
        setupFetch([makeJsonResponse(null)]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("unexpected response format"));
    });

    test("auto-detects Responses API from a /responses endpoint URL", async () => {
        setupFetch([makeResponsesAPIResponse("Auto-detected!")]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4", "https://api.openai.com/v1/responses");
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.equal(result.data, "Auto-detected!");
        const body = JSON.parse(capturedRequests[0].options.body);
        assert.ok("input" in body, "Expected input field (Responses API) from auto-detection");
        assert.ok(!("messages" in body), "Should NOT have messages field when auto-detected as Responses API");
    });

    test("uses Responses API when useResponsesApi=true regardless of URL", async () => {
        setupFetch([makeResponsesAPIResponse("Forced!")]);
        // Passing a chat/completions URL but forcing Responses API via the flag
        const model = createOpenAILanguageModel("sk-test", "gpt-4", "https://api.openai.com/v1/chat/completions", "", { useResponsesApi: true });
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.equal(result.data, "Forced!");
        const body = JSON.parse(capturedRequests[0].options.body);
        assert.ok("input" in body, "Expected input field when useResponsesApi=true");
    });

    test("respects retry-after header on 429", async () => {
        setupFetch([
            makeErrorResponse(429, "Too Many Requests", 0), // Retry-After: 0s (immediate)
            makeChatCompletionsResponse("OK after retry"),
        ]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        model.retryMaxAttempts = 3;
        model.retryPauseMs = 1000;
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.equal(result.data, "OK after retry");
        assert.equal(capturedRequests.length, 2, "Expected 2 requests: initial + 1 retry");
    });

    test("respects retry-after header on 503", async () => {
        setupFetch([
            makeErrorResponse(503, "Service Unavailable", 0), // Retry-After: 0s (immediate)
            makeChatCompletionsResponse("OK after 503 retry"),
        ]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        model.retryMaxAttempts = 3;
        model.retryPauseMs = 1000;
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.equal(result.data, "OK after 503 retry");
        assert.equal(capturedRequests.length, 2, "Expected 2 requests: initial + 1 retry");
    });

    test("uses the configured pause for a negative retry-after header", async () => {
        setupFetch([
            makeErrorResponse(429, "Too Many Requests", -1000),
            makeChatCompletionsResponse("OK after retry"),
        ]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        model.retryMaxAttempts = 3;
        model.retryPauseMs = 1000;
        const scheduledDelays = [];
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = (callback, delay, ...args) => {
            scheduledDelays.push(delay);
            queueMicrotask(() => callback(...args));
        };
        try {
            const result = await model.complete("test");
            assert.equal(result.success, true);
            assert.equal(result.data, "OK after retry");
            assert.deepEqual(scheduledDelays, [1000]);
        } finally {
            globalThis.setTimeout = originalSetTimeout;
        }
    });
});

// ---------------------------------------------------------------------------
// createAzureOpenAILanguageModel
// ---------------------------------------------------------------------------

describe("createAzureOpenAILanguageModel", () => {
    after(teardownFetch);

    test("sends both Authorization Bearer and api-key headers", async () => {
        setupFetch([makeChatCompletionsResponse("Hello from Azure!")]);
        const model = createAzureOpenAILanguageModel(
            "azure-test-key",
            "https://example.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2023-05-15"
        );
        const result = await model.complete("Say hello");
        assert.equal(result.success, true);
        assert.equal(result.data, "Hello from Azure!");
        const headers = capturedRequests[0].options.headers;
        assert.equal(headers["Authorization"], "Bearer azure-test-key");
        assert.equal(headers["api-key"], "azure-test-key");
    });
});

// ---------------------------------------------------------------------------
// Responses API via createOpenAILanguageModel
// ---------------------------------------------------------------------------

describe("createOpenAILanguageModel (Responses API path)", () => {
    after(teardownFetch);

    test("sends input field (not messages) in request body", async () => {
        setupFetch([makeResponsesAPIResponse("Hi!")]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4", "https://api.openai.com/v1/responses");
        await model.complete("Say hi");
        const body = JSON.parse(capturedRequests[0].options.body);
        assert.ok("input" in body, "Expected input field in request body");
        assert.ok(!("messages" in body), "Should NOT have messages field");
    });

    test("parses text from output[0].content[0].text", async () => {
        setupFetch([makeResponsesAPIResponse("The answer is 42.")]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4", "https://api.openai.com/v1/responses");
        const result = await model.complete("What is the answer?");
        assert.equal(result.success, true);
        assert.equal(result.data, "The answer is 42.");
    });

    test("returns error on unexpected response format", async () => {
        setupFetch([{
            ok: true,
            status: 200,
            headers: { get: (_name) => null },
            json: () => Promise.resolve({ output: [] }),
        }]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4", "https://api.openai.com/v1/responses");
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("unexpected response format"));
    });

    test("respects retry-after header on 429 for Responses API path", async () => {
        setupFetch([
            makeErrorResponse(429, "Too Many Requests", 0), // Retry-After: 0s (immediate)
            makeResponsesAPIResponse("OK after retry"),
        ]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4", "https://api.openai.com/v1/responses");
        model.retryMaxAttempts = 3;
        model.retryPauseMs = 1000;
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.equal(result.data, "OK after retry");
        assert.equal(capturedRequests.length, 2, "Expected 2 requests: initial + 1 retry");
    });

    test("respects retry-after header on 503 for Responses API path", async () => {
        setupFetch([
            makeErrorResponse(503, "Service Unavailable", 0), // Retry-After: 0s (immediate)
            makeResponsesAPIResponse("OK after 503 retry"),
        ]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4", "https://api.openai.com/v1/responses");
        model.retryMaxAttempts = 3;
        model.retryPauseMs = 1000;
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.equal(result.data, "OK after 503 retry");
        assert.equal(capturedRequests.length, 2, "Expected 2 requests: initial + 1 retry");
    });
});

// ---------------------------------------------------------------------------
// createLanguageModel env-var routing
// ---------------------------------------------------------------------------

describe("createLanguageModel environment variable routing", () => {
    after(teardownFetch);

    test("defaults to Chat Completions API", async () => {
        setupFetch([makeChatCompletionsResponse("OK")]);
        const model = createLanguageModel({
            OPENAI_API_KEY: "sk-test",
            OPENAI_MODEL: "gpt-4",
        });
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.ok(capturedRequests[0].url.includes("/chat/completions"));
    });

    test("uses Responses API when OPENAI_ENDPOINT points to a /responses URL", async () => {
        setupFetch([makeResponsesAPIResponse("OK")]);
        const model = createLanguageModel({
            OPENAI_API_KEY: "sk-test",
            OPENAI_MODEL: "gpt-4",
            OPENAI_ENDPOINT: "https://api.openai.com/v1/responses",
        });
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.ok(capturedRequests[0].url.includes("/responses"));
        const body = JSON.parse(capturedRequests[0].options.body);
        assert.ok("input" in body, "Expected Responses API request format");
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

    test("OPENAI_ENDPOINT pointing to custom /responses URL uses Responses API", async () => {
        setupFetch([makeResponsesAPIResponse("OK")]);
        const customUrl = "https://proxy.example.com/v1/responses";
        const model = createLanguageModel({
            OPENAI_API_KEY: "sk-test",
            OPENAI_MODEL: "gpt-4",
            OPENAI_ENDPOINT: customUrl,
        });
        await model.complete("test");
        assert.equal(capturedRequests[0].url, customUrl);
        const body = JSON.parse(capturedRequests[0].options.body);
        assert.ok("input" in body, "Expected Responses API request format");
    });

    test("throws when OPENAI_API_KEY and AZURE_OPENAI_API_KEY are both missing", () => {
        assert.throws(() => createLanguageModel({}), /Missing environment variable/);
    });
});

// ---------------------------------------------------------------------------
// Request timeout and response size limits (DoS hardening)
// ---------------------------------------------------------------------------

// Mirrors the error fetch throws when an AbortSignal.timeout() fires.
function makeTimeoutError() {
    return new DOMException("The operation timed out.", "TimeoutError");
}

// Builds a Response-like object whose body is a ReadableStream (as Node's fetch returns), so the
// size-limited streaming read path is exercised. json() throws to prove it is not used.
function makeStreamingResponse(payload, chunkSize = 16) {
    const bytes = new TextEncoder().encode(payload);
    return {
        ok: true,
        status: 200,
        headers: { get: (_name) => null },
        json: () => {
            throw new Error("json() should not be called when a stream body is present");
        },
        body: new ReadableStream({
            start(controller) {
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    controller.enqueue(bytes.subarray(i, i + chunkSize));
                }
                controller.close();
            },
        }),
    };
}

describe("request timeout and response size limits", () => {
    after(teardownFetch);

    test("attaches an AbortSignal to each request by default", async () => {
        setupFetch([makeChatCompletionsResponse("OK")]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        await model.complete("test");
        const signal = capturedRequests[0].options.signal;
        assert.ok(signal, "Expected an AbortSignal on the request options");
        assert.equal(typeof signal.aborted, "boolean", "Expected an AbortSignal-like object");
    });

    test("omits the AbortSignal when timeoutMs is set to 0", async () => {
        setupFetch([makeChatCompletionsResponse("OK")]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        model.timeoutMs = 0;
        await model.complete("test");
        assert.equal(capturedRequests[0].options.signal, undefined, "Expected no AbortSignal when the timeout is disabled");
    });

    test("returns an error when every attempt times out", async () => {
        let attempts = 0;
        globalThis.fetch = async () => {
            attempts++;
            throw makeTimeoutError();
        };
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        model.retryMaxAttempts = 2;
        model.retryPauseMs = 0;
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("fetch error"), `Unexpected message: ${result.message}`);
        assert.equal(attempts, 3, "Expected the initial attempt plus 2 retries");
    });

    test("retries after a transient fetch failure and then succeeds", async () => {
        let attempts = 0;
        globalThis.fetch = async () => {
            attempts++;
            if (attempts === 1) {
                throw makeTimeoutError();
            }
            return makeChatCompletionsResponse("Recovered");
        };
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        model.retryMaxAttempts = 3;
        model.retryPauseMs = 0;
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.equal(result.data, "Recovered");
        assert.equal(attempts, 2, "Expected one failure followed by one success");
    });

    test("rejects a response body that exceeds maxResponseBytes", async () => {
        const payload = JSON.stringify({
            choices: [{ message: { role: "assistant", content: "x".repeat(500) } }],
        });
        setupFetch([makeStreamingResponse(payload)]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        model.maxResponseBytes = 50;
        const result = await model.complete("test");
        assert.equal(result.success, false);
        assert.ok(result.message.includes("maximum allowed size"), `Unexpected message: ${result.message}`);
    });

    test("reads a streaming response body within maxResponseBytes", async () => {
        const payload = JSON.stringify({
            choices: [{ message: { role: "assistant", content: "Streamed!" } }],
        });
        setupFetch([makeStreamingResponse(payload)]);
        const model = createOpenAILanguageModel("sk-test", "gpt-4");
        const result = await model.complete("test");
        assert.equal(result.success, true);
        assert.equal(result.data, "Streamed!");
    });
});
