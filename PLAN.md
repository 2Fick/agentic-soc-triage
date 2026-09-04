# Plan par phases

## Phase 0 : Décision infra (bloquant) - fait
- [x] Vérifier si la virtualisation matérielle est activée (Gestionnaire des tâches, Performances,
      CPU, ligne "Virtualisation"). Activée.
- [x] Décision : Wazuh manager en local via Docker Desktop/WSL2 (voir `docs/decisions.md`).

## Phase 1 : Wazuh - fait
- [x] Déployer le manager Wazuh (local via Docker, single-node officiel v4.14.7).
- [x] Câbler le webhook sortant : intégration custom `custom-n8n` (alertes niveau >= 10 vers n8n,
      relevé de 7 après un incident de flood, voir `docs/decisions.md`).
- [x] Agent Wazuh + Sysmon installés sur la machine Windows, connectés et stables.
- [x] SCA et détection de vulnérabilités désactivés (manager + agent) après un incident de flood
      d'alertes ayant épuisé le quota Gemini gratuit, voir `docs/decisions.md`.

## Phase 2 : n8n + MCP - fait
- [x] Installer n8n en local (npx, données relocalisées sur D:, toujours démarrer via `n8n/start.sh`).
- [x] Serveurs MCP pour VirusTotal et AbuseIPDB, testés avec les vraies clés (Streamable HTTP,
      voir `docs/decisions.md` pour le choix du transport).

## Phase 3 : Agent Gemini - construit et validé structurellement
- [x] Clé API Gemini dédiée à ce projet, testée (`gemini-3.6-flash`, `gemini-2.5-flash` est
      désactivé pour les nouvelles clés, voir `docs/decisions.md`).
- [x] Workflow n8n complet importé et publié : webhook Wazuh vers agent Gemini (tool-calling
      agentique vers les 2 serveurs MCP, sortie JSON structurée forcée) vers Slack.
- [x] Prompt de triage rédigé (sévérité, verdict, action auto_close/escalate, résumé, raisonnement,
      biais volontaire vers l'escalade en cas de doute).
- [x] Compte owner n8n créé, credential Gemini liée, workflow publié.
- [x] Chaque maillon validé individuellement en inspectant les données réelles d'exécution :
      webhook reçoit bien l'alerte (`$json.body.alert`), agent appelle les outils MCP avec de
      vraies données (VirusTotal/AbuseIPDB), schéma de sortie structuré correct, message Slack
      envoyé avec succès (execution 4).
- [x] Run complet de bout en bout confirmé : webhook -> garde-fou -> agent Gemini -> outils MCP
      (VirusTotal + AbuseIPDB) -> verdict structuré -> Slack. Les erreurs réseau intermittentes
      rencontrées la veille venaient du quota Gemini épuisé par le flood d'alertes SCA/CVE (voir
      Phase 4), pas d'un vrai problème réseau. `retryOnFail` conservé sur le node agent.

## Phase 4 : Tests d'attaque simulée - construit, 2/3 détections confirmées
- [x] 3 scénarios écrits (T1059.001, T1053.005, T1547.001), non destructifs, auto-nettoyants,
      voir `attacks/README.md`.
- [x] Règles de détection custom écrites (`wazuh/config/local_rules.xml`) après avoir vérifié que
      le ruleset par défaut ne couvrait pas fiablement tous les cas.
- [x] T1059.001 (PowerShell encodé) et T1053.005 (tâche planifiée) : détection confirmée, vraies
      alertes de niveau 12 avec tags MITRE ATT&CK corrects.
- [ ] T1547.001 (clé de registre Run) : ne se déclenche pas malgré une structure d'événement
      conforme à ce que la règle attend, cause non identifiée. Limitation connue, voir
      `docs/decisions.md`.
- [x] Incident important géré en cours de route : flood de ~330 exécutions n8n causé par le module
      SCA de Wazuh (une alerte par contrôle de conformité échoué), corrigé en désactivant SCA et
      la détection de vulnérabilités. Voir `docs/decisions.md`.
- [x] Garde-fou anti-flood ajouté dans le workflow lui-même (node "Rate Limit Guard", 20
      appels/24h max), testé et confirmé fonctionnel.
- [x] Chaîne complète confirmée fonctionnelle de bout en bout (webhook -> garde-fou -> agent
      Gemini -> outils MCP -> Slack), quota reconstitué et vrai run réussi.
- [x] Schéma de sortie structuré corrigé : le paramètre s'appelle `inputSchema` (et non
      `jsonSchema`) à partir de la typeVersion 1.2 du node. Verdict complet et correctement
      structuré confirmé en test réel, voir `docs/decisions.md`.

## Phase 5 : Documentation / démo CV
- [ ] README complet avec architecture, captures d'écran, verdicts d'exemple.
- [ ] Support de démo (vidéo courte ou walkthrough) pour entretien.
- [ ] Pour la démo dashboard Wazuh : pas de reset de données, filtrer par plage de temps (sélecteur
      en haut à droite des sections du dashboard) sur la fenêtre où les scripts d'attaque ont
      tourné, pour exclure le bruit des tests/incidents précédents. Décision prise le 2026-09-03 :
      plus réaliste qu'un environnement reset (un vrai dashboard SOC a toujours de l'historique).

---

Convention : ce fichier est mis à jour au fur et à mesure. Les décisions de design qui engagent
le projet sont documentées dans `docs/decisions.md`.
