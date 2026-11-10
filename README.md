# Skill Sphere – Backend (Node.js)

REST API for the Skill Sphere Flutter app.

* **Firebase Auth** = login / sign-up only (done inside the app).
* **This server** = everything else: profiles, photos, forms, jobs, applications, learning progress.
* The app sends its **Firebase ID token** with every request
  (`Authorization: Bearer <token>`); the server verifies it (RS256, issuer, audience, expiry)
  and requires a **verified email**.
* Stack: Node 22, Express 4, libSQL (SQLite locally, **Turso** in production), `jose`, `zod`, `helmet`, rate limiting.
* Runs as a normal server (`npm start`) **or** as a Vercel serverless function (`api/index.js`).

## Run locally
```bash
cd backend
cp .env.example .env      # set FIREBASE_PROJECT_ID
npm install
npm test                  # 11 integration tests
npm start                 # http://localhost:3000   (health: /health)
```

## Environment
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `FIREBASE_PROJECT_ID` | skillsphere-7aada | Must match your Firebase project |
| `DATABASE_URL` | file:./data/skillsphere.db | Local SQLite file, or `libsql://...` (Turso) |
| `DATABASE_AUTH_TOKEN` | (empty) | Turso auth token |
| `CORS_ORIGINS` | (empty) | Allowed origins, only for Flutter web |
| `REQUIRE_VERIFIED_EMAIL` | true | Reject tokens whose email is not verified |
| `RATE_LIMIT_MAX` | 600 | Requests / IP / 15 min |

## API (all under `/api/v1`, all need a Bearer token)
| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | My profile (+ interests, progress, location). Created on first call |
| PUT | `/me` | `{name, phone}` |
| PUT | `/me/photo` | `{photo: <base64 JPEG/PNG> or null}` (max ~300 KB) |
| PUT | `/me/location` | `{lat, lng, city}` |
| PUT/DELETE | `/me/interests/:subId` | Save / unsave a skill |
| PUT | `/me/progress/:subId/:index` | `{done: bool}` mark topic |
| GET | `/me/applied` | `{ids: [jobId]}` jobs I applied to |
| DELETE | `/me` | Delete all my data (app then deletes the Firebase account) |
| POST | `/students` | Student application (one per user, upsert) |
| POST / GET | `/colleges` | Register college / list (`?city=`) |
| POST | `/software-houses` | Register company |
| GET | `/software-houses/mine` | `{name}` of my company |
| GET | `/jobs` | Browse (`?limit&city&type&q`) |
| GET | `/jobs/mine` | My jobs with `applicantCount` |
| POST | `/jobs` | Post a job |
| DELETE | `/jobs/:id` | Delete my job (owner only) |
| POST | `/jobs/:id/apply` | Apply (uses my profile; idempotent; not your own job) |
| GET | `/jobs/:id/applicants` | Applicants (owner only) |

Errors are always `{ "error": { "code": "...", "message": "..." } }`.

## Deploy on Vercel (+ Turso database)
Vercel cannot keep a SQLite file (its filesystem is temporary), so production uses **Turso**
(hosted SQLite, free tier). See `DEPLOY_VERCEL.md` for the step-by-step guide.

Environment variables on Vercel: `FIREBASE_PROJECT_ID`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `NODE_ENV=production`.

Note: the rate limiter keeps its counters in memory, so on serverless the limit applies per warm instance.
