from __future__ import annotations

from datetime import datetime

from focus_reader_core.time_utils import UTC


def payload(**overrides):
    body = {
        "title": "Stats article",
        "url": "https://www.example.com/stats",
        "word_count": 1200,
        "minutes": 6.5,
        "visited_at": datetime.now(UTC).isoformat(),
    }
    body.update(overrides)
    return body


def test_today_stats_include_new_entry(client):
    client.post("/history", json=payload())

    response = client.get("/stats/today")

    assert response.status_code == 200
    body = response.json()
    assert body["pages"] == 1
    assert body["minutes"] == 6.5
    assert body["words"] == 1200
    assert body["date"] == datetime.now(UTC).date().isoformat()


def test_week_stats_return_seven_days_and_top_domain(client):
    client.post("/history", json=payload())

    response = client.get("/stats/week")

    assert response.status_code == 200
    body = response.json()
    assert len(body["days"]) == 7
    assert body["pages"] == 1
    assert body["minutes"] == 6.5
    assert body["top_domains"][0]["domain"] == "example.com"


def test_stats_are_zero_after_delete(client):
    client.post("/history", json=payload())
    client.delete("/history")

    today = client.get("/stats/today").json()
    week = client.get("/stats/week").json()

    assert today["pages"] == 0
    assert today["minutes"] == 0
    assert week["pages"] == 0
    assert week["top_domains"] == []


def test_stats_accept_timezone_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("FOCUS_READER_DB", str(tmp_path / "stats.db"))
    monkeypatch.setenv("FOCUS_READER_TIMEZONE", "UTC")
    monkeypatch.delenv("FOCUS_READER_ALLOWED_ORIGINS", raising=False)

    from backend.app.main import create_app
    from fastapi.testclient import TestClient

    application = create_app()
    with TestClient(application) as local_client:
        local_client.post("/history", json=payload(visited_at="2026-10-23T10:00:00Z"))
        response = local_client.get("/stats/week")

    assert response.status_code == 200
    assert response.json()["end_date"] == "2026-10-23"
