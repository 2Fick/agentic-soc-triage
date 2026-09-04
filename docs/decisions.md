# Architecture decisions

Short records of the choices that shape this project: the context, the decision, and what was
rejected. Kept brief on purpose.

## Wazuh manager runs locally in Docker

**Context.** The Wazuh manager is Linux-only. On a Windows workstation that leaves two options:
Docker Desktop on the WSL2 backend, which needs hardware virtualisation, or a free cloud VM such as
Oracle Cloud Always Free.

**Decision.** Run the manager in Docker locally, with `docker compose`. Hardware virtualisation is
available on the machine, so the cloud VM buys nothing here.

**Rejected.** A cloud VM would give a remotely reachable demo URL, but it adds network exposure of a
Wazuh manager and an n8n webhook for very little gain in a local demo setting.

## MCP servers written by hand rather than pulled from npm

**Context.** Community MCP servers for VirusTotal and AbuseIPDB exist on npm and can be run with
`npx` without writing any code.

**Decision.** Write two minimal servers against the official MCP SDK. Two reasons. First, security:
these are low-download packages from unknown authors, and running them means handing them live API
keys, which sits badly in a security project. Second, they stay small (130 and 200 lines) and trim
vendor responses down to the fields that actually support a triage decision, which keeps the agent's
context small.

## MCP transport: Streamable HTTP, not stdio

**Context.** The initial plan ran the MCP servers over stdio, spawned as child processes by n8n.
Reading the source of n8n's built-in MCP Client Tool node shows it only supports network transports,
SSE or Streamable HTTP, with no local command spawning.

**Decision.** Both servers run stateless Streamable HTTP on `localhost:3001` and `localhost:3002`,
following the official SDK example. n8n connects with authentication set to none, since they are
bound locally only.

**Rejected.** The `n8n-nodes-mcp` community node does support stdio, but installing a community node
means running third-party code again, the same trade-off already settled above.

## Tiered triage instead of calling the model on every alert

**Context.** Calling an LLM once per alert is expensive, slow, and non-deterministic. It also burns
a free-tier quota quickly: an early misconfiguration let Wazuh's compliance scanning module raise
over 300 routine alerts in a few minutes, each one triggering a model call, exhausting the daily
quota in a single burst.

**Decision.** Alerts pass through a cascade, and only reach the model when the cheaper tiers cannot
settle them:

- **Tier 0**, deduplication. A fingerprint of rule ID, host and extracted IOCs. A repeat within six
  hours replays the cached verdict.
- **Tier 1**, deterministic pre-filter. With no actionable IOC there is nothing to enrich and no
  reasoning to add, so the alert is escalated for human review without a model call.
- **Tier 2**, spend guard. A daily cap plus a minimum interval between calls, the latter because
  bursts of alerts arriving at once (typically when an agent flushes its buffer after a restart)
  otherwise hit per-minute rate limits.
- **Tier 3**, the model, on ambiguous alerts with indicators worth enriching.

When tier 2 trips, the alert is still escalated with an explicit note rather than dropped or closed
by default. A pipeline that loses alerts once its budget runs out is broken, not optimised.

**Rejected.** Enriching through VirusTotal and AbuseIPDB *before* the model, and deciding on score
thresholds alone. It would duplicate logic already carried by the MCP servers, and it would take
away the agent's decision of whether to enrich, which is the point of the agentic design.

## Noisy Wazuh modules disabled

**Context.** Two built-in modules generate one alert per finding, well above the webhook threshold:
compliance scanning (SCA), with 300+ failed CIS checks per scan, and vulnerability detection, which
maps Critical CVEs to level 13 and High to level 10, on a host with hundreds of outdated packages.

**Decision.** Disable both, on the manager and on the agent. Neither serves this project's goal,
which is attack detection and triage, and both are proven flood sources.

## Custom detection rules

**Context.** The default Wazuh ruleset did not reliably cover the tested techniques over Sysmon.
Investigating registry Run key persistence showed the `sysmon_event_13` group is never assigned by
this version, which silently disables the built-in rules depending on it (92300 and 92301).

**Decision.** Write rules bound to the `windows` group, verified to fire, built from the real
structure of captured events. Two details worth recording for anyone writing similar rules:

- Wazuh stores Windows paths in `targetObject` with doubled backslashes, so a regex matching a
  single backslash never fires. The official ruleset follows the same convention.
- Unknown parameters in a node or rule definition raise no error, they are ignored and the default
  applies. A wrong field name therefore looks like a broken tool rather than a broken config.

A suppression rule was also added for built-in rule 92213, which fires at level 15 on the
`__PSScriptPolicyTest_*.ps1` files PowerShell writes to `%TEMP%` on every script launch. Without it,
running any legitimate script wakes the triage agent.
