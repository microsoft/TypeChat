/**
 * Tests for model.ts - verifies backward compatibility of Chat Completions API
 * and correct behavior of the new Responses API support.
 *
 * These tests use mocked fetch to avoid requiring real API keys.
 */

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";

// Load the compiled module from dist
import { createOpenAILanguageModel, createLanguageModel } from "../dist/index.js";

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

