# Meal Decider

Meal Decider is a full-stack recipe manager for keeping a private list of meal options, searching saved recipes, and getting dinner recommendations from your own collection or TheMealDB.

## Features

- Account registration, login, logout, and bearer-token sessions
- Private recipe collections scoped to the signed-in user
- Recipe create, read, update, delete, search, and detail views with ingredients and instructions
- Camera/photo recipe import that drafts meal attributes from an image
- Meal quiz that ranks saved recipes by max time, max difficulty, cuisine, and tags
- Ingredient-based saved recipe finder that ignores common pantry staples and seasonings
- Persisted two-week meal calendar with recipes, custom messages, and schedule generation
- Shopping list page built from selected calendar recipes, with ingredient totals and check-off state
- External recipe suggestions from TheMealDB, with optional save into your account
- Progressive Web App support for adding Meal Decider to an iPhone Home Screen
- Responsive Vite React interface for desktop, landscape, and portrait layouts
- FastAPI backend with SQLAlchemy and environment-driven database configuration

## Tech Stack

- Frontend: React + TypeScript, Vite, CSS, componentized into pages/hooks/lib with a shared, typed API client
- Backend: Python, FastAPI, SQLAlchemy, Pydantic
- Database: Postgres, with Alembic migrations
- Testing: pytest (backend), Vitest + React Testing Library (frontend)
- CI: GitHub Actions (pytest + typecheck + Vite build)

## Project Structure

```text
.
|-- api/
|   `-- index.py         # Vercel FastAPI entrypoint mounted at /api
|-- main.py              # FastAPI app, models, auth, and recipe API routes
|-- alembic.ini          # Alembic configuration
|-- migrations/          # Alembic environment and versioned migrations
|   |-- env.py
|   `-- versions/
|-- requirements.txt     # Python backend dependencies
|-- package.json         # Frontend scripts and dependencies
|-- vercel.json          # Vercel build and routing configuration
|-- index.html           # Vite entry HTML
|-- .github/workflows/   # CI pipeline (pytest + typecheck + Vite build)
|-- tsconfig.json        # TypeScript configuration
|-- vite.config.js       # Vite + Vitest configuration
|-- src/
|   |-- main.tsx         # Entry point (mounts App, registers service worker)
|   |-- App.tsx          # Orchestrator: state + handlers, delegates to pages
|   |-- types.ts         # Shared domain types (Recipe, MealPlanEntry, ...)
|   |-- api/client.ts    # Base URL, typed fetch wrapper, named endpoint helpers
|   |-- hooks/           # useAuth (persisted session)
|   |-- lib/             # Pure logic: ingredients, matching, shopping, calendar (+ *.test.ts)
|   |-- components/      # Sidebar, RecipeDetails
|   |-- pages/           # ManageRecipes, RecipesLibrary, CalendarPage, ShoppingPage, DeciderPage
|   `-- styles.css       # App styles
`-- tests/               # Backend pytest suite
```

## Architecture

### System overview

A React + TypeScript single-page app talks to a FastAPI backend over a JSON API.
Both are deployed on Vercel: the built static assets are served directly, and any
request under `/api/*` is routed to the FastAPI app. The backend owns all
persistence (Postgres) and brokers the two external services.

```mermaid
flowchart LR
    UI["React + TypeScript SPA"]

    subgraph Vercel
      Static["Static dist/ assets"]
      API["FastAPI (/api)<br/>api/index.py -> main.py"]
    end

    DB[("Postgres / Neon")]
    Claude["Anthropic Claude<br/>Vision API"]
    MealDB["TheMealDB API"]

    UI -->|"initial load"| Static
    UI -->|"fetch /api/* (Bearer token)"| API
    API -->|"SQLAlchemy + Alembic"| DB
    API -->|"photo -> recipe draft"| Claude
    API -->|"external recipe suggestions"| MealDB
```

### Frontend structure

`main.tsx` mounts `App.tsx`, the single orchestrator that holds all state and
handlers. `App` delegates rendering to five page components, calls the backend
only through the typed `api/client.ts`, and pushes all non-UI logic into the pure,
unit-tested `lib/` modules.

```mermaid
flowchart TD
    main["main.tsx<br/>entry"] --> App["App.tsx<br/>state + handlers"]
    App --> useAuth["hooks/useAuth<br/>persisted session"]
    App --> client["api/client.ts<br/>typed endpoints"]

    App --> Pages
    subgraph Pages["pages/"]
      Manage[ManageRecipes]
      Library[RecipesLibrary]
      Calendar[CalendarPage]
      Shopping[ShoppingPage]
      Decider[DeciderPage]
    end
    Pages --> Comp["components/<br/>Sidebar, RecipeDetails"]

    App --> Lib
    subgraph Lib["lib/ (pure, tested)"]
      ingredients
      ingredientMatch
      shopping
      calendar
    end

    client -->|"fetch"| API["FastAPI /api"]
```

### Request lifecycle

Every request carries the bearer token; the backend resolves the current user,
scopes the query to that user, runs its logic, and returns a typed payload. The
"pick a saved meal" flow below also exercises the recommendation scorer.

```mermaid
sequenceDiagram
    participant U as User
    participant D as DeciderPage
    participant A as App.tsx
    participant C as api/client.ts
    participant F as FastAPI
    participant DB as Postgres

    U->>D: Set constraints, "Pick saved meal"
    D->>A: onDecide(event)
    A->>C: recommendRecipes(token, prefs)
    C->>F: POST /recipes/recommend (Bearer token)
    F->>F: get_current_user (verify token)
    F->>DB: SELECT recipes WHERE owner_id = user
    F->>F: filter, score, weighted-random pick N
    F-->>C: { options: [{ recipe, reasons }] }
    C-->>A: typed Recommendation[]
    A->>D: render ranked options
```

### Recommendation scoring

`/recipes/recommend` first filters saved recipes to those within the requested max
time and difficulty, then scores each on four features combined by
`meal_score` (weights in `SCORE_WEIGHTS`), and finally makes a weighted-random pick
so repeated runs stay varied. The pure scoring helpers are covered by
`tests/test_recommendation_engine.py`.

```mermaid
flowchart LR
    recipes[("Saved recipes")] --> filter
    prefs["Preferences<br/>time, difficulty, cuisine, tags"] --> filter{"Within max<br/>time & difficulty?"}
    filter -->|no| drop["Excluded"]
    filter -->|yes| feats["Feature vector"]

    feats --> t["time_fit"]
    feats --> d["difficulty_fit"]
    feats --> cu["cuisine_fit"]
    feats --> kw["keyword_fit"]

    t --> score["meal_score<br/>0.2 / 0.2 / 0.3 / 0.3"]
    d --> score
    cu --> score
    kw --> score
    score --> pick["Weighted-random<br/>pick N options"]
```

### Data model

Everything is scoped to a user. Recipes may be user-authored or imported from
TheMealDB (`source` / `external_id`); calendar entries reference either a saved
recipe or hold a free-text `custom_message`.

```mermaid
erDiagram
    USER ||--o{ RECIPE : owns
    USER ||--o{ AUTH_TOKEN : has
    USER ||--o{ MEAL_PLAN_ENTRY : plans
    RECIPE ||--o{ MEAL_PLAN_ENTRY : scheduled_in

    USER {
      int id PK
      string email UK
      string name
      string password_hash
    }
    RECIPE {
      int id PK
      int owner_id FK
      string name
      int time_minutes
      string cuisine
      string difficulty
      string source
      string external_id
    }
    AUTH_TOKEN {
      int id PK
      string token UK
      int user_id FK
      string expires_at
    }
    MEAL_PLAN_ENTRY {
      int id PK
      int owner_id FK
      string plan_date
      int recipe_id FK
      string custom_message
    }
```

## Local Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
npm install
```

Create a local `.env` file with your Postgres connection string:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

Start the backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal:

```powershell
npm run dev
```

The frontend runs at `http://127.0.0.1:5173`, and the API runs at `http://127.0.0.1:8000`.

## Database Migrations

The schema is managed by [Alembic](https://alembic.sqlalchemy.org/). Alembic reuses the
app's SQLAlchemy models (`Base.metadata`) and the same `get_database_url()` resolver, so
migrations always target the configured database.

The app runs `alembic upgrade head` automatically on startup (see `run_migrations()` in
`main.py`), which keeps serverless cold starts self-provisioning. You can also drive it
manually:

```powershell
# Apply all migrations
.\.venv\Scripts\alembic.exe upgrade head

# Show the current revision / full history
.\.venv\Scripts\alembic.exe current
.\.venv\Scripts\alembic.exe history

# Create a new migration after changing the models in main.py
.\.venv\Scripts\alembic.exe revision --autogenerate -m "describe change"
```

### Adopting migrations on an existing database

A database that already had its tables created by the pre-Alembic bootstrap has no
`alembic_version` row, so the first `upgrade` would try to re-create existing tables.
Stamp it as already-current **once** before deploying this change:

```powershell
.\.venv\Scripts\alembic.exe stamp head
```

Fresh/empty databases need no stamping — `upgrade head` builds them from scratch.

## iPhone Home Screen App

Meal Decider includes PWA metadata, icons, and a service worker. After deploying to HTTPS, open the site in Safari on iPhone, tap Share, and choose Add to Home Screen.

## Configuration

Frontend:

- `VITE_API_URL`: optional API base URL. In production, the app defaults to `/api`; locally it defaults to `http://127.0.0.1:8000`.

Backend:

- `DATABASE_URL`: Postgres connection string.
- `POSTGRES_URL_NON_POOLING`: optional fallback used when `DATABASE_URL` is not set.
- `POSTGRES_URL`: optional fallback used when neither `DATABASE_URL` nor `POSTGRES_URL_NON_POOLING` is set.
- `CORS_ALLOWED_ORIGINS`: optional comma-separated list of allowed frontend origins when the API is hosted separately.
- `ANTHROPIC_API_KEY`: required for camera/photo recipe scanning with Claude.
- `ANTHROPIC_VISION_MODEL`: optional Claude model override. Defaults to `claude-sonnet-4-5`.

Photo scanning uses Anthropic's Claude API. In Vercel, add `ANTHROPIC_API_KEY` as a server-side environment variable; do not expose it in frontend code.

## Vercel Deployment

This repo includes a Vercel-ready setup:

- `vercel.json` builds the Vite frontend into `dist`
- requests under `/api/*` go to the FastAPI entrypoint at `api/index.py`

For hosted deployment, set `DATABASE_URL` to a persistent Postgres database. Vercel Marketplace Postgres integrations may also inject `POSTGRES_URL` or `POSTGRES_URL_NON_POOLING`, which the app can use automatically.

Recommended Vercel settings:

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`
- Environment Variable: `DATABASE_URL=<your postgres connection string>`

## Verification

```powershell
npm run typecheck      # tsc --noEmit
npm test               # Vitest suite
npm run build          # typecheck + Vite production build
.\.venv\Scripts\python.exe -m py_compile main.py api\index.py
.\.venv\Scripts\python.exe -m pytest
```

`npm run build` runs `tsc --noEmit && vite build`, so a type error fails the build. Use
`npm run test:watch` while developing. These checks (pytest + typecheck + Vite build) run on
every push and pull request via GitHub Actions (`.github/workflows/ci.yml`).

To test the Vercel API wrapper locally:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.index:app --host 127.0.0.1 --port 8001
```

Then open `http://127.0.0.1:8001/api/`.
