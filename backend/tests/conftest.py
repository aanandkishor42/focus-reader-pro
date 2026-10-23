from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture()
def app(tmp_path, monkeypatch) -> FastAPI:
    monkeypatch.setenv("FOCUS_READER_DB", str(tmp_path / "history.db"))
    monkeypatch.setenv("FOCUS_READER_TIMEZONE", "UTC")
    monkeypatch.delenv("FOCUS_READER_ALLOWED_ORIGINS", raising=False)

    from backend.app.main import create_app

    return create_app()


@pytest.fixture()
def client(app: FastAPI) -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
