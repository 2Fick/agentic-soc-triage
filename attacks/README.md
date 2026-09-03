# Simulation d'attaque

Trois scripts PowerShell, écrits maison (voir `docs/decisions.md` pour le raisonnement : mêmes
motifs que pour les serveurs MCP), chacun simulant une technique MITRE ATT&CK reconnue, en
référence à un test Atomic Red Team précis, mais sans installer le framework Atomic Red Team
lui-même.

| Script | Technique | Détection attendue |
|---|---|---|
| `T1059.001_powershell_encoded_command.ps1` | Command and Scripting Interpreter: PowerShell | Sysmon Event ID 1 (process creation), commande encodée en base64 |
| `T1053.005_scheduled_task_persistence.ps1` | Scheduled Task/Job | Sysmon Event ID 1, invocation de `schtasks.exe` |
| `T1547.001_registry_run_key_persistence.ps1` | Registry Run Keys | Sysmon Event ID 13 (RegistryEvent), écriture sous `HKCU\...\Run` |

## Sécurité

Chaque script est non destructif et se nettoie lui-même (bloc `finally` pour les deux derniers) :
- Aucun droit administrateur requis (le registre est modifié uniquement sous `HKCU`).
- Aucun téléchargement, aucune modification hors de ce qui est explicitement listé ci-dessus.
- La tâche planifiée / la clé de registre sont supprimées immédiatement après création, dans tous
  les cas (même en cas d'erreur).

## Prérequis

- Agent Wazuh installé et connecté sur cette machine (voir `PLAN.md` Phase 4).
- Sysmon installé avec la config `sysmon/sysmonconfig.xml`.

## Exécution

```powershell
cd attacks
.\T1059.001_powershell_encoded_command.ps1
.\T1053.005_scheduled_task_persistence.ps1
.\T1547.001_registry_run_key_persistence.ps1
```

## Vérifier la détection

```bash
# Sur le manager Wazuh : voir les alertes générées par l'agent Windows
cd wazuh
docker compose exec wazuh.manager tail -f /var/ossec/logs/alerts/alerts.log
```

Puis vérifier que le pipeline complet a réagi : `docker compose exec wazuh.manager tail -f
/var/ossec/logs/integrations.log` doit montrer l'alerte transmise à n8n, et un message doit
apparaître sur Slack avec le verdict de l'agent Gemini.
