# Experimental browser/WASM validator

Private investigation for [#536](https://github.com/microsoft/TypeChat/issues/536),
under [#534](https://github.com/microsoft/TypeChat/issues/534). This is an isolated
prototype, **not a published package, supported browser release, or merge approval**.

The normal TypeChat package keeps its existing entry points, dependency manifest,
and native TypeScript 7.0.2 backend. This package is deliberately outside its npm
workspaces and normal build/test commands. Installing TypeChat does not install
this experimental compiler or its WASM artifact.

## Current shipping blockers

The expanded stability investigation found an upstream Unicode conformance
failure: both the stable native backend and the pinned WASM backend reject a
valid string-enum value containing a lone surrogate immediately followed by
U+FEFF. The altered value without U+FEFF is also rejected. See
[microsoft/TypeScript#65458](https://github.com/microsoft/TypeScript/issues/65458).
This is a false rejection, not permission to widen the schema or accept arbitrary
strings.

The same failure was reproduced on an **untouched main snapshot** at
[`0ef51b0`](https://github.com/microsoft/TypeChat/commit/0ef51b05e6f9c0373870c2754070e7f12b470bf7),
using Node.js 24.22.1 and the normal TypeScript 7.0.2 backend. All 21 library
source/runtime-manifest files were checked against that commit, allowing only
Git's Windows line-ending conversion, then the original package was built.
The loader/refactor in this branch is therefore not the origin of the failure.
The leading-U+FEFF control passes; the lone-surrogate-plus-U+FEFF declared value
fails despite successful schema preflight.

[`tests/repro-unicode-enum.mjs`](./tests/repro-unicode-enum.mjs) is a standalone
reproduction for the existing upstream report. Copy it into the `typescript`
directory of a fresh TypeChat checkout at the commit above, then build and run
it **from that directory**:

```sh
npm ci
npm run build
node repro-unicode-enum.mjs
```

The script resolves TypeChat from the current checkout (not from the prototype),
prints the compiler versions, code units, preflight and validation results, then
exits nonzero when the declared value is rejected. It uses no WASM, model, or
credentials. This reproduction has been prepared; no new upstream comment or
pull request has been posted.

The two independent semantic regression checks remain **intentionally failing**
in `npm test`; native/WASM parity alone cannot catch a shared upstream defect.
Do not treat the earlier green corpus, or normal repository CI, as resolving
this blocker. No dependency upgrade, decoder patch, or validation bypass has
been applied.

The investigation also found and fixed a prototype lifetime bug: retaining a
closed validator previously retained its compiled module through the loader's
closure context. Validator closures are now constructed outside that context.
The regression inspects a strong heap-reference path rather than relying on a
garbage-collection timeout; it fails before the fix and passes afterwards.

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
The additional stability suite also asserts independently expected semantics;
it currently reports the two Unicode failures described above.

The latest combined run of the Node checks, hosting contracts, full three-engine
browser matrix, and opt-in recovery checks reported **34 passed, 2 failed,
0 skipped**. Only the two independently expected Unicode cases remain red.
The three recovery checks passed in Chromium, Firefox, and WebKit: seven workers
closed per engine, with no remaining abort listeners, page errors, or fetches for
the intentionally mismatched compiler. Ordinary `npm test` skips those optional
browser recovery checks unless explicitly enabled.

The ordinary repository build and 424-test suite were last verified successfully
with live tests disabled before this hosting-only follow-up; library sources and
dependency manifests have not changed in the hosting follow-up.
To repeat that focused recovery run in PowerShell:

```powershell
$env:TYPECHAT_STABILITY_BROWSERS = "1"
node --test --test-concurrency=1 --test-timeout=90000 --test-name-pattern="^stability: (chromium|firefox|webkit)" tests\stability.test.mjs
Remove-Item Env:\TYPECHAT_STABILITY_BROWSERS
```

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
The development server serves a verified, versioned WASM artifact with compression
and explicit cache rules. It remains a loopback example, not a deployment service
or a supported production hosting platform.

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

### Hosting and CSP contract

The demo and its browser tests use the same
[`examples/worker/host.mjs`](./examples/worker/host.mjs) handler:

- HTML, JavaScript, and CSS use `Cache-Control: no-store`. The WASM URL contains
  both the exact compiler version and the full artifact SHA-256, with
  `public, max-age=31536000, immutable`. Startup verifies the artifact before
  advertising that immutable URL.
- Gzip and identity representations preserve the exact artifact bytes.
  `Accept-Encoding` preferences/exclusions are honored, representation-specific
  ETags and `Vary: Accept-Encoding` prevent mixing encoded responses, and matching
  conditional requests return an empty `304`. `HEAD`, invalid encoding headers,
  unsupported methods, and missing asset versions have explicit responses.
- The HTML uses external scripts/styles. CSP permits same-origin scripts,
  workers, connections and styles, plus **`'wasm-unsafe-eval'` only** for WASM
  compilation. It does not enable JavaScript `'unsafe-eval'` or `'unsafe-inline'`.
  The worker script receives the policy too; removing WASM permission makes the
  job reject explicitly instead of falling back to another validator.
- This policy belongs to the example, not to the library API. Applications must
  deliberately review their HTTPS, CDN/CORS, model-endpoint, and embedding needs.
  Do not blindly broaden `connect-src` or add API secrets to client code.

Four HTTP contract tests and the three-engine hosted-page tests verify these
behaviors. JavaScript eval is checked from a real served page script, not debugger
evaluation that could bypass CSP. Existing validation/worker recovery suites also
use the shared handler; **13 changed-surface checks passed** on Windows.

Browser caching remains browser-controlled. In the recorded automated two-job
tests, Firefox reused the cached artifact; Chromium and WebKit fetched it again.
Every network representation was gzip (13,359,431 bytes), but immutable headers
do not guarantee storage, prevent eviction, or avoid compilation in a new worker.
These observations are not retail-browser cache guarantees.

## Recorded verification

On Windows and Node.js 24.22.1:

- After integrating main's opt-in live-test work, the normal library/examples
  built and all **424** ordinary tests passed with `TYPECHAT_LIVE_TESTS=0`,
  including CJS/ESM package/declaration tests and the existing enum regressions.
  The live API suite remained disabled; no hosted model was called.
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

The initial clean-install development-host run, before the lifetime follow-up,
measured:

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
128 MiB of linear memory for both the 100-property/100-validation main-thread
probe and the 500-property/250-validation worker probe. Agree target-device startup
and responsiveness budgets before
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

These Firefox numbers were obtained under Playwright's Juggler debugger. Further
investigation found that the installed debugger lacks the `allowUnobservedWasm`
setting, which can pin WASM to baseline compilation. Its frame actors are
registered before the command-line flag check and attach dedicated workers;
removing the Juggler launch flag alone did not remove the confound.

A bounded follow-up used the same installed Firefox 151.0 binary, compiler,
artifact, fixed built library, fresh profiles, and 500-property/250-validation
workload. Direct launches used no Playwright connection or devtools; the page
reported results to its loopback server:

| Firefox execution mode | Load/verify/compile | Initialization | Preflight | First validation | Warm validation mean | All 250 validations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Direct launch, dedicated worker | 829 ms | 104 ms | 35 ms | 91 ms | 76.09 ms | 19,040 ms |
| Playwright-attached, dedicated worker | 932 ms | 106 ms | 36 ms | 88 ms | 77.39 ms | 19,360 ms |
| Direct launch, unobserved service worker | 515 ms | 42 ms | 10 ms | 15 ms | 8.57 ms | 2,152 ms |

Installed Juggler excludes non-dedicated workers from its attachment hook. The
roughly 9x improvement in the unobserved case strongly supports a debugger
confound. **It also changes worker type**, so it is not a controlled single-setting
experiment or retail-Firefox/dedicated-worker certification. It is not a reason
to change the application example to a service worker. Do not present the original
automated ratio as an intrinsic Firefox production-performance result.

These are three successful workloads, not a statistical sample. The attached
control explicitly enabled both WASM JIT preferences after an earlier compile
failure; failed setup attempts contributed no timings. All accepted results and
untimed changed-value rejection/recovery controls passed. Each profile fetched
the raw artifact once over uncached loopback HTTP; host filesystem caches were
warm.

#### Retail Firefox dedicated-worker confirmation

A subsequent comparison used the official
[Mozilla Firefox 151.0 Windows x64 release](https://archive.mozilla.org/pub/firefox/releases/151.0/win64/en-US/Firefox%20Setup%20151.0.exe),
extracted into an owned temporary directory without installation. Its installer
matched Mozilla's SHA-512 manifest; the installer and executable had valid
Mozilla Corporation Authenticode signatures. The release resources contained no
Juggler code. No existing profile, Playwright connection, devtools, JIT override,
or sandbox change was used.

All three fresh profiles used the **same dedicated-worker workload** and the same
fixed built TypeChat library, compiler version, and verified WASM artifact:

| Retail Firefox run | Load/verify/compile | Initialization | First validation | Warm validation mean | All 250 validations |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 504 ms | 39 ms | 15 ms | 8.53 ms | 2,141 ms |
| 2 | 491 ms | 43 ms | 16 ms | 8.68 ms | 2,180 ms |
| 3 | 503 ms | 39 ms | 13 ms | 8.62 ms | 2,161 ms |

Preflight took 9 ms per run. Each run also rejected a changed string-valued
candidate, accepted its numeric replacement, rejected use after close, and
reported zero owned linear memory after close. The downloaded browser, profiles,
server, and helpers were removed afterwards.

**The approximately 19-second automated slowdown was not reproduced in retail
Firefox.** The 2,161 ms median supports a harness-confound explanation rather
than an intrinsic Firefox performance problem. Retail and Playwright had the same
151.0 version but different BuildIDs (`20260516144017` and `20260611193205`), so
this is not a pure single-setting causal experiment. It is three localhost runs
on one desktop, not a production latency guarantee, retail memory profile, mobile
result, or full retail-browser conformance certification.

The worker's linear-memory report returns zero after
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
memory alone. These samples also used the instrumented Playwright builds; retail
Firefox memory was not reprofiled. Other operating systems report this metric as
unavailable rather than substituting a misleading value.

A gzip-compressed compiler download was also delivered in 256 KiB chunks with
64 ms delays (nominally 4 MiB/s before backpressure). Loading, verifying, and
compiling it took roughly 4.0-4.5 seconds in these runs. This is a controlled local
transfer test, not a complete WAN simulation.

Only the browser-engine/OS combinations above were exercised. Playwright WebKit on
Windows is **not Safari certification**. macOS, mobile/low-memory devices, production
CSPs, and real edge runtimes remain unverified. The full existing native suite is
not yet a full browser matrix, and the retail Firefox probe is a focused workload
check rather than the full automated corpus.

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

**Recommendation: retain draft-only status, not supported browser functionality
or a mainline merge.** Mainline gates remain an
explicit upstream-stability/maintenance decision, review of the provisional API
and startup/memory costs on target devices,
resolution of the Unicode conformance failure, target-device/CSP coverage, and a
full regression/compatibility assessment.
The existing root-package Node-proxy bundling problem remains separate; this
package does not fix that public entry point or automatically resolve #534.
