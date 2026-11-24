# Experimental browser/WASM validator

Private investigation for [#536](https://github.com/microsoft/TypeChat/issues/536),
under [#534](https://github.com/microsoft/TypeChat/issues/534). This is an isolated
prototype, **not a published package, supported browser release, or merge approval**.

The normal TypeChat package keeps its existing entry points, dependency manifest,
and native TypeScript 7.0.2 backend. This package is deliberately outside its npm
workspaces and normal build/test commands. Installing TypeChat does not install
this experimental compiler or its WASM artifact.

## Design and boundaries

- The native and browser adapters share schema generation, enum normalization,
  schema preflight, missing-property diagnostic expansion, and repair behavior.
  Small, separately typed AST adapters handle the different upstream compiler
  APIs; there are no casts between incompatible compiler versions.
- The browser entry point exports the translator, result helpers, model protocol
  types, and an asynchronous compiler loader. Supply your own model implementation.
  It does **not** export the Node HTTP/proxy client, interactive utilities, or
  program-translation helpers. Nothing silently ignores a proxy configuration.
- Load/compile the WASM module once, then create independent validator instances.
  There is no global mutable reactor, hidden model call, inference fallback,
  automatic download retry, or silent choice of a different backend.
- This uses matching `typescript` and `@typescript/typescript-wasip1-wasm` packages
  at **7.1.0-dev.20261030.1**. The loader checks the JavaScript compiler version,
  artifact length, and SHA-256 before compiling any WASM bytes. Relabeling an
  incompatible artifact is not sufficient to pass these checks.

A separate entry point/asynchronous factory is preferable to making the existing
synchronous Node factory browser-aware: it keeps experimental dependencies,
asynchronous initialization, and browser support claims opt-in. The internal
compiler contract is not a new supported public compiler-injection API.

## Build and test

Use the Node.js version in [`.nvmrc`](../../../.nvmrc). From the repository root:

```sh
cd typescript
npm ci
npm run build-all
npm test

cd experimental
cd browser
npm ci --ignore-scripts
npm test
npx playwright install chromium --only-shell
npm run test:browser
```

`npm test` in this directory type-checks the prototype and runs loader/lifecycle
tests plus a shared validation corpus against three backends: the default native
7.0.2 compiler, the matching development native compiler, and WASM. The two
same-version backends must match diagnostics as well as acceptance outcomes.

`npm run test:browser` bundles the actual private-package exports with **no Node
polyfills or externalized dependencies**, then runs Chromium against a temporary
loopback server. It verifies validation, repair, schema preflight, stalled-download
cancellation, and compiler-version rejection before fetching. It closes the
browser and server, including outstanding connections. No model credentials,
remote model calls, deployment, or paid inference are needed.

The ordinary TypeChat tests do not install or invoke Playwright. On supported
Linux hosts, Playwright may additionally require its documented system libraries.

## Provisional API

Serve the exact installed
`node_modules/@typescript/typescript-wasip1-wasm/lib/tsc.wasm` from an
application-owned static asset URL, preferably with `application/wasm` and HTTP
compression. Do not use a mutable CDN `latest` URL. Asset copying and deployment
remain application responsibilities.

For code built within this private package, or an application that explicitly
links its built output:

```ts
import {
    createJsonTranslator,
    loadBrowserTypeScriptCompiler,
    success
} from "@typechat/experimental-browser";

interface Request { value: number; }

const compiler = await loadBrowserTypeScriptCompiler(
    "/assets/typescript-7.1.0-dev.20261030.1.wasm",
    { signal: AbortSignal.timeout(60_000) }
);
const validator = await compiler.createValidator<Request>(
    "export interface Request { value: number; }",
    "Request"
);
try {
    // Intentional offline test model, not an inference fallback.
    const model = { complete: async () => success('{"value":1}') };
    const translator = createJsonTranslator(model, validator);
    const result = await translator.translate("Return one.");
    if (!result.success) {
        throw new Error(result.message);
    }
    console.log(result.data.value);
} finally {
    validator.close();
}
```

The compiler handle can create multiple validators without refetching or
recompiling the module. Each validator has independent files, snapshots, and WASM
memory. `close()` is idempotent and releases the owned compiler references.
Validation and schema preflight after closing throw an explicit error. Dropping
the compiler handle allows its compiled module to be garbage-collected; actual
garbage-collection timing remains runtime-owned.

Network, HTTP, cancellation, length, integrity, and compiler initialization
failures reject the loader/factory promise. Schema/instance failures retain
TypeChat's `Result` behavior and rejected data. Web Crypto requires HTTPS or a
secure local context. Browser CSP must allow the application's WASM compilation.

Loading and instance creation are asynchronous, but **validation is synchronous
on the calling thread**. A worker-based application integration needs separate
evaluation; this prototype does not hide synchronous work behind an async name.

## Recorded verification

On Windows, Node.js 24.22.1 and Chromium 149.0.7827.55:

- The normal library/examples built, and all **411** normal tests passed,
  including CJS/ESM package/declaration tests and the existing enum regressions.
- **58** corpus outcomes passed in the real browser and matched the default
  native backend. WASM and the matching development native backend also produced
  identical diagnostics.
- HTTP/network errors, pre-aborted loads, absent/truncated/oversized/corrupt
  artifacts, concurrent validator isolation, and idempotent disposal passed.
- Real-browser tests ran with no Node globals, no proxy dependency, no live
  model calls, and `crossOriginIsolated === false`.

One clean-install development-host run measured:

| Measurement | Observed |
| --- | ---: |
| Minified library JavaScript, without the test corpus | 441,030 bytes |
| Gzipped library JavaScript | 93,789 bytes |
| WASM artifact | 52,616,552 bytes |
| Gzipped WASM artifact | 13,359,431 bytes |
| Loopback fetch, integrity check, and module compilation | 184 ms |
| Instance initialization with an already compiled module | 19-20 ms |
| 100 validations of a 100-property schema | 416 ms total |
| That validator's WASM linear memory, before/after the loop | 30,408,704 / 33,816,576 bytes |

These are observations, not production latency guarantees. The timing does not
represent a WAN download or low-memory device. `getWasmMemoryByteLength()` measures
only owned WASM linear memory, not JavaScript, compiled code, download buffers,
peak process memory, or immediate garbage collection after closing.

The browser test enforces **provisional investigation ceilings**, for review:
512 KiB minified / 128 KiB gzipped JavaScript; 60 MiB raw / 16 MiB gzipped WASM;
128 MiB of linear memory for the single 100-property test validator after its
100 validations. Agree target-device startup and responsiveness budgets before
shipping; wall-clock performance is measured rather than asserted on arbitrary
CI hardware.

Only the browser/OS combination above was exercised. This is not a complete
compatibility certification for every schema, browser, worker, CSP, or edge
runtime. The full existing native suite is not yet a full browser matrix.

## Upgrade, rollback, and recommendation

The upstream WASM implementation is experimental:
[microsoft/TypeScript#64174](https://github.com/microsoft/TypeScript/pull/64174).
A newer published compiler version alone does not establish a stable WASM API.

For an evaluated upgrade, change both exact package versions together, review
the upstream API/transport changes, and update the reviewed artifact length/hash
in [`src/versions.ts`](./src/versions.ts). Keep the lockfile's public registry
URLs and integrity data. Rerun native package tests, same-version compiler parity,
real-browser tests, and cost measurements. Never suppress validation failures or
disable artifact verification merely to accept an upgrade.

Rollback is to stop opting into this package and its assets. The ordinary Node
backend remains available and does not require the experimental dependencies.
Keep the prototype out of the default workspace/build until reviewed explicitly.

**Recommendation: continue the isolated investigation; do not merge this as
supported browser functionality yet.** Mainline gates remain an explicit
upstream-stability/maintenance decision, review of the provisional API and costs,
broader browser/OS/worker coverage, and a full regression/compatibility assessment.
The existing root-package Node-proxy bundling problem remains separate; this
package does not fix that public entry point or automatically resolve #534.
