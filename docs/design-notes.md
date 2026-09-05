# Design notes

The reasoning behind the engineering choices, in more depth than the README.

## Agentic tool calling, not a hardcoded workflow

The agent receives the raw alert and decides for itself whether to enrich it, and with which tool.
An alert carrying no usable indicator triggers no external call at all. The tools are exposed over
[MCP](https://modelcontextprotocol.io/) rather than wired as fixed HTTP nodes, so adding a new
source is a matter of starting another server, not rewiring the workflow.

## MCP servers written by hand

Community MCP servers for VirusTotal and AbuseIPDB exist on npm. They were passed over: running
lightly audited third-party code and handing it live API keys sits badly in a security project.

The two servers are 130 and 200 lines against the official MCP SDK. They also trim vendor responses
down to the fields that support a triage decision. VirusTotal in particular returns very large
payloads with per-engine breakdowns, which would bloat the agent's context for no benefit.

They run as stateless Streamable HTTP services rather than stdio subprocesses, because n8n's
built-in MCP Client Tool node only speaks network transports.

## Deliberate bias toward escalation

Auto-closing requires confidence. Doubt, missing enrichment, a tool error, or conflicting signals
all lead to escalation. An agent that closed alerts by default would be a liability rather than a
gain, so the system prompt states the rule explicitly and the deterministic tiers follow it too.

## A gap in Wazuh's default ruleset

The three simulated techniques are covered by hand-written rules in
`wazuh/config/local_rules.xml`, built from the real structure of captured Sysmon events.

While investigating why registry persistence never fired, it turned out the `sysmon_event_13` group
is never assigned by this version of Wazuh, which silently disables every built-in rule depending on
it, including 92300 and 92301. In other words, a default Wazuh deployment does not detect registry
Run key persistence at all. The custom rules bind to the `windows` group instead, which was verified
to fire.

One detail worth knowing for anyone writing similar rules: Wazuh stores Windows paths in
`targetObject` with doubled backslashes, so a regex matching a single backslash never matches. The
official ruleset follows the same convention.

## False positive tuning

Two built-in rules fire at level 15 on entirely routine activity:

- Rule 92213 on the `__PSScriptPolicyTest_*.ps1` files PowerShell itself writes to `%TEMP%` on every
  script launch. Running any legitimate script was therefore enough to wake the triage agent.
- The same rule on provider DLLs that Windows servicing (DISM) extracts into a GUID-named temp
  folder during normal updates, which accounted for most level 15 alerts on an idle host.

Both are suppressed at level 0, meaning the events stay in the logs but no longer alert. After
tuning, one scenario run produces exactly one alert, the right one.

## Noisy modules disabled

Two Wazuh modules generate one alert per finding, well above the webhook threshold: compliance
scanning (SCA), with 300+ failed CIS checks per scan, and vulnerability detection, which maps
Critical CVEs to level 13 on a host with hundreds of outdated packages. Both are disabled, on the
manager and on the agent. Neither serves attack detection, and both are proven flood sources.
