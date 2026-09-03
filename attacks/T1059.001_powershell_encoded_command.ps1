<#
.SYNOPSIS
    Simulates MITRE ATT&CK T1059.001 (Command and Scripting Interpreter: PowerShell) -
    execution of a base64-encoded PowerShell command, the way real malware/attackers commonly
    obfuscate commands to evade naive string-based detection.

.NOTES
    Reference: Atomic Red Team T1059.001, Test #1 "PowerShell -EncodedCommand" (safe, no external
    download, no persistence). Hand-written here instead of installing the actual Atomic Red Team
    PowerShell module, for the same reason custom MCP servers were written instead of third-party
    packages (see docs/decisions.md): full control and auditability of exactly what runs on this
    machine.

    Safe and non-destructive: the encoded payload just writes a marker string to a local file
    under this repo's attacks/ folder, nothing touches the system beyond that.

    Detection: Sysmon Event ID 1 (process creation) logs the full command line, including the
    base64 blob. Wazuh's default Windows ruleset flags "-enc"/"-EncodedCommand" PowerShell
    invocations at a medium/high severity by default.
#>

$marker = Join-Path $PSScriptRoot "T1059.001-marker.txt"
$payload = "Set-Content -Path '$marker' -Value 'T1059.001 simulated execution - $(Get-Date -Format o)'"
$encodedPayload = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($payload))

Write-Host "[T1059.001] Running base64-encoded PowerShell command..."
powershell.exe -NoProfile -EncodedCommand $encodedPayload

if (Test-Path $marker) {
    Write-Host "[T1059.001] Marker file created: $marker"
} else {
    Write-Warning "[T1059.001] Marker file was not created - check execution policy."
}
