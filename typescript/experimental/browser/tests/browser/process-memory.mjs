import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function sampleBrowserMemory(processId) {
    if (process.platform !== "win32") {
        return { supported: false, reason: "Process-tree working-set sampling is implemented only for Windows." };
    }
    if (!Number.isSafeInteger(processId) || processId <= 0) {
        throw new Error("Expected the PID of the test-owned browser process.");
    }
    const script = `
$ErrorActionPreference = 'Stop'
$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize)
$ids = [System.Collections.Generic.HashSet[uint32]]::new()
$null = $ids.Add(${processId})
do {
    $added = $false
    foreach ($process in $processes) {
        if ($ids.Contains($process.ParentProcessId) -and $ids.Add($process.ProcessId)) { $added = $true }
    }
} while ($added)
$owned = @($processes | Where-Object { $ids.Contains($_.ProcessId) })
if (-not ($owned | Where-Object { $_.ProcessId -eq ${processId} })) { throw 'Browser process no longer exists.' }
[pscustomobject]@{
    supported = $true
    processCount = $owned.Count
    workingSetSumBytes = [long](($owned | Measure-Object WorkingSetSize -Sum).Sum)
} | ConvertTo-Json -Compress
`;
    const { stdout } = await execute("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 1024 * 1024
    });
    const result = JSON.parse(stdout);
    if (!Number.isFinite(result.workingSetSumBytes) || result.workingSetSumBytes <= 0) {
        throw new Error("The browser process-memory sample was invalid.");
    }
    return result;
}
