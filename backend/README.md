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
| **Gamification ML service** | `5000` | Random Forest difficulty prediction (Flask), in `backend/ml` |
| Code Guru web app | `4200` | The one UI for the whole platform |

This component has no frontend of its own. It had a Vite app on `5174`; the
platform now has a single Next.js frontend (`codeguru-web`) serving every
component, so that one was a second UI for the same screens and has been removed.

Ports are not arbitrary: `3000` is PairPath's frontend, `3001` its API, `4200`
the web app. Taking one of those breaks whichever service starts second.

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
| `PORT` | `3002` | The Node API's port. |
| `ML_PORT` | `5000` | The Flask service's port. Separate name because both processes read this one file. |
| `RETRAIN_SECRET` | unset | Guards `POST /retrain`. Unset means the endpoint refuses everyone. |
| `CORS_ORIGINS` | `4200` origin | Browsers only; server-to-server is unaffected. |
| `DNS_SERVERS` | unset | Windows-only workaround for `querySrv ECONNREFUSED` on `mongodb+srv://`. |

## Running it

Code Coach must be up first — this service cannot authenticate anyone without it.

```bash
# terminal 1 - Code Coach, in that repo
uvicorn app.main:app --reload --port 8000
```

```bash
# terminal 2 - ML service
cd backend/ml && pip install -r requirements.txt && python app.py
```

```bash
# terminal 3 - this backend
cd backend && npm install && npm start
```

Tests: `npm test` (node's built-in runner, no dependency).

Seeding a fresh database:

```bash
node data/seed_75_questions.js        # BugHunt / DragDrop / CodeTrace
node data/seed_codefix_questions.js   # CodeFix, 5 per error type
```

Moving an existing three-level database onto the five-level ladder:

```bash
node data/migrate_to_five_levels.js           # dry run
node data/migrate_to_five_levels.js --apply
```

Then start `codeguru-web` (`npm run dev`, port 4200) and sign in with a real
Code Coach account. The games are under **Practice**.

## The games

| Type | The student... | Answer |
|---|---|---|
| `BugHunt` | picks the line that is wrong | a line index |
| `DragDrop` | orders shuffled lines | an ordering |
| `CodeTrace` | predicts what the code prints | a value |
| `CodeFix` | **rewrites the broken line** | a line of Java |

CodeFix is the only one that asks the student to write code rather than
recognise, order or predict it - and the only one that produces a real error
count. Because the answer is typed, it is checked: `POST /game/check` grades an
attempt **without ending the session** and records it, so `errorCount` is the
number of wrong attempts this server graded rather than `isCorrect ? 0 : 1`.
Sessions carry `errorCountMeasured` so a rule can tell the two apart.

Typed answers are marked by `services/gradingService.js`: whitespace outside
string literals is insignificant, everything else is significant, and a question
may list several accepted forms of the same fix. `npm test` covers it.

## Hints and support

Hints are **not** in the question payload. It carries `hintCount` only; each
hint comes from `POST /game/hint`, which hands over the next one the student has
not seen and records it. That is what makes `hintUsage` a measurement: it used
to be a number the client reported about itself while the score charged 15
points per hint, so all three could be read from the network tab for free.

Asking twice for the same hint returns it without counting it again — a page
refresh must not cost 15 points. `/game/check` reports how many hints remain but
never hands one over: a student is not billed for a hint they did not ask for.

`services/supportService.js` decides what a student needs beyond another round:

| action | when |
|---|---|
| `review_lesson` | 3 failures in a row, or unresolved Code Coach findings on the concept |
| `extra_practice` | the difficulty rule just dropped them a level |
| `slow_down` | passing, but averaging more than 1.5 hints a round |
| `keep_going` | nothing is wrong |

Every one carries the evidence it fired on, so a recommendation can be argued
with rather than just obeyed. Thresholds are env-configurable
(`SUPPORT_FAILURES_BEFORE_LESSON`, `SUPPORT_HINT_DEPENDENCE`, `SUPPORT_WINDOW`).

## Choosing the format

The four games differ in what they ask a student to do, and those demands are
ordered:

| | asks the student to | demand |
|---|---|---|
| `BugHunt` | recognise - point at the wrong line | lowest |
| `DragDrop` | arrange - put pieces in order | middle |
| `CodeTrace` | predict - say what it does | middle |
| `CodeFix` | **produce** - write the fix | highest |

**Recognise before produce.** `services/gameTypeService.js` starts a new concept
at the lowest demand the bank can serve, steps up when the student is
comfortable, and steps back down when they are not - because a student who
cannot yet spot a broken loop bound is not helped by being asked to write the
corrected one.

Ask for `auto` as the game type in the URL and the chooser decides. Name a type
and that type is served: a student choosing CodeFix deliberately should not be
quietly overridden.

## Difficulty and progression

Five levels: **Beginner, Elementary, Intermediate, Advanced, Expert**.

`services/progressionService.js` owns where a student is. It moves them only
after two consecutive sessions at or above 80% (advance) or at or below 40%
(regress), and only sessions at their current level count toward that run - so a
promotion cannot immediately promote again on the same evidence.

The model does not choose the level; it chooses *within* what the rule permits.
The permitted band is the inclusive range between where the student was and
where the rule just put them:

| the rule... | band | so the model... |
|---|---|---|
| holds them | `{ current }` | has no choice |
| advances | `{ previous, next }` | may decline the move |
| regresses | `{ next, previous }` | may decline the move |

It is a brake, never an engine. With the ML service down the rule alone decides,
which is exactly the engine the proposal describes.

Every level name from every era resolves through `resolveDifficulty` - Code
Coach's `beginner`/`intermediate`, and the retired `Easy`/`Medium`/`Hard`
(mapped to Beginner/Intermediate/Advanced), so old links and old sessions still
work.

## The difficulty model

`backend/ml/model.pkl` is a scikit-learn `RandomForestClassifier`
(`n_estimators=100, max_depth=4, random_state=42`) over the seven history
features in `ml/training_data.py` — `games_played`, `avg_score`, `avg_attempts`,
`avg_hint_usage`, `avg_time_seconds`, `recent_score`, `success_rate` — plus
`difficulty_ordinal`, the difficulty being scored.

It predicts P(success | history, difficulty), not the difficulty itself. The
earlier version took `repeat_error_count` and `games_played` — both derived from
`difficultyLevel` — and then predicted `difficultyLevel`, so it was recovering an
if/else from its own inputs. See `ml/training_data.py` for the full account.

It is **committed**, deliberately. While it was gitignored it never reached a
checkout or an image, `/predict` answered `500 "Model not trained yet"`, and the
backend silently used the heuristic — so the Random Forest never ran at all.

Retrain from real sessions with `python backend/ml/retrain_from_db.py`, which
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

`Dockerfile` here and in `ml/`. Both are built by `codeguru-web/deploy/docker-compose.yml`
as `gamification-api` and `gamification-ml`.

Two containers, deliberately, even though the ML code now lives under `backend/`.
They are two runtimes — Node and Python — and on a single-host deployment the
second container costs about 120 MB of memory and nothing in money; container
count is not what drives the bill. Separate images mean each keeps its own
restart policy, logs and health check, and one crashing does not take the other
down.

The ML service has **no authentication and permissive CORS by design**, on the
assumption this backend sits in front of it. It must go in a private subnet
reachable only from this service, and must never be given a public listener.
