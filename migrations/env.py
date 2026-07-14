"""Alembic environment.

Reuses the application's SQLAlchemy metadata and database-URL resolution so the
migration history always matches the ORM models in main.py and targets the same
database the app uses.
"""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# The Alembic CLI is driving migrations here, so main.py must not kick off its own
# startup upgrade while we import it (that would nest one Alembic run inside another).
os.environ["MEAL_DECIDER_SKIP_STARTUP_MIGRATIONS"] = "1"
from main import Base, get_database_url

os.environ.pop("MEAL_DECIDER_SKIP_STARTUP_MIGRATIONS", None)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Prefer a URL set by the caller (e.g. the app's startup upgrade), otherwise
# resolve it the same way the app does at runtime.
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", get_database_url())

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
