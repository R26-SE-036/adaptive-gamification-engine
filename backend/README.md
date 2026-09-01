# Adaptive Gamification Engine (Code Guru)

Production gamification component integrated with the **Code Coach platform API** and shared **MongoDB Atlas** database.

## Architecture

| Service | Port | Role |
|---------|------|------|
| Code Coach API | `8000` | Auth, struggle signals, game recommendations |
| Gamification backend | `3000` | Question bank, scoring, player profile |
| Gamification frontend | `5173` | Login, dashboard, game UI |

## Code Coach APIs Used

- `POST /api/v1/auth/login` — real student login (email as `identifier`)
- `GET /api/v1/auth/me` — session validation
- `POST /api/v1/auth/refresh` — token refresh
- `POST /api/v1/auth/logout` — logout
- `POST /api/v1/learning-sessions` — create gamification session
- `GET /api/v1/students/me/struggling-concepts` — real frustration/struggle level
- `GET /api/v1/gamification/me/recommendations` — game type + difficulty
- `POST /api/v1/gamification/me/adaptation-decisions` — record game assignment
- `POST /api/v1/gamification/me/session-results` — record game completion

Local gamification backend endpoints (same JWT from Code Coach):

- `GET /api/v1/gamification/game/:userId/:gameType/:conceptTag/:difficulty`
- `POST /api/v1/gamification/game/submit`
- `GET /api/v1/gamification/profile/:userId`

## Environment Variables

### Backend (`backend/.env`)

- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — must match Code Coach JWT secret
- `ML_SERVICE_URL` — optional ML difficulty service

### Frontend (`frontend/.env`)

- `VITE_CODE_COACH_API_URL` — default `/code-coach-api/api/v1` (Vite proxy → port 8000)
- `VITE_GAMIFICATION_API_URL` — default `http://localhost:3000/api/v1`

## Run (Final Demo)

**Terminal 1 — Code Coach backend** (must be running first):

```bash
# Your Code Coach project
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Gamification backend:**

```bash
cd backend
npm install
npm start
```

**Terminal 3 — Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173/login` and sign in with a **real Code Coach student account**.

## Demo Flow

1. Student codes in VS Code → Code Coach saves diagnostics to MongoDB
2. Student logs into Gamification web app with same email/password
3. Dashboard reads live struggle + recommendations from Code Coach API
4. Student plays assigned game (BugHunt / DragDrop / CodeTrace)
5. Results saved locally + reported back to Code Coach platform

## Notes

- No demo/mock auth in production path
- Login uses email via Code Coach `identifier` field
- Frustration level comes from `struggle_level` and `struggle_score` in Code Coach API
- Game type comes from `GET /gamification/me/recommendations`
