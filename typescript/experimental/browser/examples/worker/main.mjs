import { validateInWorker } from "./client.js";

const run = document.getElementById("run");
const cancel = document.getElementById("cancel");
const status = document.getElementById("status");
const result = document.getElementById("result");
const wasmPath = document.body.dataset.wasmUrl;
if (!wasmPath) {
    status.textContent = "The example has no configured WASM asset URL.";
    throw new Error(status.textContent);
}

let controller;
let ticks = 0;
const timer = setInterval(() => document.getElementById("ticks").textContent = String(++ticks), 50);
cancel.onclick = () => controller?.abort();
run.onclick = async () => {
    controller = new AbortController();
    run.disabled = true;
    cancel.disabled = false;
    status.textContent = "Starting worker";
    result.textContent = "";
    try {
        const values = JSON.parse(document.getElementById("values").value);
        const report = await validateInWorker("/validator.worker.js", {
            wasmUrl: new URL(wasmPath, location.href).href,
            schema: 'export enum Status { Active = "active", Paused = "paused" } export interface Request { status: Status; value: number; }',
            typeName: "Request",
            values
        }, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]),
            onPhase: phase => status.textContent = phase
        });
        result.textContent = JSON.stringify(report, null, 2);
        status.textContent = "Completed; worker disposed";
    } catch (error) {
        status.textContent = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    } finally {
        run.disabled = false;
        cancel.disabled = true;
        controller = undefined;
    }
};
addEventListener("pagehide", () => {
    clearInterval(timer);
    controller?.abort();
}, { once: true });
