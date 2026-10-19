# Adaptive Gamification Engine

The practice-games component of Code Guru. A student who keeps making the same
mistake in Code Coach is matched to a game on that concept - BugHunt,
CodeTrace, DragDrop or CodeFix - at a difficulty a model picks from how they
have been playing.

The UI is in `codeguru-web` (`/play`). This repository holds two services, both
in `backend/`:

| Service | Path | Port |
|---|---|---|
| Gamification API (Node, Express) | `backend/` | `3002` |
| Difficulty model (Python, Flask, Random Forest) | `backend/ml/` | `5000` |

Everything else - architecture, endpoints, settings, running it, the question
bank and its seed scripts, the games, the difficulty model and deployment - is
in [`backend/README.md`](backend/README.md).

A push to `main` runs the tests, builds both images, pushes them to ECR and
rolls them out on the AWS server (`.github/workflows/ci-cd.yml`).
