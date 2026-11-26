import { loadBrowserTypeScriptCompiler, typeChatSchemaValidation } from "@typechat/experimental-browser";
import type { ValidationJob, ValidationReport, WorkerReply } from "./client.js";

function isJob(value: unknown): value is ValidationJob {
    return typeof value === "object" && value !== null &&
        "wasmUrl" in value && typeof value.wasmUrl === "string" &&
        "schema" in value && typeof value.schema === "string" &&
        "typeName" in value && typeof value.typeName === "string" &&
        "values" in value && Array.isArray(value.values) &&
        value.values.every((item: unknown) => typeof item === "object" && item !== null);
}

function reply(message: WorkerReply) {
    self.postMessage(message);
}

self.addEventListener("message", async (event: MessageEvent<unknown>) => {
    try {
        if (!isJob(event.data)) {
            throw new Error("Expected a WASM URL, schema, type name, and array of JSON objects.");
        }
        const job = event.data;
        reply({ kind: "phase", phase: "loading" });
        const loadStart = performance.now();
        const compiler = await loadBrowserTypeScriptCompiler(job.wasmUrl);
        const loadCompileMs = performance.now() - loadStart;
        const instanceStart = performance.now();
        const validator = await compiler.createValidator(job.schema, job.typeName);
        const initializationMs = performance.now() - instanceStart;
        let report: Omit<ValidationReport, "closedLinearMemoryBytes">;
        try {
            const preflight = validator[typeChatSchemaValidation]();
            if (!preflight.success) {
                throw new Error(`Schema validation failed: ${preflight.message}`);
            }
            reply({ kind: "phase", phase: "validating" });
            let maxLinearMemoryBytes = validator.getWasmMemoryByteLength();
            const start = performance.now();
            const results = job.values.map(value => {
                const result = validator.validate(value);
                maxLinearMemoryBytes = Math.max(maxLinearMemoryBytes, validator.getWasmMemoryByteLength());
                return result;
            });
            report = {
                results, loadCompileMs, initializationMs,
                validationMs: performance.now() - start,
                maxLinearMemoryBytes
            };
        } finally {
            validator.close();
        }
        reply({
            kind: "result",
            report: { ...report, closedLinearMemoryBytes: validator.getWasmMemoryByteLength() }
        });
    } catch (cause) {
        reply({
            kind: "error",
            name: cause instanceof Error ? cause.name : "Error",
            message: cause instanceof Error ? cause.message : String(cause)
        });
    } finally {
        self.close();
    }
}, { once: true });
