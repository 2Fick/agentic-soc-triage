# Agentic SOC Triage

A detection and automated triage pipeline for SIEM alerts. A simulated attack on a Windows host
raises a Wazuh alert, which is then enriched and adjudicated by an AI agent that calls threat
intelligence tools on its own, and posted to Slack with a reasoned verdict.

Built entirely on free, self-hosted tools, to show hands-on command of a modern SOC chain: SIEM,
SOAR, applied LLM agents, and MCP.

## What it produces

A real verdict from the pipeline, on an SSH brute force alert:

```json
{
  "severity": "medium",
  "verdict": "suspicious",
  "action": "escalate",
  "summary": "A failed SSH authentication attempt against the \"admin\" account was detected from 8.8.8.8. The IP belongs to Google's public DNS servers and has a clean reputation, but SSH connection attempts coming from that address are unusual and need a closer look.",
  "reasoning": "Wazuh rule 5710 (level 10) fired for an SSH brute force attempt against the invalid user \"admin\", from source IP 8.8.8.8. Enrichment shows this is Google LLC's public DNS resolver: 0% abuse score on AbuseIPDB, 0 detections on VirusTotal. However, a public DNS server initiating SSH connection attempts is an unexplained behaviour (possible address spoofing, a misconfigured relay, or a penetration test). Without certainty, the alert cannot be auto-closed and must be escalated."
}
```

What makes this example interesting: the agent does not stop at the raw tool output. Both threat
intelligence sources report the IP as clean, and concluding "benign, auto-close" would have been
the easy answer. Instead it catches the behavioural mismatch, a public DNS resolver does not open
SSH sessions, and escalates. That is the behaviour worth having: when in doubt, a human decides.

## Architecture

```
Windows host (Sysmon + Wazuh agent)
        |
        |  telemetry (process creation, registry, network)
        v
Wazuh manager (Docker)  -- detection rules, including custom ones for the tested MITRE techniques
        |
        |  outbound webhook, level >= 10 alerts only
        v
n8n (self-hosted)
        |
        +-- Triage Cascade ......... dedup, deterministic pre-filter, spend guard
        |
        +-- AI agent (Gemini) ...... decides on its own which tools to call
        |       |
        |       +-- VirusTotal MCP ....... lookup_ip / lookup_domain / lookup_file_hash
        |       +-- AbuseIPDB MCP ........ check_ip
        |
        +-- Structured output ...... enforced JSON schema
        |
        v
      Slack
```

## Design notes

**Tiered triage, the model is a last resort.** Calling an LLM on every single alert is wasteful and
slow. Each alert goes through a cascade, and only reaches the model if the cheaper layers cannot
settle it:

| Tier | Decision | LLM call |
|---|---|---|
| 0 | Fingerprint already seen in the last 6h | No, cached verdict replayed |
| 1 | No actionable IOC (no public IP, no hash) | No, deterministic verdict |
| 2 | Daily cap reached, or calls too close together | No, fail-safe escalation |
| 3 | Ambiguous case with IOCs worth enriching | Yes |

Tier 2 matters as much as the rest: when the guard trips, the alert is still escalated with an
explicit note. A pipeline that silently drops alerts once its budget runs out would be a design
flaw, not an optimisation.

**Agentic tool calling, not a hardcoded workflow.** The agent receives the raw alert and decides by
itself whether to enrich it, and with which tool. An alert with no usable indicator triggers no
external call at all. Tools are exposed over [MCP](https://modelcontextprotocol.io/), not wired as
fixed HTTP nodes.

**Hand-written MCP servers.** Community MCP servers for VirusTotal and AbuseIPDB exist on npm. They
were passed over: running lightly audited third-party code and handing it API keys runs against the
point of a security project. The two servers are 130 and 200 lines against the official MCP SDK,
and trim vendor responses down to what actually supports a triage decision.

**Deliberate bias toward escalation.** Auto-closing requires confidence. Doubt, missing enrichment,
tool errors, or conflicting signals all lead to escalation. An agent that closed alerts by default
would be a liability, not a gain.

**Custom detection rules, and a gap in the default ruleset.** All three techniques are covered by
hand-written rules (`wazuh/config/local_rules.xml`) built from the real structure of captured
events. While investigating why registry persistence never fired, it turned out the
`sysmon_event_13` group is never assigned by this version of Wazuh, which silently disables the
built-in rules that depend on it (92300 and 92301). In other words, a default Wazuh deployment does
not detect this technique at all.

**False positive tuning.** Built-in rule 92213 fires at level 15 on the `__PSScriptPolicyTest_*.ps1`
files PowerShell itself writes to `%TEMP%` on every script launch. Running any legitimate script was
therefore enough to wake the triage agent. A suppression rule brings the signal back to what
matters: one scenario run now produces exactly one alert, the right one.

## Stack

| Component | Choice | Why |
|---|---|---|
| SIEM | Wazuh 4.14 (Docker, single-node) | Open source, free with no time limit, established SIEM+XDR |
| Endpoint telemetry | Sysmon + Wazuh agent | Process, registry and network visibility on Windows |
| Automation | Self-hosted n8n | No SaaS dependency, workflows kept in version control |
| Threat intelligence | VirusTotal, AbuseIPDB | Free tiers, exposed over MCP |
| LLM | Gemini (free tier) | No cost, native tool calling |
| Notification | Slack incoming webhook | Free |

One constraint held throughout: **no cost anywhere, no time-limited trials**.

## Running it

Requirements: Docker Desktop, Node.js, and a Windows host for telemetry.

```bash
# 1. API keys, all free. See .env.example for where to get them
cp .env.example .env   # then fill in the four values

# 2. SIEM
cd wazuh
docker compose -f generate-indexer-certs.yml run --rm generator
docker compose up -d
./deploy-integration.sh   # webhook integration to n8n
./deploy-config.sh        # custom rules + shared agent config

# 3. MCP servers
cd ../mcp-servers && npm install
node virustotal-server.js &
node abuseipdb-server.js &

# 4. n8n
cd ../n8n && ./start.sh
```

Each step is detailed in the README of its own folder. Installing Sysmon and the Wazuh agent on the
Windows host is covered in `wazuh/README.md`, the attack scenarios in `attacks/README.md`.

## Testing detection

Three MITRE ATT&CK scenarios, non-destructive and self-cleaning:

```powershell
cd attacks
.\T1059.001_powershell_encoded_command.ps1     # base64 encoded PowerShell command
.\T1053.005_scheduled_task_persistence.ps1     # scheduled task persistence
.\T1547.001_registry_run_key_persistence.ps1   # registry Run key persistence
```

Each one produces exactly one level 12 alert, tagged with the matching MITRE technique.

## Layout

```
wazuh/         SIEM deployment, custom rules, webhook integration
n8n/           triage workflow (versioned JSON) and start script
mcp-servers/   VirusTotal and AbuseIPDB MCP servers
attacks/       attack simulation scenarios
sysmon/        Sysmon configuration
docs/          architecture decision records
```

## Known limits

Written down rather than glossed over:

- **Gemini free tier**: limited daily quota. The cascade keeps usage low and the spend guard
  prevents accidental exhaustion, but real production use would need a paid tier.
- **Single-node deployment** with default Wazuh passwords: fine for a local demo, not for anything
  reachable from a network. See the security section in `wazuh/README.md`.

## Decisions

`docs/decisions.md` records the architecture choices and the trade-offs behind them.
