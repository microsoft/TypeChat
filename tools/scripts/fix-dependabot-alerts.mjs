#!/usr/bin/env node
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Automated Dependabot alert remediator for the TypeChat (npm) workspace.
 *
 * Strategy per alert, applied in order until one succeeds (or all fail):
 *
 *   1. Plain version bump via ``npm update <pkg> --package-lock-only``.
 *      Sufficient for direct deps and most transitives whose parents
 *      accept a higher version under their declared semver range.
 *   2. ``overrides`` entry added to ``package.json`` and another
 *      ``npm install --package-lock-only`` pass. Forces a safe version
 *      even when no parent's range admits it. Used only when (1) leaves
 *      vulnerable instances behind.
 *
 * After each attempt the script re-parses ``package-lock.json`` and
 * verifies every resolved instance of the package is ≥ the advisory's
 * first_patched_version. If any vulnerable instance remains the attempt
 * is treated as failed.
 *
 * On a successful fix the workspace is reinstalled deterministically
 * with ``npm ci``, then built (optionally tested) to catch breakages
 * introduced by the upgrade. On any failure — install, build, test, or
 * verification — the script restores ``package.json`` and
 * ``package-lock.json`` from backups and records the failure in a
 * persistent rollback-state file. Future runs skip recently-rolled-back
 * packages (default 7 day cooldown) so the same broken upgrade isn't
 * re-proposed each night.
 *
 * Run modes:
 *   node tools/scripts/fix-dependabot-alerts.mjs                # analyze
 *   node tools/scripts/fix-dependabot-alerts.mjs --auto-fix     # apply
 *   node tools/scripts/fix-dependabot-alerts.mjs --show-chains  # explain
 *
 * Auth: reads alerts via ``gh api repos/<owner>/<repo>/dependabot/alerts``
 * which requires a token with ``security_events`` (org-owned repo) or
 * a GitHub App installation token. In CI, the workflow mints the latter.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// ── Configuration ────────────────────────────────────────────────────────
//
// Workspaces (relative to REPO_ROOT) the script knows how to manage.
// Each entry must have its own ``package-lock.json``; transitive overrides
// are written into that workspace's ``package.json``.
const WORKSPACES = [
    { name: "typescript", dir: "typescript" },
];

const RUN_TEMP = process.env.RUNNER_TEMP || tmpdir();
const ROLLBACK_STATE_PATH =
    process.env.DEP_ROLLBACK_STATE_PATH ||
    join(RUN_TEMP, "fix-dependabot-alerts-rollback-state.json");
const ROLLBACK_COOLDOWN_DAYS = Number(
    process.env.DEP_ROLLBACK_COOLDOWN_DAYS || 7,
);

// ── Args ─────────────────────────────────────────────────────────────────

const ARGS = parseArgs(process.argv.slice(2));
const DRY_RUN = !ARGS.has("auto-fix");
const SHOW_CHAINS = ARGS.has("show-chains");
const SKIP_TESTS = ARGS.has("skip-tests");
const VERBOSE = ARGS.has("verbose");

function parseArgs(argv) {
    const flags = new Set();
    for (const a of argv) {
        if (a.startsWith("--")) flags.add(a.slice(2).split("=")[0]);
    }
    return flags;
}

// ── Logging ──────────────────────────────────────────────────────────────

const log = (...args) => console.log(...args);
const dbg = (...args) => VERBOSE && console.log("[debug]", ...args);
const warn = (...args) => console.warn("⚠️ ", ...args);
const err = (...args) => console.error("❌", ...args);

// Sensitive env vars that must NOT leak into npm child processes —
// build/test scripts can execute arbitrary code from newly-installed
// dependencies, so we strip authentication before invoking them.
const SENSITIVE_ENV_VARS = [
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "NPM_TOKEN",
    "NODE_AUTH_TOKEN",
    "DEPENDABOT_APP_PRIVATE_KEY",
];
function sanitizedEnv() {
    const e = { ...process.env };
    for (const k of SENSITIVE_ENV_VARS) delete e[k];
    return e;
}

// ── Shell helpers ────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
    // ``shell: true`` is only needed for tools installed as ``.cmd`` /
    // ``.ps1`` shims on Windows (npm, pnpm). Real ``.exe`` tools (gh,
    // git, node) must NOT use ``shell: true`` on Windows, because cmd.exe
    // then interprets shell metacharacters like ``&`` in URLs.
    const needsShell =
        opts.shell ??
        (process.platform === "win32" && /^(npm|pnpm|yarn|npx)$/i.test(cmd));
    dbg("$", cmd, args.join(" "), "  (cwd:", opts.cwd || process.cwd(), ")");
    const r = spawnSync(cmd, args, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        ...opts,
        shell: needsShell,
    });
    return {
        ok: r.status === 0,
        code: r.status,
        stdout: r.stdout || "",
        stderr: r.stderr || "",
    };
}

function mustRun(cmd, args, opts = {}) {
    const r = run(cmd, args, opts);
    if (!r.ok) {
        err(`${cmd} ${args.join(" ")} failed (exit ${r.code})`);
        if (r.stdout) console.error(r.stdout);
        if (r.stderr) console.error(r.stderr);
        process.exit(1);
    }
    return r;
}

// ── Semver (minimal — just compare a.b.c) ────────────────────────────────
//
// Sufficient for "is resolved version >= first_patched_version" checks.
// We deliberately avoid pulling in the ``semver`` package so this script
// can run before any ``node_modules`` are installed.

function parseSemver(v) {
    if (!v) return null;
    const m = String(v).match(/^v?(\d+)\.(\d+)\.(\d+)/);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function semverGte(a, b) {
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    if (!pa || !pb) return false;
    for (let i = 0; i < 3; i++) {
        if (pa[i] > pb[i]) return true;
        if (pa[i] < pb[i]) return false;
    }
    return true;
}

// ── Dependabot alerts ────────────────────────────────────────────────────

function fetchAlerts(repo) {
    const r = run("gh", [
        "api",
        "--paginate",
        `repos/${repo}/dependabot/alerts?state=open&per_page=100`,
    ]);
    if (!r.ok) {
        err("Failed to fetch Dependabot alerts via gh CLI.");
        err(r.stderr.trim());
        process.exit(1);
    }
    // --paginate concatenates JSON arrays as ``][`` between pages.
    const raw = r.stdout.trim();
    if (!raw) return [];
    const joined = "[" + raw.replace(/\]\s*\[/g, ",").slice(1, -1) + "]";
    try {
        return JSON.parse(joined);
    } catch (e) {
        err("Could not parse gh paginated JSON:", e.message);
        process.exit(1);
    }
}

/**
 * Group raw alerts by ``(workspace, package)``. Returns a map
 * ``{ "<wsName>/<pkg>": { workspace, pkg, ecosystem, minVersion,
 *   severity, alerts: [...] } }``. ``minVersion`` is the highest
 * ``first_patched_version`` across this package's open alerts — i.e.
 * the lowest version that resolves *all* known advisories.
 */
function groupAlerts(alerts) {
    const groups = new Map();
    let skippedNonNpm = 0;
    const skippedManifests = new Set();
    for (const a of alerts) {
        const eco = a.dependency?.package?.ecosystem;
        const pkg = a.dependency?.package?.name;
        const mp = a.dependency?.manifest_path;
        if (eco !== "npm" || !pkg || !mp) {
            skippedNonNpm++;
            continue;
        }

        // Map the alert's manifest_path to one of our known workspaces.
        // Dependabot reports the manifest where the dep is declared,
        // which for transitive vulns in our example workspaces will be
        // e.g. ``typescript/examples/foo/package.json``. The root
        // ``typescript/package-lock.json`` is the single source of truth
        // for resolutions, so we collapse all paths under ``typescript/``
        // to the ``typescript`` workspace; non-matching paths are logged
        // so a future ecosystem (e.g. python/, site/) doesn't no-op
        // silently.
        const ws = WORKSPACES.find((w) => {
            if (
                mp === `${w.dir}/package-lock.json` ||
                mp === `${w.dir}/package.json`
            ) {
                return true;
            }
            return (
                mp.startsWith(`${w.dir}/`) &&
                (mp.endsWith("/package.json") ||
                    mp.endsWith("/package-lock.json"))
            );
        });
        if (!ws) {
            skippedManifests.add(mp);
            continue;
        }

        const patched =
            a.security_vulnerability?.first_patched_version?.identifier;
        const key = `${ws.name}|${pkg}`;
        if (!groups.has(key)) {
            groups.set(key, {
                workspace: ws,
                pkg,
                ecosystem: eco,
                minVersion: patched || null,
                severity: a.security_advisory?.severity || "unknown",
                alerts: [],
            });
        }
        const g = groups.get(key);
        g.alerts.push(a);
        if (patched && (!g.minVersion || semverGte(patched, g.minVersion))) {
            g.minVersion = patched;
        }
        // Track worst severity (high > medium > low).
        const sevRank = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };
        if (
            sevRank[a.security_advisory?.severity] >
            sevRank[g.severity]
        ) {
            g.severity = a.security_advisory.severity;
        }
    }
    if (skippedManifests.size > 0) {
        warn(
            `Ignored ${skippedManifests.size} alert manifest(s) outside known workspaces: ${[...skippedManifests].sort().join(", ")}`,
        );
    }
    if (skippedNonNpm > 0) {
        dbg(`Ignored ${skippedNonNpm} non-npm or malformed alert(s)`);
    }
    return [...groups.values()];
}

// ── Lockfile inspection ──────────────────────────────────────────────────
//
// npm v7+ writes a flat ``packages`` map keyed by install path. Each entry
// has a ``version`` field — that's the resolved version. We collect every
// resolved version for a package across the lockfile so the verifier can
// confirm *all* instances are above the advisory threshold.

function getResolvedVersions(workspaceDir, pkg) {
    const lockPath = join(REPO_ROOT, workspaceDir, "package-lock.json");
    if (!existsSync(lockPath)) return [];
    let lock;
    try {
        lock = JSON.parse(readFileSync(lockPath, "utf8"));
    } catch {
        return [];
    }
    const versions = new Set();
    const packages = lock.packages || {};
    // The flat packages map keys look like ``node_modules/<pkg>`` for the
    // top-level install, ``node_modules/<parent>/node_modules/<pkg>`` for
    // nested, and ``"<workspaceName>"`` (no node_modules prefix) for the
    // workspace itself. We just need entries whose key ends in
    // ``node_modules/<pkg>``.
    const suffix = `node_modules/${pkg}`;
    for (const [path, info] of Object.entries(packages)) {
        if (path === suffix || path.endsWith(`/${suffix}`)) {
            if (info?.version) versions.add(info.version);
        }
    }
    return [...versions];
}

function verifyAllVersionsFixed(workspaceDir, pkg, minVersion) {
    const versions = getResolvedVersions(workspaceDir, pkg);
    if (versions.length === 0) {
        return { ok: false, reason: "package not found in lockfile" };
    }
    const unfixed = versions.filter((v) => !semverGte(v, minVersion));
    return {
        ok: unfixed.length === 0,
        versions,
        unfixed,
    };
}

// ── Backup / restore ─────────────────────────────────────────────────────

function backupWorkspace(workspaceDir) {
    const wsRoot = join(REPO_ROOT, workspaceDir);
    const pkgBak = join(RUN_TEMP, "tc-pkg-backup.json");
    const lockBak = join(RUN_TEMP, "tc-lock-backup.json");
    copyFileSync(join(wsRoot, "package.json"), pkgBak);
    if (existsSync(join(wsRoot, "package-lock.json"))) {
        copyFileSync(join(wsRoot, "package-lock.json"), lockBak);
    }
    return { pkgBak, lockBak, wsRoot };
}

function restoreWorkspace({ pkgBak, lockBak, wsRoot }) {
    // Restore files only. Do NOT re-run ``npm install`` here — that
    // would re-resolve and potentially re-introduce drift.
    copyFileSync(pkgBak, join(wsRoot, "package.json"));
    if (existsSync(lockBak)) {
        copyFileSync(lockBak, join(wsRoot, "package-lock.json"));
    }
}

// ── Rollback state ───────────────────────────────────────────────────────

function loadRollbackState() {
    if (!existsSync(ROLLBACK_STATE_PATH)) {
        return { version: 1, rollbacks: {} };
    }
    try {
        return JSON.parse(readFileSync(ROLLBACK_STATE_PATH, "utf8"));
    } catch {
        return { version: 1, rollbacks: {} };
    }
}

function saveRollbackState(state) {
    writeFileSync(ROLLBACK_STATE_PATH, JSON.stringify(state, null, 2));
}

function lockSha(workspaceDir) {
    const p = join(REPO_ROOT, workspaceDir, "package-lock.json");
    if (!existsSync(p)) return "no-lock";
    const r = run("git", ["hash-object", p]);
    return r.ok ? r.stdout.trim() : "unknown";
}

function isRecentlyRolledBack(state, key, currentSha) {
    const e = state.rollbacks?.[key];
    if (!e) return null;
    if (e.lockSha !== currentSha) return null;
    const ageSec = Math.floor(Date.now() / 1000) - e.timestamp;
    if (ageSec > ROLLBACK_COOLDOWN_DAYS * 86400) return null;
    return { ageDays: Math.floor(ageSec / 86400), reason: e.reason };
}

function recordRollback(state, key, reason, currentSha) {
    state.rollbacks ||= {};
    state.rollbacks[key] = {
        lockSha: currentSha,
        timestamp: Math.floor(Date.now() / 1000),
        reason,
    };
}

function clearRollback(state, key) {
    if (state.rollbacks?.[key]) delete state.rollbacks[key];
}

function pruneRollbacks(state) {
    const cutoff =
        Math.floor(Date.now() / 1000) - ROLLBACK_COOLDOWN_DAYS * 86400;
    for (const [k, v] of Object.entries(state.rollbacks || {})) {
        if (v.timestamp < cutoff) delete state.rollbacks[k];
    }
}

// ── Fix attempts ─────────────────────────────────────────────────────────
//
// Each returns ``{ ok, method, reason? }``. ``method`` records which
// strategy actually worked so the PR body can disclose ``overrides``
// usage explicitly (these are policy-relevant — they pin a version that
// would not otherwise be reachable from the natural dependency graph).

function attemptUpdate(workspaceDir, pkg, minVersion) {
    const wsRoot = join(REPO_ROOT, workspaceDir);
    const r = run(
        "npm",
        ["update", pkg, "--package-lock-only", "--no-audit", "--no-fund"],
        { cwd: wsRoot },
    );
    if (!r.ok) {
        return {
            ok: false,
            method: "update",
            reason: `npm update failed: ${(r.stderr || r.stdout)
                .split("\n")
                .filter(Boolean)
                .pop()}`,
        };
    }
    const v = verifyAllVersionsFixed(workspaceDir, pkg, minVersion);
    if (v.ok) {
        return { ok: true, method: "update" };
    }
    return {
        ok: false,
        method: "update",
        reason: `unfixed versions remain: ${v.unfixed.join(", ") || "(not found)"}`,
    };
}

function attemptOverride(workspaceDir, pkg, minVersion) {
    const wsRoot = join(REPO_ROOT, workspaceDir);
    const pkgPath = join(wsRoot, "package.json");
    const pkgJson = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkgJson.overrides ||= {};
    pkgJson.overrides[pkg] = `>=${minVersion}`;
    writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 4) + "\n");
    const r = run(
        "npm",
        ["install", "--package-lock-only", "--no-audit", "--no-fund"],
        { cwd: wsRoot },
    );
    if (!r.ok) {
        return {
            ok: false,
            method: "override",
            reason: `npm install (with override) failed: ${(r.stderr || r.stdout)
                .split("\n")
                .filter(Boolean)
                .pop()}`,
        };
    }
    const v = verifyAllVersionsFixed(workspaceDir, pkg, minVersion);
    if (v.ok) {
        return { ok: true, method: "override" };
    }
    return {
        ok: false,
        method: "override",
        reason: `override applied but vulnerable versions still resolved: ${v.unfixed.join(", ")}`,
    };
}

function buildAndTest(workspaceDir) {
    const wsRoot = join(REPO_ROOT, workspaceDir);
    // Scrub auth tokens from the environment before running anything
    // that executes dependency code (build/test). ``npm ci`` itself runs
    // with ``--ignore-scripts``, but ``npm run build`` invokes our own
    // tsc which loads dependency packages, and ``npm test`` executes
    // arbitrary test code.
    const env = sanitizedEnv();
    // ``npm ci`` materialises the exact lockfile we just wrote so the
    // build sees the new versions rather than a stale ``node_modules``.
    // ``--ignore-scripts`` skips lifecycle hooks (notably ``prepare``,
    // which re-runs ``build-all`` and would double up the build below).
    const ci = run(
        "npm",
        ["ci", "--no-audit", "--no-fund", "--ignore-scripts"],
        { cwd: wsRoot, env },
    );
    if (!ci.ok) {
        return { ok: false, phase: "install", output: ci.stderr || ci.stdout };
    }
    const build = run("npm", ["run", "build"], { cwd: wsRoot, env });
    if (!build.ok) {
        return {
            ok: false,
            phase: "build",
            output: build.stderr || build.stdout,
        };
    }
    if (!SKIP_TESTS) {
        const test = run("npm", ["test"], { cwd: wsRoot, env });
        if (!test.ok) {
            return {
                ok: false,
                phase: "test",
                output: test.stderr || test.stdout,
            };
        }
    }
    return { ok: true };
}

// ── Main fix loop ────────────────────────────────────────────────────────

function applyFix(group, state) {
    const { workspace, pkg, minVersion, severity } = group;
    const key = `${workspace.name}|${pkg}`;
    const currentSha = lockSha(workspace.dir);

    log("");
    log(
        `▶  ${pkg} (${severity}, ${group.alerts.length} alert${group.alerts.length === 1 ? "" : "s"})  →  ≥ ${minVersion || "?"}`,
    );

    if (!minVersion) {
        log(
            `   skipped: no first_patched_version on advisory (likely awaiting upstream fix)`,
        );
        return { status: "no_patch", pkg, severity };
    }

    const cooldown = isRecentlyRolledBack(state, key, currentSha);
    if (cooldown) {
        log(
            `   skipped: rolled back ${cooldown.ageDays}d ago against same lockfile (reason: ${cooldown.reason})`,
        );
        return { status: "skipped_cooldown", pkg, severity };
    }

    if (DRY_RUN) {
        const current = getResolvedVersions(workspace.dir, pkg);
        log(`   dry-run: would attempt fix. Current resolved: ${current.join(", ") || "(not installed)"}`);
        return { status: "would_fix", pkg, severity };
    }

    const backup = backupWorkspace(workspace.dir);
    let lastUnfixableReason = null;

    for (const attempt of [attemptUpdate, attemptOverride]) {
        const r = attempt(workspace.dir, pkg, minVersion);
        if (!r.ok) {
            log(`   ${r.method}: ${r.reason}`);
            // The fix attempt itself didn't lift the resolved version
            // above the advisory. Restore so the next strategy starts
            // from a clean baseline. No rollback cooldown is recorded
            // because nothing actually broke — we just couldn't make
            // npm pick a safe version.
            lastUnfixableReason = `${r.method}: ${r.reason}`;
            restoreWorkspace(backup);
            continue;
        }
        log(`   ${r.method}: lockfile-level fix applied`);

        const v = buildAndTest(workspace.dir);
        if (v.ok) {
            log(`   ✓ verified (install + build${SKIP_TESTS ? "" : " + test"})`);
            clearRollback(state, key);
            return {
                status: "applied",
                pkg,
                severity,
                method: r.method,
                minVersion,
            };
        }

        // A real rollback: the fix took, but the workspace no longer
        // builds/tests. Record so the same broken upgrade isn't tried
        // again until cooldown expires or the lockfile changes.
        log(`   ✗ ${v.phase} failed after ${r.method}; rolling back`);
        if (VERBOSE && v.output) {
            console.log(v.output.slice(0, 4000));
        }
        restoreWorkspace(backup);
        recordRollback(state, key, `${v.phase} failed (${r.method})`, currentSha);
        return { status: "rolled_back", pkg, severity, phase: v.phase };
    }

    return {
        status: "unfixable",
        pkg,
        severity,
        reason: lastUnfixableReason || "all fix strategies exhausted",
    };
}

// ── Reporting ────────────────────────────────────────────────────────────

function bucket(results) {
    const b = {
        applied: [],
        rolled_back: [],
        unfixable: [],
        no_patch: [],
        skipped_cooldown: [],
        would_fix: [],
    };
    for (const r of results) (b[r.status] ||= []).push(r);
    return b;
}

function printSummary(b, totals) {
    log("");
    log("─── Summary ───────────────────────────────────────────────");
    log(`  Total alerts:     ${totals.alerts}`);
    log(`  Distinct pkgs:    ${totals.packages}`);
    log(`  Applied:          ${b.applied.length}${b.applied.length ? " — " + b.applied.map((r) => `${r.pkg}(${r.method})`).join(" ") : ""}`);
    log(`  Rolled back:      ${b.rolled_back.length}${b.rolled_back.length ? " — " + b.rolled_back.map((r) => `${r.pkg}(${r.phase})`).join(" ") : ""}`);
    log(`  Unfixable:        ${b.unfixable.length}${b.unfixable.length ? " — " + b.unfixable.map((r) => r.pkg).join(" ") : ""}`);
    log(`  No patch yet:     ${b.no_patch.length}${b.no_patch.length ? " — " + b.no_patch.map((r) => r.pkg).join(" ") : ""}`);
    log(`  Cooldown skipped: ${b.skipped_cooldown.length}${b.skipped_cooldown.length ? " — " + b.skipped_cooldown.map((r) => r.pkg).join(" ") : ""}`);
    if (DRY_RUN) {
        log(`  Would attempt:    ${b.would_fix.length}${b.would_fix.length ? " — " + b.would_fix.map((r) => r.pkg).join(" ") : ""}`);
    }
}

/**
 * Emit step outputs the workflow uses to build the PR body. Written as
 * key=value lines to ``$GITHUB_OUTPUT`` when running in Actions, or stdout
 * otherwise.
 */
function writeStepOutputs(b, totals) {
    const out = process.env.GITHUB_OUTPUT;
    const lines = [
        `total_alerts=${totals.alerts}`,
        `applied_count=${b.applied.length}`,
        `applied_packages=${b.applied.map((r) => r.pkg).join(" ")}`,
        `applied_overrides=${b.applied.filter((r) => r.method === "override").map((r) => r.pkg).join(" ")}`,
        `rolled_back_count=${b.rolled_back.length}`,
        `rolled_back_packages=${b.rolled_back.map((r) => r.pkg).join(" ")}`,
        `unfixable_count=${b.unfixable.length}`,
        `unfixable_packages=${b.unfixable.map((r) => r.pkg).join(" ")}`,
        `no_patch_count=${b.no_patch.length}`,
        `no_patch_packages=${b.no_patch.map((r) => r.pkg).join(" ")}`,
        `cooldown_count=${b.skipped_cooldown.length}`,
        `cooldown_packages=${b.skipped_cooldown.map((r) => r.pkg).join(" ")}`,
        `changes=${b.applied.length > 0 ? "true" : "false"}`,
    ];
    if (out) {
        writeFileSync(out, lines.join("\n") + "\n", { flag: "a" });
    } else if (VERBOSE) {
        log("");
        log("--- step outputs ---");
        for (const l of lines) log(l);
    }
}

// ── Optional: dependency chain output for blocked transitives ────────────

function showChains(groups) {
    log("");
    log("─── Dependency chains for blocked / unfixed packages ───────");
    for (const g of groups) {
        log("");
        log(`◆  ${g.pkg}  (advisory ≥ ${g.minVersion || "n/a"})`);
        const r = run("npm", ["ls", g.pkg, "--all"], {
            cwd: join(REPO_ROOT, g.workspace.dir),
        });
        log(r.stdout.split("\n").slice(0, 60).join("\n"));
    }
}

// ── Entry point ──────────────────────────────────────────────────────────

function main() {
    const repo =
        process.env.GITHUB_REPOSITORY ||
        process.env.DEP_REPO ||
        "microsoft/TypeChat";

    log(`Repo:       ${repo}`);
    log(`Mode:       ${DRY_RUN ? "analyze (dry-run)" : "auto-fix"}`);
    log(`State file: ${ROLLBACK_STATE_PATH}`);

    const alerts = fetchAlerts(repo);
    log(`Fetched ${alerts.length} open alerts`);

    const groups = groupAlerts(alerts);
    log(`Grouped into ${groups.length} distinct (workspace, package) pairs`);

    if (SHOW_CHAINS) {
        showChains(groups);
        return;
    }

    const state = loadRollbackState();
    pruneRollbacks(state);

    const results = [];
    for (const g of groups) {
        results.push(applyFix(g, state));
    }

    if (!DRY_RUN) {
        saveRollbackState(state);
    }

    const b = bucket(results);
    printSummary(b, { alerts: alerts.length, packages: groups.length });
    writeStepOutputs(b, { alerts: alerts.length, packages: groups.length });

    // Exit non-zero if any rollback happened — informs the workflow that
    // human attention is warranted even though the PR (if any) is valid.
    if (b.rolled_back.length > 0) {
        warn(
            `${b.rolled_back.length} package(s) rolled back; their alerts remain open.`,
        );
    }
    if (b.unfixable.length > 0) {
        warn(
            `${b.unfixable.length} package(s) could not be lifted to a safe version by lockfile updates or root overrides (likely require parent-package upgrades). Their alerts remain open.`,
        );
    }
}

main();
