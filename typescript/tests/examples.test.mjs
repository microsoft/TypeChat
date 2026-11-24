import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import { success } from "../dist/index.js";
import { createTypeScriptJsonValidator } from "../dist/ts/index.js";

const examplesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "examples");
const examples = [
    "calendar",
    "coffeeShop",
    "coffeeShop-zod",
    "crossword",
    "drawing",
    "healthData",
    "math",
    "multiSchema",
    "restaurant",
    "sentiment",
    "sentiment-zod",
];
const missingEnvMessage = "Error: .env file not found.\n" +
    "Copy .env.example to .env in the repository root and configure your OpenAI or Azure OpenAI credentials.\n";

function runStartup(source, dotEnvPath) {
    return spawnSync(process.execPath, ["-"], {
        input: `
            const { isBuiltin } = require("node:module");
            const { runInNewContext } = require("node:vm");
            runInNewContext(${JSON.stringify(source)}, {
                exports: {},
                require(name) {
                    if (isBuiltin(name)) return require(name);
                    if (name === "find-config") return () => ${JSON.stringify(dotEnvPath)};
                    if (name === "dotenv") {
                        // Stop after loading configuration, before any model setup.
                        return { config({ path }) { console.log(path); process.exit(0); } };
                    }
                    return {};
                },
                console,
                process,
            });
        `,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "", VSCODE_INSPECTOR_OPTIONS: "" },
        timeout: 10000,
    });
}

function compileExample(file) {
    const ts = createRequire(file)("typescript");
    return ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
}

for (const example of examples) {
    const source = compileExample(join(examplesDir, example, "src", "main.ts"));

    describe(`${example} environment setup`, () => {
        test("reports missing .env without a stack trace and exits with status 1", () => {
            const result = runStartup(source, null);
            assert.ifError(result.error);
            assert.equal(result.status, 1);
            assert.equal(result.stdout, "");
            assert.equal(result.stderr, missingEnvMessage);
        });

        test("passes the discovered .env path to dotenv", () => {
            const dotEnvPath = join(examplesDir, example, ".env");
            const result = runStartup(source, dotEnvPath);
            assert.ifError(result.error);
            assert.equal(result.status, 0);
            assert.equal(result.stdout, `${dotEnvPath}\n`);
            assert.equal(result.stderr, "");
        });
    });
}

test("all example workspaces resolve the local TypeChat build", () => {
    for (const example of [...examples, "music"]) {
        const require = createRequire(join(examplesDir, example, "package.json"));
        assert.equal(require.resolve("typechat"), fileURLToPath(new URL("../dist/index.js", import.meta.url)), example);
    }
});

// Exercise the checked-in example, not a stale example dist/ or a copy of its prompt.
function loadTranslator(example) {
    const file = join(examplesDir, example, "src", "translator.ts");
    const exports = {};
    compileFunction(compileExample(file), ["require", "exports"], { filename: file })(createRequire(file), exports);
    return exports;
}

function recordingModel(...answers) {
    const calls = [];
    const model = {
        async complete(prompt) {
            assert.ok(answers.length, "unexpected model call");
            calls.push(structuredClone(prompt));
            return success(JSON.stringify(answers.shift()));
        }
    };
    return { model, calls };
}

test("crossword example: screenshot parts stay user context before the raw question", async () => {
    const { createCrosswordActionTranslator } = loadTranslator("crossword");
    const schema = readFileSync(join(examplesDir, "crossword", "src", "crosswordSchema.ts"), "utf8");
    const validator = createTypeScriptJsonValidator(schema, "CrosswordActions");
    const answer = { actionName: "getClueText", parameters: { clueNumber: 61, clueDirection: "across", value: "Monogram" } };
    const { model, calls } = recordingModel(answer);
    const image = "data:image/jpeg;base64,AAAA";
    const request = "  What is 61 across?  ";
    try {
        const translator = createCrosswordActionTranslator(model, validator, image);
        assert.deepEqual(await translator.translate(request, "earlier context"), success(answer));
        assert.equal(calls.length, 1);
        const [system] = calls[0];
        assert.ok(system.content.includes(schema));
        assert.match(system.content, /crossword webpage/);
        assert.doesNotMatch(system.content, /base64|earlier context|61 across/);
        assert.deepEqual(calls[0], [
            { role: "system", content: system.content },
            { role: "user", content: "earlier context" },
            { role: "user", content: [
                { type: "text", text: "Here is a screenshot of the currently visible webpage" },
                { type: "image_url", image_url: { url: image, detail: "high" } }
            ] },
            { role: "user", content: request }
        ]);
    } finally {
        validator.close();
    }
});

test("healthData example: validated prior answer stays assistant context", async () => {
    const { createHealthDataTranslator } = loadTranslator("healthData");
    const schema = readFileSync(join(examplesDir, "healthData", "src", "healthDataSchema.ts"), "utf8");
    const firstAnswer = { message: "PAST_ANSWER" };
    const { model, calls } = recordingModel(firstAnswer, { message: "OK" });
    const translator = createHealthDataTranslator(model, schema, "HealthDataResponse", "APP_INSTRUCTIONS");
    try {
        assert.ok((await translator.translate("FIRST_REQUEST")).success);
        assert.ok((await translator.translate("NEXT_REQUEST")).success);
        assert.equal(calls.length, 2);
        for (const [system] of calls) {
            assert.equal(system.role, "system");
            assert.ok(system.content.includes(schema));
            assert.match(system.content, /APP_INSTRUCTIONS/);
            assert.doesNotMatch(system.content, /PAST_ANSWER|FIRST_REQUEST|NEXT_REQUEST/);
        }
        assert.deepEqual(calls[0].slice(1), [{ role: "user", content: "FIRST_REQUEST" }]);
        assert.deepEqual(calls[1].slice(1), [
            { role: "assistant", content: JSON.stringify(firstAnswer, null, 2) },
            { role: "user", content: "NEXT_REQUEST" }
        ]);
    } finally {
        translator._translator.validator.close();
    }
});
