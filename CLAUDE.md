# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sisaket Robotics 2026 — a full-stack web application for managing and scoring a robotics competition with 18 competition types organized by age groups and skill levels. The UI and codebase comments are primarily in Thai.

## Commands

All backend commands run from the `backend/` directory.

```bash
# Install dependencies
npm install

# Development (nodemon, NODE_ENV=development)
npm run dev

# Production
npm start

# Seed database (18 competitions + default users)
npm run seed          # auto-detects env
npm run seed:dev      # development env
npm run seed:prod     # production env
```

```bash
# Local full-stack (MongoDB + backend + nginx frontend)
docker-compose up
```

CI syntax checks (mirrors GitHub Actions):
```bash
# Check backend JS syntax
find backend/routes backend/models backend/middleware backend/config -name "*.js" -exec node --check {} \;
node --check frontend/js/app.js
```

There are no automated test suites — CI validates syntax and builds the Docker image.

## Architecture

### Deployment model

A single Node.js/Express container serves both the REST API (`/api/*`) and the static frontend. MongoDB runs externally (Atlas or DigitalOcean Managed). Deployed to DigitalOcean App Platform via GitHub Actions on push to `main`.

### Backend (`backend/`)

| Layer | Location | Notes |
|---|---|---|
| Entry point | `server.js` | Mounts all routes, serves `frontend/` as static |
| Config | `config/env.js` | Smart multi-file env loader (see below) |
| Models | `models/` | Mongoose schemas: User, Competition, Team, Score, Match |
| Routes | `routes/` | auth, competitions, teams, scores, rankings, matches |
| Auth middleware | `middleware/auth.js` | JWT validation + role checks (admin/judge/viewer) |
| Seed | `seed.js` | Idempotent — safe to re-run |

**Environment loading priority** (`config/env.js`):
1. `.env.{NODE_ENV}.local` — personal overrides, gitignored
2. `.env.local` — personal overrides, gitignored
3. `.env.{NODE_ENV}` — committed environment defaults
4. `.env` — legacy fallback
5. Platform-injected `process.env` always wins

### Data model relationships

- **Competition**: 18 types with `scoringType` = `point` | `time` | `battle`; defines rounds, age groups, scoring criteria
- **Team**: enrolled in one Competition; belongs to a school
- **Score**: one record per Team × round; `details` field is flexible per `scoringType`
- **Match**: used only for `battle`-type competitions (head-to-head); references two Teams

### API access control

- **Public** (no auth): `GET /api/competitions`, `GET /api/teams`, `GET /api/rankings`, `GET /api/matches`
- **Auth required**: `POST /api/scores`, `PUT /api/scores/:id`
- **Admin only**: `POST /api/auth/register`, competition/team management mutations

### Frontend (`frontend/`)

Vanilla JavaScript SPA — no framework, no bundler. All logic lives in `frontend/js/app.js` (~90 KB). The single `index.html` contains embedded HTML templates rendered by JS. The frontend communicates with the backend exclusively via the Fetch API against `/api/*`.

## Default seed users

| Username | Password | Role |
|---|---|---|
| admin | admin1234 | admin |
| judge1 | judge1234 | judge |
| judge2 | judge1234 | judge |

## Key environment variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `PORT` | HTTP port (default 5000) |
| `NODE_ENV` | `development` or `production` |

Production secrets are injected via the DigitalOcean App Platform dashboard (never committed).
