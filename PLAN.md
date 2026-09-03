# Plan par phases

## Phase 0 : Décision infra (bloquant) - fait
- [x] Vérifier si la virtualisation matérielle est activée (Gestionnaire des tâches, Performances,
      CPU, ligne "Virtualisation"). Activée.
- [x] Décision : Wazuh manager en local via Docker Desktop/WSL2 (voir `docs/decisions.md`).

## Phase 1 : Wazuh
- [x] Déployer le manager Wazuh (local via Docker, single-node officiel v4.14.7).
- [x] Câbler le webhook sortant : intégration custom `custom-n8n` (alertes niveau >= 7 vers n8n),
      vérifiée fonctionnelle (permissions et connectivité réseau testées manuellement).
- [ ] Configurer un agent Wazuh (Windows local ou machine de test) pour générer des logs, prévu en
      Phase 4 avec le choix des scénarios d'attaque (le ruleset par défaut couvre déjà la plupart
      des techniques Atomic Red Team via Sysmon, pas de règle custom nécessaire a priori).

## Phase 2 : n8n + MCP - fait
- [x] Installer n8n en local (npx, données relocalisées sur D:, toujours démarrer via `n8n/start.sh`).
- [x] Serveurs MCP pour VirusTotal et AbuseIPDB, testés avec les vraies clés (Streamable HTTP,
      voir `docs/decisions.md` pour le choix du transport).

## Phase 3 : Agent Gemini - construit, validation manuelle en cours
- [x] Clé API Gemini dédiée à ce projet, testée (`gemini-3.6-flash`, `gemini-2.5-flash` est
      désactivé pour les nouvelles clés, voir `docs/decisions.md`).
- [x] Workflow n8n complet importé : webhook Wazuh vers agent Gemini (tool-calling agentique vers
      les 2 serveurs MCP, sortie JSON structurée forcée) vers Slack.
- [x] Prompt de triage rédigé (sévérité, verdict, action auto_close/escalate, résumé, raisonnement,
      biais volontaire vers l'escalade en cas de doute).
- [ ] Créer le compte owner n8n (localhost:5678), lier la credential Gemini au node "Gemini Chat
      Model", activer le workflow. Voir `n8n/README.md`.
- [ ] Test de bout en bout (webhook réel, verdict, message Slack).

## Phase 4 : Tests d'attaque simulée
- [ ] Scénarios de type Atomic Red Team (ou équivalent léger, gratuit).
- [ ] Vérifier la chaîne complète : attaque simulée, alerte Wazuh, triage agent, verdict correct.

## Phase 5 : Documentation / démo CV
- [ ] README complet avec architecture, captures d'écran, verdicts d'exemple.
- [ ] Support de démo (vidéo courte ou walkthrough) pour entretien.

---

Convention : ce fichier est mis à jour au fur et à mesure. Les décisions de design qui engagent
le projet sont documentées dans `docs/decisions.md`.
