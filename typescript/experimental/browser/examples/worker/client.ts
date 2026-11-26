import type { Result } from "@typechat/experimental-browser";

export interface ValidationJob {
    wasmUrl: string;
    schema: string;
    typeName: string;
    values: object[];
}

export interface ValidationReport {
    results: Result<object>[];
    loadCompileMs: number;
    initializationMs: number;
    validationMs: number;
    maxLinearMemoryBytes: number;
    closedLinearMemoryBytes: number;
}

export type WorkerPhase = "loading" | "validating";
export type WorkerReply =
    | { kind: "phase"; phase: WorkerPhase }
    | { kind: "result"; report: ValidationReport }
    | { kind: "error"; name: string; message: string };

/**
 * Application-owned, one-job-per-worker example. Aborting destroys that job's
 * compiler, including synchronous validation; it does not interrupt a shared worker.
 */
export function validateInWorker(
    workerUrl: string | URL,
    job: ValidationJob,
    options: { signal: AbortSignal; onPhase?: (phase: WorkerPhase) => void }
): Promise<ValidationReport> {
    return new Promise((resolve, reject) => {
        options.signal.throwIfAborted();
        const worker = new Worker(workerUrl, { type: "module" });
        let settled = false;
        const cleanup = () => {
            if (settled) {
                return false;
            }
            settled = true;
            options.signal.removeEventListener("abort", abort);
            worker.removeEventListener("message", message);
            worker.removeEventListener("error", failure);
            worker.removeEventListener("messageerror", invalidMessage);
            worker.terminate();
            return true;
        };
        const fail = (cause: unknown) => {
            if (cleanup()) {
                reject(cause);
            }
        };
        const abort = () => fail(options.signal.reason);
        const failure = (event: ErrorEvent) => {
            event.preventDefault();
            fail(new Error(event.message || "The validation worker failed without error details."));
        };
        const invalidMessage = () => fail(new Error("Unable to deserialize a validation worker reply."));
        const message = (event: MessageEvent<WorkerReply>) => {
            try {
                const reply = event.data;
                switch (reply?.kind) {
                    case "phase":
                        options.onPhase?.(reply.phase);
                        return;
                    case "result":
                        if (cleanup()) {
                            resolve(reply.report);
                        }
                        return;
                    case "error": {
                        const error = new Error(reply.message);
                        error.name = reply.name;
                        fail(error);
                        return;
                    }
                    default:
                        fail(new Error("Unexpected validation worker reply."));
                }
            } catch (cause) {
                fail(cause);
            }
        };
        worker.addEventListener("message", message);
        worker.addEventListener("error", failure);
        worker.addEventListener("messageerror", invalidMessage);
        options.signal.addEventListener("abort", abort, { once: true });
        if (options.signal.aborted) {
            abort();
            return;
        }
        try {
            worker.postMessage(job);
        } catch (cause) {
            fail(cause);
        }
    });
}
