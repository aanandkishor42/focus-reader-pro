from __future__ import annotations

import sqlite3

import pytest

from focus_reader_core.db import connect, init_db


@pytest.fixture()
def db_connection(tmp_path) -> sqlite3.Connection:
    database_path = tmp_path / "history.db"
    init_db(database_path)
    connection = connect(database_path)
    try:
        yield connection
    finally:
        connection.close()
