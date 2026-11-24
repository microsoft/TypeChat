import { version } from "typescript";
import { API, type Snapshot } from "typescript/sync";
import { instantiateWasm, WasmTransport } from "typescript/wasm";
import {
    configFileName, createCompiler, jsonFileName, schemaFileName, schemaValidationFileName
} from "../../../src/ts/compiler.js";
import {
    createTypeScriptJsonValidatorWithCompiler, type TypeScriptJsonValidatorWithSchemaValidation
} from "../../../src/ts/validation.js";
import { projectView } from "./project.js";
import { compilerVersion, wasmByteLength, wasmSha256 } from "./versions.js";

export { compilerVersion } from "./versions.js";

export interface BrowserTypeScriptValidator<T extends object> extends TypeScriptJsonValidatorWithSchemaValidation<T> {
    /** Owned WASM linear-memory bytes, excluding JavaScript allocations; zero after close. */
    getWasmMemoryByteLength(): number;
}

export interface BrowserTypeScriptCompiler {
    readonly version: string;
    /** Creates an independent compiler instance. Close the returned validator when finished. */
    createValidator<T extends object = object>(
        schema: string,
        typeName: string,
        schemaValidationTypeName?: string
    ): Promise<BrowserTypeScriptValidator<T>>;
}

/**
 * Loads and verifies the exact experimental compiler artifact, then compiles it once for reuse.
 * Network, integrity, cancellation, and initialization failures reject; there is no fallback.
 */
export async function loadBrowserTypeScriptCompiler(
    wasmUrl: string | URL,
    options: { signal?: AbortSignal } = {}
): Promise<BrowserTypeScriptCompiler> {
    if (version !== compilerVersion) {
        throw new Error(`Expected TypeScript ${compilerVersion}, but loaded ${version}.`);
    }
    if (!globalThis.crypto?.subtle) {
        throw new Error("WASM integrity verification requires Web Crypto in a secure context.");
    }
    options.signal?.throwIfAborted();
    const response = await fetch(wasmUrl, options.signal ? { signal: options.signal } : {});
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Unable to load the TypeScript WASM compiler: HTTP ${response.status}.`);
    }
    if (!response.body) {
        throw new Error("The TypeScript WASM compiler response has no body.");
    }
    const reader = response.body.getReader();
    const bytes = new Uint8Array(wasmByteLength);
    let offset = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            if (offset + value.byteLength > bytes.byteLength) {
                await reader.cancel();
                throw new Error(`The WASM artifact exceeds the expected ${wasmByteLength} bytes.`);
            }
            bytes.set(value, offset);
            offset += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }
    if (offset !== bytes.byteLength) {
        throw new Error(`Expected ${wasmByteLength} WASM bytes, but received ${offset}.`);
    }
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const actualHash = [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
    if (actualHash !== wasmSha256) {
        throw new Error(`The WASM artifact does not match TypeScript ${compilerVersion} (SHA-256 mismatch).`);
    }
    options.signal?.throwIfAborted();
    const module = await WebAssembly.compile(bytes);
    options.signal?.throwIfAborted();
    return {
        version: compilerVersion,
        async createValidator<T extends object = object>(schema: string, typeName: string, schemaValidationTypeName = typeName) {
            const instance = await instantiateWasm(module);
            if (!("memory" in instance.exports) || !(instance.exports.memory instanceof WebAssembly.Memory)) {
                throw new Error("The TypeScript WASM reactor did not export its memory.");
            }
            let memory: WebAssembly.Memory | undefined = instance.exports.memory;
            let transport: WasmTransport | undefined;
            let api: API | undefined;
            let snapshot: Snapshot | undefined;
            const close = () => {
                const currentApi = api;
                const currentTransport = transport;
                api = undefined;
                transport = undefined;
                snapshot = undefined;
                memory = undefined;
                if (currentApi) {
                    currentApi.close();
                } else {
                    currentTransport?.close();
                }
            };
            try {
                transport = new WasmTransport({ instance, cwd: "/" });
                api = new API({ transport });
                const validator = createTypeScriptJsonValidatorWithCompiler<T>(
                    schema, typeName, schemaValidationTypeName,
                    files => {
                        if (!transport) {
                            throw new Error("The TypeScript WASM transport has been closed.");
                        }
                        for (const [name, text] of Object.entries(files)) {
                            transport.setFile(name, text);
                        }
                        return createCompiler({
                            writeFile(name, text) {
                                if (!transport) {
                                    throw new Error("The TypeScript WASM transport has been closed.");
                                }
                                transport.setFile(name, text);
                            },
                            update(changedFiles) {
                                if (!api) {
                                    throw new Error("The TypeScript WASM API has been closed.");
                                }
                                const next = api.createSnapshot({
                                    openFiles: [schemaFileName, jsonFileName, schemaValidationFileName],
                                    fileNotifications: { changed: [...changedFiles], deleted: [] }
                                });
                                snapshot?.dispose();
                                snapshot = next;
                                const project = next.getConfiguredProject(configFileName);
                                return project && projectView(project);
                            },
                            close
                        });
                    }
                );
                return Object.assign(validator, {
                    getWasmMemoryByteLength: () => memory?.buffer.byteLength ?? 0
                });
            } catch (cause) {
                close();
                throw cause;
            }
        }
    };
}
