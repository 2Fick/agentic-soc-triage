#!/usr/bin/env python3
"""
Wazuh custom integration: forwards a matching alert to the n8n webhook that
triggers the agentic triage pipeline.

Wazuh's integratord invokes this script as:
    custom-n8n <alert_file> <api_key> <hook_url> [options_file]

- alert_file : path to a JSON file containing the single alert that matched
  the <integration> block in ossec.conf (see wazuh_manager.conf).
- api_key    : unused here, kept for signature compatibility with Wazuh's
  built-in integrations.
- hook_url   : the n8n webhook URL, taken from <hook_url> in ossec.conf.

Only stdlib is used (urllib) since the manager image is not guaranteed to
have `requests` installed.
"""
import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

LOG_FILE = "/var/ossec/logs/integrations.log"


def log(message: str) -> None:
    line = f"{datetime.now(timezone.utc).isoformat()} custom-n8n: {message}\n"
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass


def main() -> int:
    if len(sys.argv) < 3:
        log(f"ERROR missing arguments: {sys.argv}")
        return 1

    alert_file = sys.argv[1]
    hook_url = sys.argv[3] if len(sys.argv) > 3 else sys.argv[2]

    try:
        with open(alert_file, "r", encoding="utf-8", errors="replace") as f:
            alert = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        log(f"ERROR reading alert file {alert_file}: {exc}")
        return 1

    payload = json.dumps({"alert": alert}).encode("utf-8")
    req = urllib.request.Request(
        hook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            log(f"OK sent alert id={alert.get('id')} rule={alert.get('rule', {}).get('id')} -> HTTP {resp.status}")
    except urllib.error.URLError as exc:
        log(f"ERROR posting to {hook_url}: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
