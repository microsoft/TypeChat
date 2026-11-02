// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MAX_CONTEXT_BYTES, readJson, writeJson } from "./discussion-draft.mjs";
import { BUILD_LIMITS, applyCandidateFiles, requiredChecks } from "./issue-implementation.mjs";

export const TEST_IMAGE = "node:24.22.1-bookworm@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea";

function requireValue(condition, message) {
    if (!condition) throw new Error(message);
}

export function sandboxDockerfile(candidate) {
    const checks = requiredChecks(candidate);
    const lines = [`FROM ${TEST_IMAGE}`, "USER root", "WORKDIR /work", "COPY repository/ /work/"];
    if (checks.some(check => check.startsWith("python:"))) {
        lines.push(
            "RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && apt-get clean",
            "RUN python3 -m venv /opt/hatch && /opt/hatch/bin/pip install --no-cache-dir hatch",
            "ENV PATH=/opt/hatch/bin:$PATH",
            "RUN cd python && hatch env create && npm ci --ignore-scripts",
        );
    }
    if (checks.some(check => check.startsWith("typescript:"))) lines.push("RUN cd typescript && npm ci --ignore-scripts");
    if (checks.some(check => check.startsWith("site:"))) lines.push("RUN cd site && npm ci --ignore-scripts");
    lines.push("RUN chown -R 1000:1000 /work", "USER 1000:1000", "ENV HOME=/home/node",
        'ENTRYPOINT ["node", "tools/implementation-sandbox.mjs", "inside"]');
    return lines.join("\n") + "\n";
}

export function sandboxArguments(image, container, inputDirectory) {
    requireValue(/^typechat-check:[a-f0-9-]+$/.test(image) && /^typechat-check-[a-f0-9-]+$/.test(container),
        "Invalid owned sandbox identifiers.");
    requireValue(path.isAbsolute(inputDirectory) && !inputDirectory.includes(","), "Invalid sandbox input directory.");
    return ["run", "--name", container, "--network=none", "--cap-drop=ALL", "--security-opt=no-new-privileges",
        "--pids-limit=512", "--memory=6g", "--cpus=2", "--user=1000:1000",
        "--mount", `type=bind,source=${inputDirectory},target=/input,readonly`, image];
}

export function runIsolatedChecks(prepared, candidate, binding, repository, directory) {
    requireValue(fs.readFileSync(path.join(repository, ".nvmrc"), "utf8").trim() === "24.22.1",
        "The pinned test image must match the reviewed Node runtime.");
    const root = fs.mkdtempSync(path.join(directory, "typechat-check-"));
    const checkout = path.join(root, "repository");
    const inputs = path.join(root, "input");
    fs.mkdirSync(checkout);
    fs.mkdirSync(inputs);
    writeJson(inputs, "candidate.json", candidate);
    writeJson(inputs, "context.json", prepared);
    const archive = execFileSync("git", ["-C", repository, "archive", "--format=tar", prepared.source.commit,
        "README.md", ".nvmrc", "typescript", "python", "site", "tools/discussion-draft.mjs",
        "tools/issue-implementation.mjs", "tools/implementation-app.mjs", "tools/implementation-sandbox.mjs"],
        { maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(path.join(root, "source.tar"), archive);
    execFileSync("tar", ["-xf", path.join(root, "source.tar"), "-C", checkout]);
    fs.writeFileSync(path.join(root, "Dockerfile"), sandboxDockerfile(candidate));
    const suffix = randomUUID();
    const image = `typechat-check:${suffix}`;
    const container = `typechat-check-${suffix}`;
    const logPath = path.join(directory, "checks.log");
    let built = false;
    let attempted = false;
    let failure;
    function run(args, timeout) {
        const result = spawnSync("docker", args, { encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
        fs.appendFileSync(logPath, `$ docker ${args[0]}\n${result.stdout ?? ""}${result.stderr ?? ""}\n`);
        requireValue(!result.error && result.status === 0, `Isolated ${args[0]} failed or timed out; inspect checks.log.`);
    }
    try {
        run(["build", "--tag", image, "--file", path.join(root, "Dockerfile"), root], 40 * 60 * 1000);
        built = true;
        attempted = true;
        run(sandboxArguments(image, container, inputs), 30 * 60 * 1000);
    } catch (error) {
        failure = error;
    } finally {
        const errors = [];
        if (attempted) {
            const removed = spawnSync("docker", ["rm", "--force", container], { encoding: "utf8", timeout: 60000 });
            if (removed.error || removed.status !== 0 && !/No such container/i.test(removed.stderr ?? "")) {
                errors.push(new Error("Could not remove the owned test container."));
            }
        }
        if (built) {
            const removed = spawnSync("docker", ["image", "rm", "--force", image], { encoding: "utf8", timeout: 60000 });
            if (removed.error || removed.status !== 0) errors.push(new Error("Could not remove the owned test image."));
        }
        if (failure) errors.unshift(failure);
        if (errors.length) throw new AggregateError(errors, "Isolated validation or its cleanup failed; publication is blocked.");
    }
    return { version: 1, binding, commands: requiredChecks(candidate), conclusion: "success" };
}

function inside() {
    requireValue(!Object.keys(process.env).some(key => /^(?:GITHUB_TOKEN|GH_TOKEN|DEPENDABOT_APP_PRIVATE_KEY|DEPENDABOT_APP_ID|TYPECHAT_APP_PRIVATE_KEY|TYPECHAT_APP_ID|ACTIONS_RUNTIME_TOKEN|COPILOT_GITHUB_TOKEN)$/.test(key)),
        "Repository, artifact, or App credentials must not enter the test container.");
    const candidate = readJson("/input", "candidate.json", BUILD_LIMITS.candidateBytes);
    const prepared = readJson("/input", "context.json", MAX_CONTEXT_BYTES);
    requireValue(candidate.baseSha === prepared.source.commit, "The sandbox received the wrong patch origin.");
    applyCandidateFiles(candidate, "/work");
    for (const command of requiredChecks(candidate)) {
        if (command === "git diff --check") continue;
        const [directory, invocation] = command.split(": ");
        const [executable, ...args] = invocation.split(" ");
        const result = spawnSync(executable, args, { cwd: path.join("/work", directory), stdio: "inherit", timeout: 25 * 60 * 1000 });
        requireValue(!result.error && result.status === 0, `Deterministic check failed: ${command}`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    requireValue(process.argv[2] === "inside" && process.argv.length === 3, "This entry point is only for the isolated test container.");
    inside();
}
