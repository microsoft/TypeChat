import { validateInWorker } from "../../examples/worker/client.ts";

const numericSchema = "export interface Probe { value: number; }";
const workerUrl = "/validator.worker.js";
const signal = () => AbortSignal.timeout(60000);
const job = (schema = numericSchema, values = [{ value: 1 }], wasmPath = "/tsc.wasm") => ({
    wasmUrl: new URL(wasmPath, location.href).href,
    schema,
    typeName: "Probe",
    values
});

function check(condition, message) {
    if (!condition) throw new Error(message);
}

async function expectFailure(operation, pattern) {
    try {
        await operation();
    } catch (error) {
        check(pattern.test(`${error.name}: ${error.message}`), `Unexpected worker error: ${error}`);
        return;
    }
    throw new Error("Expected the worker operation to fail.");
}

function largeJob(iterations = 250) {
    const schema = "export interface Probe {\n" +
        Array.from({ length: 500 }, (_, index) => `field${index}: number;`).join("\n") + "\n}";
    const value = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`field${index}`, index]));
    return job(schema, Array(iterations).fill(value));
}

globalThis.runWorkerChecks = async () => {
    const checks = [];
    const enumSchema = 'export enum Status { Active = "active" } export interface Probe { status: Status; value: number; }';
    const report = await validateInWorker(workerUrl, job(
        enumSchema,
        [{ status: "active", value: 1 }, { status: "wrong", value: 1 }],
        "/throttled.wasm"
    ), { signal: signal() });
    check(report.results[0].success && !report.results[1].success, "Worker enum validation diverged.");
    check(report.closedLinearMemoryBytes === 0, "Worker did not close its compiler.");
    checks.push("valid/invalid enum values over a throttled compressed download");

    await expectFailure(() => validateInWorker(workerUrl, job(
        "export interface Probe { value: MissingType; }"
    ), { signal: signal() }), /Schema validation failed/);
    checks.push("schema configuration errors");

    await expectFailure(() => validateInWorker(workerUrl, job(numericSchema, [], "/missing.wasm"), {
        signal: signal()
    }), /HTTP 404/);
    checks.push("HTTP errors");

    await expectFailure(() => validateInWorker(workerUrl, { ...job(), values: [null] }, {
        signal: signal()
    }), /Expected a WASM URL/);
    checks.push("invalid worker requests");

    await expectFailure(() => validateInWorker(workerUrl, job(numericSchema, [{ callback() {} }]), {
        signal: signal()
    }), /DataCloneError/);
    checks.push("uncloneable requests");

    await expectFailure(() => validateInWorker("/broken-worker.js", job(), {
        signal: signal()
    }), /worker startup failure/);
    checks.push("worker startup errors");

    await expectFailure(() => validateInWorker(workerUrl, job(), {
        signal: AbortSignal.abort()
    }), /AbortError/);
    checks.push("pre-aborted requests");

    await expectFailure(() => validateInWorker(workerUrl, job(), {
        signal: signal(),
        onPhase() { throw new Error("synthetic UI callback failure"); }
    }), /synthetic UI callback failure/);
    checks.push("caller callback errors");

    const [numbers, strings] = await Promise.all([
        validateInWorker(workerUrl, job(numericSchema, [{ value: 1 }, { value: "x" }]), { signal: signal() }),
        validateInWorker(workerUrl, job("export interface Probe { value: string; }", [{ value: 1 }, { value: "x" }]), {
            signal: signal()
        })
    ]);
    check(numbers.results[0].success && !numbers.results[1].success, "Numeric job leaked state.");
    check(!strings.results[0].success && strings.results[1].success, "String job leaked state.");
    checks.push("concurrent job isolation");

    const controller = new AbortController();
    let started = false;
    await expectFailure(() => validateInWorker(workerUrl, largeJob(1000), {
        signal: AbortSignal.any([controller.signal, signal()]),
        onPhase(phase) {
            if (phase === "validating") {
                started = true;
                controller.abort();
            }
        }
    }), /AbortError/);
    check(started, "Cancellation was not exercised during validation.");
    checks.push("termination during synchronous validation");
    return { checks, throttledLoadCompileMs: Math.round(report.loadCompileMs) };
};

globalThis.startStalledWorker = () => {
    const controller = new AbortController();
    const result = validateInWorker(workerUrl, job(numericSchema, [], "/worker-slow.wasm"), {
        signal: AbortSignal.any([controller.signal, signal()])
    }).then(
        () => { throw new Error("A stalled worker unexpectedly succeeded."); },
        error => {
            check(error.name === "AbortError", `Unexpected stalled worker result: ${error}`);
            return { aborted: true };
        }
    );
    globalThis.abortStalledWorker = () => {
        controller.abort();
        return result;
    };
};

globalThis.startWorkerStress = () => {
    let ticks = 0;
    let timer;
    globalThis.workerStressActive = true;
    globalThis.workerStressPhase = "loading";
    globalThis.workerStressResult = validateInWorker(workerUrl, largeJob(), {
        signal: signal(),
        onPhase(phase) {
            globalThis.workerStressPhase = phase;
            if (phase === "validating") {
                timer = setInterval(() => ticks++, 10);
            }
        }
    }).then(report => {
        check(report.results.length === 250 && report.results.every(result => result.success), "Stress results were incorrect.");
        check(ticks > 0, "The main-thread heartbeat did not run during worker validation.");
        check(report.closedLinearMemoryBytes === 0, "Stress worker did not close its compiler.");
        return {
            properties: 500,
            validations: report.results.length,
            mainThreadTicksDuringValidation: ticks,
            validationMs: Math.round(report.validationMs),
            maxLinearMemoryBytes: report.maxLinearMemoryBytes,
            closedLinearMemoryBytes: report.closedLinearMemoryBytes
        };
    }).finally(() => {
        clearInterval(timer);
        globalThis.workerStressActive = false;
    });
};
