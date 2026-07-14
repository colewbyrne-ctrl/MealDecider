import importlib
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def test_database_url_normalization_accepts_common_postgres_forms(app_module):
    assert (
        app_module.normalize_database_url("postgres://user:pass@example.com:5432/meals")
        == "postgresql+psycopg://user:pass@example.com:5432/meals"
    )
    assert (
        app_module.normalize_database_url("postgresql://user:pass@example.com:5432/meals")
        == "postgresql+psycopg://user:pass@example.com:5432/meals"
    )
    assert (
        app_module.normalize_database_url(
            "DATABASE_URL='postgresql://user:pass@example.com:5432/meals?sslmode=require'"
        )
        == "postgresql+psycopg://user:pass@example.com:5432/meals?sslmode=require"
    )


def test_database_url_selection_skips_invalid_higher_priority_env_var(app_module, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "not a url")
    monkeypatch.setenv("POSTGRES_URL_NON_POOLING", "postgresql://user:pass@example.com:5432/meals")

    assert (
        app_module.get_database_url()
        == "postgresql+psycopg://user:pass@example.com:5432/meals"
    )


def test_database_url_normalization_rejects_invalid_or_non_postgres_urls(app_module):
    with pytest.raises(RuntimeError, match="valid SQLAlchemy URL"):
        app_module.normalize_database_url("not a url")

    with pytest.raises(RuntimeError, match="Only Postgres"):
        app_module.normalize_database_url("sqlite:///local.db")


def test_vercel_json_routes_only_api_to_python_function():
    config = json.loads(Path("vercel.json").read_text(encoding="utf-8"))

    assert config["buildCommand"] == "npm run build"
    assert config["outputDirectory"] == "dist"
    assert config["installCommand"] == "npm install"
    assert config["rewrites"] == [{"source": "/api/:path*", "destination": "/api/index.py"}]


def test_frontend_uses_vercel_api_path_in_production():
    frontend_source = Path("src/api/client.js").read_text(encoding="utf-8")

    assert 'import.meta.env.PROD ? "/api"' in frontend_source
    assert '"http://127.0.0.1:8000"' in frontend_source


def test_vercel_gateway_mounts_api(app_module):
    sys.modules["main"] = app_module
    sys.modules.pop("api.index", None)
    gateway_module = importlib.import_module("api.index")
    client = TestClient(gateway_module.app)

    response = client.get("/api/")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
