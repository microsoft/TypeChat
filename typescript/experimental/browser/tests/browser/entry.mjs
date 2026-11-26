import * as core from "@typechat/experimental-browser";
import { runCorpus } from "../corpus.mjs";

globalThis.runBrowserProbe = async () => {
    if (typeof globalThis.process !== "undefined" || typeof globalThis.require !== "undefined") {
        throw new Error("The browser test must run without Node globals.");
    }
    const start = performance.now();
    const compiler = await core.loadBrowserTypeScriptCompiler("/tsc.wasm", { signal: AbortSignal.timeout(60000) });
    const loadCompileMs = performance.now() - start;
    const observations = await runCorpus((...args) => compiler.createValidator(...args), core);
    const initialization = [];
    for (let index = 0; index < 3; index++) {
        const before = performance.now();
        const validator = await compiler.createValidator("export interface Probe { value: number }", "Probe");
        initialization.push(performance.now() - before);
        validator.close();
        if (validator.getWasmMemoryByteLength() !== 0) {
            throw new Error("A closed validator still owns its WASM memory.");
        }
    }
    const schema = "export interface Probe {\n" +
        Array.from({ length: 100 }, (_, index) => `field${index}: number;`).join("\n") + "\n}";
    const value = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`field${index}`, index]));
    const validator = await compiler.createValidator(schema, "Probe");
    let largeSchema;
    try {
        const initialMemory = validator.getWasmMemoryByteLength();
        const started = performance.now();
        for (let index = 0; index < 100; index++) {
            if (!validator.validate(value).success) {
                throw new Error("The representative 100-property schema did not validate.");
            }
        }
        largeSchema = {
            properties: 100,
            validations: 100,
            totalValidationMs: performance.now() - started,
            initialLinearMemoryBytes: initialMemory,
            finalLinearMemoryBytes: validator.getWasmMemoryByteLength()
        };
    } finally {
        validator.close();
    }
    const signal = AbortSignal.timeout(75);
    let timeout;
    try {
        await core.loadBrowserTypeScriptCompiler("/slow.wasm", { signal });
    } catch (error) {
        timeout = error.name;
    }
    if (!signal.aborted || (timeout !== "TimeoutError" && timeout !== "AbortError")) {
        throw new Error(`Loading a stalled response did not time out: ${timeout}`);
    }
    return {
        compiler: compiler.version,
        observations,
        nodeGlobalsAbsent: true,
        crossOriginIsolated: globalThis.crossOriginIsolated,
        liveModelCalls: 0,
        loadCompileMs,
        warmInitializationMs: initialization,
        largeSchema,
        stalledLoadTimedOut: true
    };
};
