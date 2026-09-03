<#
.SYNOPSIS
    Simulates MITRE ATT&CK T1547.001 (Boot or Logon Autostart Execution: Registry Run Keys) -
    adding a value under HKCU Run to auto-start a program at logon, then removes it (cleanup).

.NOTES
    Reference: Atomic Red Team T1547.001, Test #1 "Reg Key Run" (adapted to be fully self-cleaning
    and scoped to the current user's hive, never HKLM). Hand-written for the same reason as the
    other attacks/ scripts: full control over exactly what touches the system, see
    docs/decisions.md.

    Safe and non-destructive: HKCU only (no admin rights needed, no machine-wide effect), the
    value points at a harmless command, and it is deleted at the end of this script regardless of
    outcome. The key is never actually triggered (that would require a real logon cycle).

    Detection: Sysmon Event ID 13 (RegistryEvent - Value Set) logs the write under
    HKCU\...\Run. Wazuh's default Windows ruleset includes registry-run-key persistence rules.
#>

$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$valueName = "SOCTriageDemo"
$valueData = "cmd.exe /c echo T1547.001 simulated persistence"

try {
    Write-Host "[T1547.001] Writing registry Run key '$valueName' under $regPath..."
    Set-ItemProperty -Path $regPath -Name $valueName -Value $valueData -Force

    Start-Sleep -Seconds 2

    Write-Host "[T1547.001] Value written. Confirming:"
    Get-ItemProperty -Path $regPath -Name $valueName | Select-Object $valueName
}
finally {
    Write-Host "[T1547.001] Cleaning up: removing registry value '$valueName'..."
    Remove-ItemProperty -Path $regPath -Name $valueName -ErrorAction SilentlyContinue
    Write-Host "[T1547.001] Cleanup done."
}
