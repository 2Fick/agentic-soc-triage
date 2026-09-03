#!/usr/bin/env bash
# Pushes the local custom detection rules and shared agent config into the running manager, then
# restarts it so they take effect. Needed because:
# - local_rules.xml lives inside the wazuh_etc named volume (not bind-mountable the same way
#   ossec.conf is, see docker-compose.yml comment on wazuh_integrations for the same class of
#   issue with Windows bind mounts).
# - agent.conf is shared config distributed to agents by the manager at runtime, not something
#   agents read from a mounted file.
#
# Run this after `docker compose up -d` (fresh deploy) and again any time
# config/local_rules.xml or config/agent.conf change.
set -euo pipefail
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1

docker compose cp config/local_rules.xml wazuh.manager:/var/ossec/etc/rules/local_rules.xml
docker compose cp config/agent.conf wazuh.manager:/var/ossec/etc/shared/default/agent.conf

# A full wazuh-control restart (not `docker compose restart`) is used because a plain container
# restart did not reliably reload the new rules/decoders in testing, see docs/decisions.md.
docker compose exec wazuh.manager /var/ossec/bin/wazuh-control restart

echo "Deployed. Restart the Windows agent service (net stop WazuhSvc && net start WazuhSvc) so it picks up the updated shared config."
