# Agentic SOC Triage

Pipeline de sécurité qui détecte, enrichit et triage des alertes SIEM en utilisant un agent IA
agentique (tool-calling via MCP), avec auto-clôture ou escalade des tickets.

Projet portfolio construit pour démontrer une maîtrise pratique d'outils reconnus par l'industrie
SOC : SIEM, SOAR/automatisation, LLM appliqué en agent, MCP.

## Architecture

```
Alerte Wazuh → webhook → n8n → agent Gemini (tool-calling via MCP : VirusTotal, AbuseIPDB)
             → triage (sévérité, corrélation, verdict, résumé humain)
             → Slack ou ticket (auto-clore / escalader)
```

- **SIEM : [Wazuh](https://wazuh.com/)**, open-source, gratuit à vie, SIEM+XDR reconnu dans
  l'industrie (contrairement à Splunk Enterprise, gratuit seulement 60 jours).
- **Automatisation : [n8n](https://n8n.io/)**, self-hosté (Windows natif via npx ou Docker, pas
  besoin de virtualisation pour n8n lui-même).
- **Interface outils : [MCP](https://modelcontextprotocol.io/)**, VirusTotal et AbuseIPDB sont
  exposés comme des serveurs/outils MCP que l'agent appelle lui-même (tool-calling agentique),
  plutôt que câblés en dur via des nodes HTTP n8n classiques.
- **LLM : Gemini**, palier gratuit, clé API dédiée à ce projet (quota indépendant des autres
  projets).
- **Contrainte stricte : zéro coût, nulle part.** Aucun service payant, aucun essai limité dans le
  temps.
- **Tests** : simulation d'attaques (type Atomic Red Team ou équivalent léger) pour prouver que la
  chaîne détection → triage fonctionne réellement, et pas seulement le branchement d'une API.

## Statut

Voir [PLAN.md](PLAN.md) pour l'avancement par phase.

## Structure du dépôt

```
wazuh/       # config du manager Wazuh (règles, decoders, ossec.conf)
n8n/         # workflows n8n exportés (JSON)
mcp-servers/ # serveurs MCP custom (VirusTotal, AbuseIPDB)
agent/       # agent Gemini (tool-calling, prompt de triage)
attacks/     # scripts de simulation d'attaque (tests)
docs/        # documentation, décisions, captures pour la démo CV
```
