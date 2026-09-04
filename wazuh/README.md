# Wazuh manager (local single-node deployment)

Official single-node Docker deployment (`wazuh/wazuh-docker` 4.14.7), with three additions for this
project:

- `config/wazuh_cluster/wazuh_manager.conf`: an `<integration>` block that forwards every alert at
  level 10 or above to the n8n webhook.
- `config/local_rules.xml`: custom detection rules for the tested MITRE techniques, plus one
  false positive suppression.
- `integrations/custom-n8n(.py)`: the integration script that POSTs the alert JSON to n8n.

## Requirements

- Docker Desktop with the WSL2 backend, running.
- `vm.max_map_count >= 262144` on the WSL2 Linux engine, required by the OpenSearch indexer. Recent
  Docker Desktop versions set this already, otherwise:
  ```bash
  wsl -d docker-desktop sysctl -w vm.max_map_count=262144
  ```

## Start

```bash
# 1. Generate the internal SSL certificates (indexer / manager / dashboard)
docker compose -f generate-indexer-certs.yml run --rm generator

# 2. Bring the stack up
docker compose up -d

# 3. Deploy the n8n integration script into the container (see below for why)
./deploy-integration.sh

# 4. Deploy the custom rules and the shared agent config
./deploy-config.sh

# 5. Follow the logs during first startup (about a minute)
docker compose logs -f
```

The dashboard is at https://localhost, with a self-signed certificate so the browser warning is
expected. Default credentials are `admin` / `SecretPassword`, see the security note at the bottom.

### Why the deploy scripts instead of bind mounts

`integrations/custom-n8n(.py)` lives in the repo but is **not** mounted directly into the container.
Docker Desktop bind mounts from a Windows drive make files world-writable, and `wazuh-integratord`
refuses to run a world-writable script (`ERROR: file 'integrations/custom-n8n' has write
permissions`). `deploy-integration.sh` copies the script into the named volume with correct
permissions (`750`) and restarts the manager. Rerun it after any change to `custom-n8n.py`.

`deploy-config.sh` does the same for `local_rules.xml` and the shared `agent.conf`, which live
inside the `wazuh_etc` named volume and are distributed to agents by the manager at runtime. Rerun
it after any change to either file, then restart the agent service so it picks up the new shared
config.

## Checking the integration works

```bash
docker compose exec wazuh.manager tail -f /var/ossec/logs/integrations.log
```

A line reading `OK sent alert id=... rule=... -> HTTP 200` should appear for every alert at level 10
or above, once the n8n workflow is listening on `http://localhost:5678/webhook/wazuh-alert`.

## Wazuh agent and Sysmon

Both are installed on the Windows host that generates the telemetry.

**Sysmon**, using the well-known [SwiftOnSecurity
configuration](https://github.com/SwiftOnSecurity/sysmon-config) vendored in `sysmon/`:

```
Sysmon64.exe -accepteula -i path\to\sysmon\sysmonconfig.xml
```

**Wazuh agent**, pointing at the local manager:

```
msiexec.exe /i wazuh-agent-4.14.7-1.msi /q WAZUH_MANAGER="127.0.0.1" WAZUH_REGISTRATION_SERVER="127.0.0.1"
net start WazuhSvc
```

Sysmon events are not collected by default. The shared `config/agent.conf` adds the
`Microsoft-Windows-Sysmon/Operational` channel, which is why `deploy-config.sh` has to run before
the agent will report anything useful.

Check the agent is connected with:

```bash
docker compose exec wazuh.manager /var/ossec/bin/agent_control -l
```

## Noisy modules are off

Compliance scanning (SCA) and vulnerability detection are disabled, both on the manager
(`ossec.conf`) and on the agent (`config/agent.conf`). Each raises one alert per failed check or per
CVE, hundreds within minutes, all above the webhook threshold. Turning either back on without a
tighter integration filter will flood the triage pipeline. See `docs/decisions.md`.

## Security note

The default passwords (`SecretPassword`, `kibanaserver`, `MyS3cr37P450r.*-`) are the ones shipped by
the official Wazuh repository for first startup. This deployment stays on localhost and is never
exposed, so they are left as they are. Change them with `wazuh-passwords-tool` before exposing
anything beyond `localhost`.
