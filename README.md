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
- Database: Postgres

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

## Configuration

Frontend:

- `VITE_API_URL`: optional API base URL. In production, the app defaults to `/api`; locally it defaults to `http://127.0.0.1:8000`.

Backend:

- `DATABASE_URL`: Postgres connection string.
- `POSTGRES_URL_NON_POOLING`: optional fallback used when `DATABASE_URL` is not set.
- `POSTGRES_URL`: optional fallback used when neither `DATABASE_URL` nor `POSTGRES_URL_NON_POOLING` is set.
- `CORS_ALLOWED_ORIGINS`: optional comma-separated list of allowed frontend origins when the API is hosted separately.

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
npm run build
.\.venv\Scripts\python.exe -m py_compile main.py api\index.py
.\.venv\Scripts\python.exe -m pytest
```

To test the Vercel API wrapper locally:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.index:app --host 127.0.0.1 --port 8001
```

Then open `http://127.0.0.1:8001/api/`.
