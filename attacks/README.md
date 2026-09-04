# Attack simulation

Three PowerShell scripts, each simulating one MITRE ATT&CK technique, written by hand against the
matching Atomic Red Team test definition rather than installing the Atomic Red Team framework
itself. Same reasoning as the custom MCP servers: full control over exactly what runs on the
machine, and something worth understanding rather than executing blindly.

| Script | Technique | Expected detection |
|---|---|---|
| `T1059.001_powershell_encoded_command.ps1` | Command and Scripting Interpreter: PowerShell | Sysmon event ID 1, base64 encoded command line |
| `T1053.005_scheduled_task_persistence.ps1` | Scheduled Task/Job | Sysmon event ID 1, `schtasks.exe` invocation |
| `T1547.001_registry_run_key_persistence.ps1` | Boot or Logon Autostart: Registry Run Keys | Sysmon event ID 13, write under `HKCU\...\Run` |

Each run produces exactly one level 12 alert, tagged with the matching technique.

## Safety

Every script is non-destructive and cleans up after itself:

- No administrator rights needed, the registry is only touched under `HKCU`.
- No downloads, no changes beyond what the table above describes.
- The scheduled task and the registry value are removed straight after creation, including on error
  (`finally` block).

## Requirements

- Wazuh agent installed and connected on this machine, see `wazuh/README.md`.
- Sysmon installed with the configuration in `sysmon/`.
- Custom rules deployed with `wazuh/deploy-config.sh`.

## Run

```powershell
cd attacks
.\T1059.001_powershell_encoded_command.ps1
.\T1053.005_scheduled_task_persistence.ps1
.\T1547.001_registry_run_key_persistence.ps1
```

## Check the detection

```bash
# On the Wazuh manager: alerts raised by the Windows agent
cd wazuh
docker compose exec wazuh.manager tail -f /var/ossec/logs/alerts/alerts.log

# And what was forwarded to n8n
docker compose exec wazuh.manager tail -f /var/ossec/logs/integrations.log
```

A Slack message with the agent's verdict should follow shortly after.
