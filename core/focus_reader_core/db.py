from __future__ import annotations

import os
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = PROJECT_ROOT / "backend" / "data" / "history.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    word_count INTEGER NOT NULL CHECK (word_count >= 0),
    minutes REAL NOT NULL CHECK (minutes >= 0),
    visited_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_visited_at ON history(visited_at);
CREATE INDEX IF NOT EXISTS idx_history_domain ON history(domain);
"""


def get_db_path() -> Path:
    """Allow tests and power users to point the local database elsewhere."""
    override = os.getenv("FOCUS_READER_DB", "").strip()
    return Path(override).expanduser() if override else DEFAULT_DB_PATH


def connect(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(db_path) if db_path is not None else get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    # FastAPI may run each request in a different worker thread. The connection
    # itself is still used by only one request at a time.
    connection = sqlite3.connect(path, timeout=10, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def init_db(db_path: str | Path | None = None) -> None:
    connection = connect(db_path)
    try:
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()
