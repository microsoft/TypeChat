import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const liveTestFile = fileURLToPath(new URL("./model-live.test.mjs", import.meta.url));
const prompt = "Reply with the single word: pong";
const chatResponse = { choices: [{ message: { role: "assistant", content: "pong" } }] };

function liveOpenAIEnv(url) {
    return {
        TYPECHAT_LIVE_TESTS: "1",
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "test-model",
        OPENAI_ENDPOINT: `${url}/v1/chat/completions`,
    };
}

async function runLiveTests(variables, ...otherFiles) {
    const env = { ...process.env };
    for (const name of Object.keys(env)) {
        if (/^(?:OPENAI_|AZURE_OPENAI_)/i.test(name) ||
            /^(?:TYPECHAT_LIVE_TESTS|NODE_TEST_CONTEXT|NODE_OPTIONS|VSCODE_INSPECTOR_OPTIONS|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(name)) {
            delete env[name];
        }
    }
    Object.assign(env, variables);
    const child = spawn(process.execPath, ["--test", "--test-reporter=tap", liveTestFile, ...otherFiles], {
        env,
        timeout: 45_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => stdout += chunk);
    child.stderr.setEncoding("utf8").on("data", chunk => stderr += chunk);
    const [status, signal] = await once(child, "close");
    const output = `${stdout}\n${stderr}`;
    assert.equal(signal, null, output);
    return { status, output };
}

async function serve(t, { status = 200, body = chatResponse, stall = false } = {}) {
    const requests = [];
    const server = createServer((request, response) => {
        const captured = { method: request.method, url: request.url, headers: request.headers, body: "" };
        requests.push(captured);
        request.setEncoding("utf8").on("data", chunk => captured.body += chunk);
        request.on("end", () => {
            if (!stall) {
                response.writeHead(status, { "content-type": "application/json" });
                response.end(JSON.stringify(body));
            }
        });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => {
        server.closeAllConnections();
        return new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    });
    return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

test("live tests stay offline unless TYPECHAT_LIVE_TESTS is exactly 1", async t => {
    const { url, requests } = await serve(t);
    const configurations = [
        {},
        ...[undefined, "0", "true"].map(flag => ({ ...liveOpenAIEnv(url), TYPECHAT_LIVE_TESTS: flag })),
    ];
    for (const variables of configurations) {
        const result = await runLiveTests(variables);
        assert.equal(result.status, 0, result.output);
        assert.match(result.output, /# SKIP Set TYPECHAT_LIVE_TESTS=1/);
    }
    assert.equal(requests.length, 0);
});

for (const [name, variables, message] of [
    ["credentials", {}, /Missing environment variable: OPENAI_API_KEY or AZURE_OPENAI_API_KEY/],
    ["OpenAI model", { OPENAI_API_KEY: "test-key" }, /Missing environment variable: OPENAI_MODEL/],
    ["Azure endpoint", { AZURE_OPENAI_API_KEY: "test-key" }, /Missing environment variable: AZURE_OPENAI_ENDPOINT/],
]) {
    test(`enabled live tests fail visibly for missing ${name}`, async t => {
        const { url, requests } = await serve(t);
        const result = await runLiveTests({
            TYPECHAT_LIVE_TESTS: "1",
            OPENAI_ENDPOINT: `${url}/v1/chat/completions`,
            ...variables,
        });
        assert.equal(result.status, 1, result.output);
        assert.match(result.output, message);
        assert.equal(requests.length, 0);
    });
}

for (const api of ["chat", "responses", "azure"]) {
    test(`enabled live tests call the configured ${api} API through native fetch`, async t => {
        const body = api === "responses"
            ? { output: [{ type: "message", content: [{ type: "output_text", text: "pong" }] }] }
            : chatResponse;
        const { url, requests } = await serve(t, { body });
        const path = api === "azure" ? "/openai/deployments/test/chat/completions?api-version=test"
            : api === "responses" ? "/v1/responses" : "/v1/chat/completions";
        const variables = api === "azure"
            ? { TYPECHAT_LIVE_TESTS: "1", AZURE_OPENAI_API_KEY: "test-key", AZURE_OPENAI_ENDPOINT: `${url}${path}` }
            : { ...liveOpenAIEnv(url), OPENAI_ENDPOINT: `${url}${path}` };
        const result = await runLiveTests(variables);
        assert.equal(result.status, 0, result.output);
        assert.match(result.output, /^# pass 1$/m);
        assert.equal(requests.length, 1);
        assert.equal(requests[0].method, "POST");
        assert.equal(requests[0].url, path);
        const request = JSON.parse(requests[0].body);
        if (api === "responses") {
            assert.equal(request.input, prompt);
        } else {
            assert.deepEqual(request.messages, [{ role: "user", content: prompt }]);
        }
        assert.equal(request.model, api === "azure" ? undefined : "test-model");
    });
}

test("live and mocked suites remain isolated when run together", async t => {
    const { url, requests } = await serve(t);
    const result = await runLiveTests(
        liveOpenAIEnv(url),
        fileURLToPath(new URL("./model.test.mjs", import.meta.url)),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /token-provider authentication/);
    assert.match(result.output, /createLanguageModel live API integration/);
    assert.equal(requests.length, 1);
});

for (const status of [401, 503]) {
    test(`live HTTP ${status} errors fail without retries or mock fallback`, async t => {
        const { url, requests } = await serve(t, { status, body: { error: { message: "test failure" } } });
        const result = await runLiveTests(liveOpenAIEnv(url));
        assert.equal(result.status, 1, result.output);
        assert.match(result.output, new RegExp(`REST API error ${status}:`));
        assert.equal(requests.length, 1);
    });
}

for (const content of ["", " \n"]) {
    test(`live tests reject blank completion ${JSON.stringify(content)}`, async t => {
        const { url, requests } = await serve(t, { body: { choices: [{ message: { content } }] } });
        const result = await runLiveTests(liveOpenAIEnv(url));
        assert.equal(result.status, 1, result.output);
        assert.equal(requests.length, 1);
    });
}

test("live requests time out after 30 seconds without retrying", { timeout: 40_000 }, async t => {
    const { url, requests } = await serve(t, { stall: true });
    const started = performance.now();
    const result = await runLiveTests(liveOpenAIEnv(url));
    const elapsed = performance.now() - started;
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /REST API fetch error:.*(?:timeout|timed out)/i);
    assert.equal(requests.length, 1);
    assert.ok(elapsed >= 29_000 && elapsed < 35_000, `Expected a 30-second request limit, observed ${elapsed}ms`);
});
