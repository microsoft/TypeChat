import { loadBrowserTypeScriptCompiler } from "@typechat/experimental-browser";

globalThis.runMismatchProbe = async () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        calls++;
        throw new Error("A compiler version mismatch must not fetch WASM.");
    };
    try {
        await loadBrowserTypeScriptCompiler("/tsc.wasm");
        throw new Error("A mismatched compiler was accepted.");
    } catch (error) {
        if (!/Expected TypeScript .*but loaded 0\.0\.0/.test(error.message) || calls !== 0) {
            throw error;
        }
        return { rejected: true, fetchCalls: calls };
    } finally {
        globalThis.fetch = originalFetch;
    }
};
