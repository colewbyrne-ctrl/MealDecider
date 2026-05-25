import importlib
import sys
import uuid
from pathlib import Path

import pytest


@pytest.fixture()
def app_module(monkeypatch):
    database_dir = Path(".pytest-tmp") / "databases"
    database_dir.mkdir(parents=True, exist_ok=True)
    database_path = (database_dir / f"{uuid.uuid4().hex}.db").resolve()

    monkeypatch.setenv("MEAL_DECIDER_TESTING", "1")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path.as_posix()}")
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL_NON_POOLING", raising=False)

    for module_name in ["api.index", "main"]:
        sys.modules.pop(module_name, None)

    module = importlib.import_module("main")
    yield module

    module.engine.dispose()
    if database_path.exists():
        database_path.unlink()
    for module_name in ["api.index", "main"]:
        sys.modules.pop(module_name, None)
