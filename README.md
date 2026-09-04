# Agentic SOC Triage

Pipeline de détection et de triage automatisé d'alertes SIEM. Une attaque simulée sur un poste
Windows déclenche une alerte Wazuh, qui est enrichie et triée par un agent IA capable d'appeler
lui-même des outils de threat intelligence, puis transmise dans Slack avec un verdict argumenté.

Projet personnel, construit intégralement avec des outils gratuits et self-hostés, pour démontrer
une maîtrise pratique de la chaîne SOC moderne : SIEM, SOAR, LLM appliqué en agent, MCP.

## Ce que ça produit

Verdict réel généré par le pipeline sur une alerte de brute force SSH (rejeu complet, aucune
donnée inventée) :

```json
{
  "severity": "medium",
  "verdict": "suspicious",
  "action": "escalate",
  "summary": "Une tentative d'authentification SSH infructueuse sur le compte \"admin\" a été détectée depuis l'adresse IP 8.8.8.8. Bien que l'IP appartienne aux serveurs DNS publics de Google et dispose d'une excellente réputation, l'initiation de connexions SSH depuis cette adresse constitue un comportement suspect nécessitant une analyse approfondie.",
  "reasoning": "L'alerte déclenchée est la règle Wazuh 5710 (niveau 10) pour une tentative d'attaque SSH par force brute visant l'utilisateur invalide \"admin\". L'enrichissement montre qu'il s'agit du résolveur DNS public de Google LLC : score d'abus de 0% sur AbuseIPDB, 0 détection sur VirusTotal. Cependant, l'émission de tentatives de connexion SSH depuis un serveur DNS public est une anomalie inexpliquée (possible usurpation d'adresse, relais mal configuré, ou test d'intrusion). En l'absence de certitude, l'alerte ne peut être auto-fermée et doit être escaladée."
}
```

L'intérêt de cet exemple : l'agent ne s'arrête pas au résultat brut des outils. Les deux sources
de threat intelligence donnent l'IP pour propre, et il aurait été trivial de conclure « bénin,
clôture automatique ». Il identifie l'incohérence comportementale (un résolveur DNS public n'ouvre
pas de sessions SSH) et escalade. C'est le comportement recherché : en cas de doute, un analyste
humain tranche.

## Architecture

```
Poste Windows (Sysmon + agent Wazuh)
        |
        |  télémétrie (création de process, registre, réseau)
        v
Wazuh manager (Docker)  -- règles de détection, dont custom pour les techniques MITRE testées
        |
        |  webhook sortant, alertes de niveau >= 10 uniquement
        v
n8n (self-hosté)
        |
        +-- Rate Limit Guard ....... coupe-circuit, 20 appels LLM / 24h maximum
        |
        +-- Agent IA (Gemini) ...... décide seul quels outils appeler
        |       |
        |       +-- MCP VirusTotal ....... lookup_ip / lookup_domain / lookup_file_hash
        |       +-- MCP AbuseIPDB ........ check_ip
        |
        +-- Sortie structurée ...... schéma JSON imposé (severity/verdict/action/summary/reasoning)
        |
        v
     Slack
```

## Points techniques notables

**Tool-calling agentique, pas de workflow câblé en dur.** L'agent reçoit l'alerte brute et décide
lui-même s'il doit enrichir, et avec quel outil. Une alerte sans IOC exploitable ne déclenche aucun
appel externe. Les outils sont exposés via [MCP](https://modelcontextprotocol.io/), pas via des
nodes HTTP figés.

**Serveurs MCP écrits maison.** Des serveurs MCP communautaires existent sur npm pour VirusTotal et
AbuseIPDB. Ils ont été écartés : exécuter du code tiers peu audité en lui confiant des clés API va
à l'encontre de l'objectif d'un projet de sécurité. Les deux serveurs (SDK officiel MCP, transport
Streamable HTTP) tiennent en 130 et 200 lignes et filtrent les réponses pour ne transmettre à
l'agent que ce qui sert la décision de triage.

**Biais volontaire vers l'escalade.** La règle de décision impose l'auto-clôture uniquement en cas
de certitude. Doute, données d'enrichissement absentes, erreur d'outil ou signal contradictoire
conduisent tous à l'escalade. Un agent qui clôturerait par défaut serait un risque, pas un gain.

**Garde-fou anti-flood.** Un incident réel pendant le développement (voir `docs/decisions.md`) a vu
le module de conformité de Wazuh générer plus de 300 alertes de routine en quelques minutes, chacune
déclenchant un appel LLM, épuisant le quota de l'API en une seule salve. Correction à trois
niveaux : désactivation des modules bruyants, remontée du seuil de déclenchement, et surtout un
coupe-circuit dans le workflow lui-même qui plafonne les appels indépendamment de la configuration
du SIEM.

**Règles de détection custom, et une lacune du ruleset par défaut.** Les trois techniques sont
couvertes par des règles écrites à la main (`wazuh/config/local_rules.xml`) à partir de la structure
réelle des événements capturés. En investiguant pourquoi la détection de persistance par clé de
registre ne se déclenchait pas, il est apparu que le groupe `sysmon_event_13` n'est jamais assigné
par cette version de Wazuh, ce qui neutralise silencieusement les règles intégrées qui en dépendent
(92300 et 92301). Autrement dit, un déploiement Wazuh par défaut ne détecte pas cette technique.
Diagnostic mené par bissection avec des règles temporaires placées sous le seuil de déclenchement,
pour ne pas consommer de quota LLM pendant le débogage.

**Tuning de faux positif.** La règle intégrée 92213 se déclenche au niveau 15 sur les fichiers
`__PSScriptPolicyTest_*.ps1` que PowerShell écrit lui-même dans `%TEMP%` à chaque lancement de
script. Résultat : exécuter n'importe quel script légitime déclenchait l'agent de triage. Une règle
de suppression ramène le signal à l'essentiel, une exécution de scénario produit désormais
exactement une alerte, la bonne.

## Stack

| Composant | Choix | Pourquoi |
|---|---|---|
| SIEM | Wazuh 4.14 (Docker, single-node) | Open source, gratuit sans limite de durée, SIEM+XDR reconnu |
| Télémétrie endpoint | Sysmon + agent Wazuh | Visibilité process/registre/réseau sur Windows |
| Automatisation | n8n self-hosté | Pas de dépendance SaaS, workflows versionnables |
| Threat intelligence | VirusTotal, AbuseIPDB | Paliers gratuits, exposés en MCP |
| LLM | Gemini (palier gratuit) | Coût nul, tool-calling natif |
| Notification | Webhook Slack entrant | Gratuit |

Contrainte tenue de bout en bout : **zéro coût, aucun essai limité dans le temps**.

## Reproduire

Prérequis : Docker Desktop, Node.js, un poste Windows pour la télémétrie.

```bash
# 1. Clés API (toutes gratuites), voir .env.example pour les liens
cp .env.example .env   # puis remplir les 4 valeurs

# 2. SIEM
cd wazuh
docker compose -f generate-indexer-certs.yml run --rm generator
docker compose up -d
./deploy-integration.sh   # intégration webhook vers n8n
./deploy-config.sh        # règles custom + config partagée des agents

# 3. Serveurs MCP
cd ../mcp-servers && npm install
node virustotal-server.js &
node abuseipdb-server.js &

# 4. n8n
cd ../n8n && ./start.sh
```

Détail de chaque étape dans les README des sous-dossiers. L'installation de Sysmon et de l'agent
Wazuh sur le poste Windows est décrite dans `wazuh/README.md`, les scénarios d'attaque dans
`attacks/README.md`.

## Tester la détection

Trois scénarios MITRE ATT&CK, non destructifs et auto-nettoyants :

```powershell
cd attacks
.\T1059.001_powershell_encoded_command.ps1     # commande PowerShell encodée en base64
.\T1053.005_scheduled_task_persistence.ps1     # persistance par tâche planifiée
.\T1547.001_registry_run_key_persistence.ps1   # persistance par clé de registre Run
```

## Structure

```
wazuh/         déploiement du SIEM, règles custom, intégration webhook
n8n/           workflow de triage (JSON versionné) et script de démarrage
mcp-servers/   serveurs MCP VirusTotal et AbuseIPDB
attacks/       scénarios de simulation d'attaque
sysmon/        configuration Sysmon
docs/          journal des décisions de design et des incidents
```

## Limitations connues

Documentées plutôt que passées sous silence :

- **Palier gratuit Gemini** : quota quotidien limité. Le coupe-circuit protège contre son
  épuisement accidentel, mais un usage réel en production nécessiterait un palier payant.
- **Déploiement single-node**, mots de passe Wazuh par défaut : adapté à une démonstration locale,
  pas à une exposition réseau. Voir la section Sécurité de `wazuh/README.md`.

## Journal de décisions

`docs/decisions.md` retrace les choix d'architecture et les incidents rencontrés, y compris les
erreurs de diagnostic et leur résolution. C'est volontairement conservé : la démarche compte autant
que le résultat.
