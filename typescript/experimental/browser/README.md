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
npx playwright install firefox webkit
npm run test:browser
```

`npm test` in this directory type-checks the prototype and runs loader/lifecycle
tests plus a shared validation corpus against three backends: the default native
7.0.2 compiler, the matching development native compiler, and WASM. The two
same-version backends must match diagnostics as well as acceptance outcomes.

`npm run test:browser` bundles the actual private-package exports with **no Node
polyfills or externalized dependencies**, then runs Chromium, Firefox, and WebKit against a temporary loopback server. It
verifies validation, repair, schema preflight, stalled-download cancellation, and
compiler-version rejection before fetching. It also exercises the worker example,
concurrent job isolation, cancellation during synchronous validation, and cleanup.
It closes every worker, browser, and server, including outstanding connections. No model credentials,
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
on the calling thread**. Use an application-owned worker to keep that work off the
UI thread. A worker improves responsiveness, not the compiler's execution time.

## Application-owned worker example

From this directory:

```sh
npm run example:worker
```

Open the printed loopback URL. The example validates a JSON batch against a schema
with a string enum, displays valid and invalid results, and keeps a main-thread
timer running. Cancel interrupts a running job; Ctrl+C stops the local server.
The development server serves the raw artifact without caching. A production
application would need deliberate asset compression and cache/version handling.

[`examples/worker/client.ts`](./examples/worker/client.ts) and
[`examples/worker/validator.worker.ts`](./examples/worker/validator.worker.ts) are
copyable application code, **not additions to the package's public API**:

- Each call owns one worker, compiler instance, and request batch. Jobs do not
  share a mutable reactor. Concurrent calls cannot overwrite each other's schema.
- A caller-supplied `AbortSignal` covers the whole job. Termination rejects its
  promise and stops even synchronous compiler work; no result is silently retried.
  The demo combines a cancel button with a 60-second timeout.
- Success and failure both terminate the worker. Success additionally closes the
  validator explicitly before sending the report. Termination during cancellation
  destroys the worker rather than relying on JavaScript `finally` to run there.
- Schema/load errors, worker startup errors, clone failures, malformed requests,
  and caller callback errors reject explicitly. Ordinary invalid JSON values
  retain TypeChat's normal validation `Result`.

The one-shot design deliberately favors simple ownership and cancellation over
throughput. It reloads/reinitializes a compiler per job. A reusable worker or
compiled-module cache would need separate lifecycle and cancellation design; this
investigation does not introduce a worker pool into TypeChat.

## Recorded verification

On Windows and Node.js 24.22.1:

- The normal library/examples built, and all **411** normal tests passed,
  including CJS/ESM package/declaration tests and the existing enum regressions.
- **58** corpus outcomes passed in each real browser and matched the default
  native backend. WASM and the matching development native backend also produced
  identical diagnostics.
- HTTP/network errors, pre-aborted loads, absent/truncated/oversized/corrupt
  artifacts, concurrent validator isolation, and idempotent disposal passed.
- Real-browser tests ran with no Node globals, no proxy dependency, no live
  model calls, and `crossOriginIsolated === false`.
- Chromium 149.0.7827.55, Firefox 151.0, and Playwright WebKit 26.5 each passed the
  same corpus, the runnable example UI, ten worker lifecycle/error checks,
  cancellation after a partial network response, and all-worker termination.
- Review of the shared refactor confirmed that the minimal library, enum wire
  mapping, diagnostic normalization, and model protocol definitions remain
  unchanged. Existing custom-module diagnostics, program validation, lifecycle,
  and CJS/ESM consumer tests were rechecked.

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

### Larger worker workload and browser process memory

One run per engine used a **500-property schema with 250 synchronous validations**
inside a worker. Main-thread timer ticks were counted only during validation:

| Browser engine on Windows | Validation time | Main-thread ticks | Maximum WASM linear memory |
| --- | ---: | ---: | ---: |
| Chromium 149.0.7827.55 | 1,920 ms | 191 | 34,603,008 bytes |
| Firefox 151.0 | 19,389 ms | 1,843 | 34,603,008 bytes |
| Playwright WebKit 26.5 | 2,895 ms | 184 | 35,127,296 bytes |

Firefox's substantially slower execution is an observed limitation, even though
the UI remains responsive. The worker's linear-memory report returns zero after
explicit close; this does not assert immediate OS-memory reclamation.

The test also samples the **entire owned browser process tree** on Windows:

| Engine | Baseline working-set sum | Largest sampled sum during worker workload | After worker jobs |
| --- | ---: | ---: | ---: |
| Chromium | 184 MB | 941 MB | 654 MB |
| Firefox | 481 MB | 1,098 MB | 1,024 MB |
| WebKit | 179 MB | 858 MB | 436 MB |

These are decimal MB and sums of process working sets, not unique physical memory.
Shared pages can be counted more than once. Samples include the preceding corpus
and lifecycle probes in the same browser session; they do not establish the
incremental memory of a single job, a precise peak, or a leak. Browser/runtime
overhead and delayed reclamation make the cost materially larger than WASM linear
memory alone. Other operating systems report this metric as unavailable rather
than substituting a misleading value.

A gzip-compressed compiler download was also delivered in 256 KiB chunks with
64 ms delays (nominally 4 MiB/s before backpressure). Loading, verifying, and
compiling it took roughly 4.0-4.5 seconds in these runs. This is a controlled local
transfer test, not a complete WAN simulation.

Only the browser-engine/OS combinations above were exercised. Playwright WebKit on
Windows is **not Safari certification**. macOS, mobile/low-memory devices, production
CSPs, and real edge runtimes remain unverified. The full existing native suite is
not yet a full browser matrix.

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

**Recommendation: the prototype is ready for draft design review, not for
supported browser functionality or a mainline merge.** Mainline gates remain an
explicit upstream-stability/maintenance decision, review of the provisional API
and substantial browser costs (especially Firefox latency), target-device/CSP
coverage, and a full regression/compatibility assessment.
The existing root-package Node-proxy bundling problem remains separate; this
package does not fix that public entry point or automatically resolve #534.
