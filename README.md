# Meal Decider

Meal Decider is a full-stack recipe manager for keeping a private list of meal options, searching saved recipes, and getting dinner recommendations from your own collection or TheMealDB.

## Features

- Account registration, login, logout, and bearer-token sessions
- Private recipe collections scoped to the signed-in user
- Recipe create, read, update, delete, search, and detail views
- Meal quiz that ranks saved recipes by time, servings, difficulty, cuisine, and tags
- External recipe suggestions from TheMealDB, with optional save into your account
- Responsive Vite React interface for desktop, landscape, and portrait layouts
- FastAPI backend with SQLAlchemy and environment-driven database configuration

## Tech Stack

- Frontend: React, Vite, CSS
- Backend: Python, FastAPI, SQLAlchemy, Pydantic
- Local database: SQLite
- Hosted database: Postgres recommended for Vercel

## Project Structure

```text
.
|-- api/
|   `-- index.py         # Vercel FastAPI entrypoint mounted at /api
|-- main.py              # FastAPI app, models, auth, and recipe API routes
|-- requirements.txt     # Python backend dependencies
|-- package.json         # Frontend scripts and dependencies
|-- vercel.json          # Vercel build and routing configuration
|-- index.html           # Vite entry HTML
|-- src/
|   |-- main.jsx         # React application
|   `-- styles.css       # App styles
`-- meal_decider.db      # Local SQLite database, generated at runtime
```

## Local Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
npm install
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

## Configuration

Frontend:

- `VITE_API_URL`: optional API base URL. In production, the app defaults to `/api`; locally it defaults to `http://127.0.0.1:8000`.

Backend:

- `DATABASE_URL`: optional SQLAlchemy database URL. Defaults to `sqlite:///./meal_decider.db` for local development.
- `CORS_ALLOWED_ORIGINS`: optional comma-separated list of allowed frontend origins when the API is hosted separately.

## Vercel Deployment

This repo includes a Vercel-ready setup:

- `vercel.json` builds the Vite frontend into `dist`
- requests under `/api/*` go to the FastAPI entrypoint at `api/index.py`
- all other requests fall back to `index.html` for the React app

For a real hosted deployment, set `DATABASE_URL` to a persistent Postgres database. Do not rely on SQLite on Vercel because serverless function filesystems are not persistent application storage.

Recommended Vercel settings:

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`
- Environment Variable: `DATABASE_URL=<your postgres connection string>`

## Verification

```powershell
npm run build
.\.venv\Scripts\python.exe -m py_compile main.py api\index.py
```

To test the Vercel API wrapper locally:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.index:app --host 127.0.0.1 --port 8001
```

Then open `http://127.0.0.1:8001/api/`.
