import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

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

for (const example of examples) {
    const mainPath = join(examplesDir, example, "src", "main.ts");
    const ts = createRequire(mainPath)("typescript");
    const source = ts.transpileModule(readFileSync(mainPath, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;

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
