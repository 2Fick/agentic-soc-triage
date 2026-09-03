<#
.SYNOPSIS
    Simulates MITRE ATT&CK T1053.005 (Scheduled Task/Job: Scheduled Task) - creating a scheduled
    task as a persistence mechanism, then removes it (cleanup).

.NOTES
    Reference: Atomic Red Team T1053.005, Test #1 "Scheduled Task Startup Script" (adapted to be
    fully self-cleaning). Hand-written for the same reason as the other attacks/ scripts: full
    control over exactly what touches the system, see docs/decisions.md.

    Safe and non-destructive: the task action just runs `whoami.exe`, never actually triggers
    (created disabled / removed immediately after creation), and is deleted at the end of this
    script regardless of outcome.

    Detection: Sysmon Event ID 1 captures the schtasks.exe invocation and its command line.
    Wazuh's default Windows ruleset includes rules for scheduled task creation via schtasks.exe.
#>

$taskName = "SOC-Triage-Demo-T1053.005"

try {
    Write-Host "[T1053.005] Creating scheduled task '$taskName' (persistence simulation)..."
    schtasks.exe /Create /TN $taskName /TR "whoami.exe" /SC ONCE /ST 23:59 /F | Out-Null

    Start-Sleep -Seconds 2

    Write-Host "[T1053.005] Task created. Listing it to confirm:"
    schtasks.exe /Query /TN $taskName /FO LIST
}
finally {
    Write-Host "[T1053.005] Cleaning up: removing scheduled task '$taskName'..."
    schtasks.exe /Delete /TN $taskName /F | Out-Null
    Write-Host "[T1053.005] Cleanup done."
}
