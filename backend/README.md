# Adaptive Gamification Engine (Code Guru)

Adaptive practice games for the Code Guru platform. A student who keeps failing
a concept in Code Coach gets matched to a game type and a difficulty pitched at
where they actually are.

This service **has no accounts of its own**. Code Coach is the platform's
identity provider; every request here carries a Code Coach access token and is
verified by calling Code Coach.

## Architecture

| Service | Port | Role |
|---|---|---|
| Code Coach API | `8000` | Identity provider; struggle signals; game recommendations |
| **Gamification backend** | `3002` | Question bank, grading, player profile, difficulty selection |
| **Gamification ML service** | `5000` | Random Forest difficulty prediction (Flask) |
| Gamification frontend | `5174` | Dashboard and game UI |

Ports are not arbitrary: `3000` is PairPath's frontend, `3001` its API, `5173`
Study Guider's frontend, `4200` the portal. Taking one of those breaks whichever
service starts second.

## Databases

**MongoDB Atlas, and it is this service's own cluster — not a shared one.**
Three collections:

| Collection | Holds |
|---|---|
| `questionBank` | The games themselves. `correctAnswer` is polymorphic per `gameType`: a number for BugHunt, an array for DragDrop, a string for CodeTrace. |
| `gameSessions` | One row per completed game. Also the training corpus for the difficulty model. |
| `playerProfiles` | Score, streak, badges. |

Diagnostics, learning events and concept mastery are **not** stored here. Code
Coach owns them and this service reads them live. A local `CodeDiagnostic`
collection and a local `LearningEvent` write both existed once and were removed:
they were second copies of facts Code Coach owned, guaranteed to disagree.

## Authentication

There is **no `JWT_SECRET` here, and there must not be.** This service does not
issue or verify tokens itself.

`middleware/auth.js` forwards each bearer token to Code Coach's
`GET /api/v1/auth/me` and caches the answer for `AUTH_CACHE_TTL_MS` (60s).
Verifying the signature locally would need Code Coach's secret in this repo, and
a valid signature is not the same as a live session — Code Coach revokes
sessions server-side, and a locally-verified token would keep working after
sign-out until it expired.

The 401-vs-503 distinction is deliberate: a `401` from Code Coach means reject
the caller; a timeout or connection error means Code Coach is *down*, and the
answer is `503`. Returning a user in that case would turn an outage into an
authentication bypass.

## Endpoints

All under `/api/v1/gamification`, all behind the auth middleware.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/game/:userId/:gameType/:conceptTag/:difficulty` | Serve one question. Pass `auto` as the difficulty to let the model choose. Strips `correctAnswer` and `explanation`. |
| `POST` | `/game/submit` | Grade, persist a `GameSession`, update streak and badges. |
| `GET` | `/profile/:userId` | Player profile. |
| `POST` | `/predict-difficulty` | Ask for a difficulty without starting a game. |

Unauthenticated: `GET /health`.

### Adaptive difficulty

`services/difficultyService.js` is the single implementation. It builds the six
features the model was trained on — four averages from this student's local
`gameSessions`, plus `repeat_error_count` from Code Coach — and asks the ML
service.

Responses say **which engine answered**, via `difficultyChosenBy` on a served
game and `source` on `/predict-difficulty`:

- `model` — the Random Forest chose it.
- `heuristic` — the ML service did not answer and the pre-ML if/else did. This
  is logged loudly, because it used to happen in complete silence.
- `requested` — the caller named an explicit level, which is never overridden.

Note that a served game's `difficulty` field is whatever the question bank
stored, and can differ from `targetDifficulty` — if no question exists at the
chosen level, the query falls back to type-only and then concept-only.

## Environment variables

`backend/.env` — see `.env.example` for the annotated copy.

| Variable | Default | Notes |
|---|---|---|
| `CODE_COACH_URL` | `http://127.0.0.1:8000` | Required. Nothing authenticates without it. |
| `CODE_COACH_TIMEOUT_MS` | `10000` | |
| `AUTH_CACHE_TTL_MS` | `60000` | A signed-out token keeps working for at most this long. |
| `MONGODB_URI` | `mongodb://localhost:27017/code-guru` | |
| `ML_SERVICE_URL` | `http://127.0.0.1:5000` | Falls back to `FLASK_ML_URL`. |
| `ML_TIMEOUT_MS` | `5000` | |
| `PORT` | `3002` | |
| `CORS_ORIGINS` | `5174` and `4200` origins | Browsers only; server-to-server is unaffected. |
| `DNS_SERVERS` | unset | Windows-only workaround for `querySrv ECONNREFUSED` on `mongodb+srv://`. |

## Running it

Code Coach must be up first — this service cannot authenticate anyone without it.

```bash
# terminal 1 - Code Coach, in that repo
uvicorn app.main:app --reload --port 8000
```

```bash
# terminal 2 - ML service
cd ml-service && pip install -r requirements.txt && python app.py
```

```bash
# terminal 3 - this backend
cd backend && npm install && npm start
```

```bash
# terminal 4 - frontend
cd frontend && npm install && npm run dev
```

Then open `http://localhost:5174` and sign in with a real Code Coach account.

## The difficulty model

`ml-service/model.pkl` is a scikit-learn `RandomForestClassifier`
(`n_estimators=100, max_depth=4, random_state=42`) over six features, in this
order: `avg_score`, `avg_attempts`, `avg_hint_usage`, `avg_time_seconds`,
`repeat_error_count`, `games_played`.

It is **committed**, deliberately. While it was gitignored it never reached a
checkout or an image, `/predict` answered `500 "Model not trained yet"`, and the
backend silently used the heuristic — so the Random Forest never ran at all.

Retrain from real sessions with `python ml-service/retrain_from_db.py`, which
reads `gameSessions` from Atlas and overwrites `model.pkl`. `POST /retrain` on
the ML service does the same thing from a request body and is guarded by the
`X-Retrain-Secret` header.

> **On training data.** `backend/data/simulate_students.js` seeds *generated*
> sessions so the collection is not empty on a fresh database. It derives each
> session's behaviour from the question's difficulty label, so a model trained
> on its output is recovering that script's if/else rather than learning
> anything about students. Use it to click through the UI; do not report a
> metric from a model fitted on it. `retrain_from_db.py` still prints
> "authentic human game sessions", which is wrong whenever the seeder produced
> the rows.

## Deployment

`Dockerfile` here and in `ml-service/`. Neither has been built yet — Docker was
not running on the machine where they were written, so treat the first build as
unverified.

The ML service has **no authentication and permissive CORS by design**, on the
assumption this backend sits in front of it. It must go in a private subnet
reachable only from this service, and must never be given a public listener.
