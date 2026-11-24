import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTypeScriptJsonValidator } from "../../../dist/ts/index.js";
import * as core from "@typechat/experimental-browser";
import { runCorpus } from "./corpus.mjs";
import { createPreviewNativeValidator } from "./native-preview.mjs";

test("WASM preserves baseline outcomes and matches the same-version native compiler", { timeout: 120000 }, async t => {
    const artifact = await readFile(new URL("../node_modules/@typescript/typescript-wasip1-wasm/lib/tsc.wasm", import.meta.url));
    t.mock.method(globalThis, "fetch", async () => new Response(artifact));
    const compiler = await core.loadBrowserTypeScriptCompiler("https://example.test/tsc.wasm");
    const baseline = await runCorpus(createTypeScriptJsonValidator, core);
    const previewNative = await runCorpus(createPreviewNativeValidator, core);
    const wasm = await runCorpus((...args) => compiler.createValidator(...args), core);
    assert.deepEqual(wasm, previewNative, "Same-version WASM and native diagnostics diverged.");
    assert.deepEqual(
        wasm.map(({ name, success }) => ({ name, success })),
        baseline.map(({ name, success }) => ({ name, success })),
        "Validation behavior diverged from the current stable compiler."
    );
    t.diagnostic(`${wasm.length} corpus outcomes matched the stable baseline and same-version native backend.`);
});
