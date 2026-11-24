import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createLanguageModel } from "../dist/index.js";

describe("createLanguageModel live API integration", {
    skip: process.env.TYPECHAT_LIVE_TESTS === "1" ? false : "Set TYPECHAT_LIVE_TESTS=1 to enable live API requests.",
}, () => {
    test("calls the configured API when live tests are explicitly enabled", { timeout: 35_000 }, async () => {
        const model = createLanguageModel(process.env);
        model.timeoutMs = 30_000;
        model.retryMaxAttempts = 0;
        const result = await model.complete("Reply with the single word: pong");
        assert.equal(result.success, true, result.message);
        assert.equal(typeof result.data, "string");
        assert.notEqual(result.data.trim(), "");
    });
});
