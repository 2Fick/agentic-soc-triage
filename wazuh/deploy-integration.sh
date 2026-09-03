#!/usr/bin/env bash
# Copies integrations/custom-n8n(.py) from this repo into the wazuh.manager container's
# integrations volume, with the correct (non-world-writable) permissions, and restarts the
# manager so wazuh-integratord picks up the change.
#
# Needed because a plain bind mount from Windows makes files world-writable, which
# wazuh-integratord refuses to execute. See docker-compose.yml comment on wazuh_integrations.
#
# Run this after `docker compose up -d`, and again any time integrations/custom-n8n.py changes.
set -euo pipefail
cd "$(dirname "$0")"

# Prevent Git-Bash-on-Windows from mangling the container's Unix paths (e.g. /var/ossec/...)
# into Windows paths when they're passed through to `docker compose exec`.
export MSYS_NO_PATHCONV=1

docker compose cp integrations/custom-n8n wazuh.manager:/var/ossec/integrations/custom-n8n
docker compose cp integrations/custom-n8n.py wazuh.manager:/var/ossec/integrations/custom-n8n.py
docker compose exec -T wazuh.manager chmod 750 /var/ossec/integrations/custom-n8n /var/ossec/integrations/custom-n8n.py
docker compose exec -T wazuh.manager chown root:wazuh /var/ossec/integrations/custom-n8n /var/ossec/integrations/custom-n8n.py
docker compose restart wazuh.manager

echo "Deployed. Tail /var/ossec/logs/integrations.log to confirm alerts are being forwarded."
