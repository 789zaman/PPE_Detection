# Cursor Documentation Index

Read these documents in order:

1. `README.md` — overall target architecture and non-goals
2. `01-ARCHITECTURE.md` — service boundaries and communication
3. `02-LOCAL-DEVELOPMENT.md` — localhost workflow
4. `03-AI-WORKER.md` — YOLO11s inference and PPE logic
5. `04-AI-TRAINING-EVALUATION.md` — training and live validation
6. `05-NATS-EVENT-CONTRACTS.md` — event contracts
7. `06-DOTNET-BACKEND.md` — backend implementation
8. `07-DATABASE.md` — PostgreSQL model
9. `08-MEDIAMTX-STREAMING.md` — streaming
10. `FRONTEND-ARCHITECTURE.md` — existing Angular app (`engro PPE/`)
11. `10-SECURITY-OBSERVABILITY.md` — production concerns
12. `11-DOCKER-COMPOSE-SPEC.md` — container orchestration
13. `12-CURSOR-IMPLEMENTATION-ORDER.md` — execution sequence
14. `13-CURSOR-RULES.md` — implementation constraints
15. `14-TESTING-PLAN.md` — verification
16. `15-DEPLOYMENT.md` — deployment evolution
17. `16-QUICKSTART.md` — developer quickstart

Cursor should treat `13-CURSOR-RULES.md` and the current Arc PPE rule as constraints unless the user explicitly changes them.
