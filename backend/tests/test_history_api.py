from __future__ import annotations

import sqlite3
from datetime import datetime

from backend.app.dependencies import get_connection

EXTENSION_ORIGIN = "chrome-extension://" + ("a" * 32)


def payload(**overrides):
    body = {
        "title": "Example article",
        "url": "https://www.example.com/article",
        "word_count": 1000,
        "minutes": 5.0,
        "visited_at": "2026-10-23T10:00:00Z",
    }
    body.update(overrides)
    return body


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_and_docs_are_available(client):
    docs = client.get("/docs")
    schema = client.get("/openapi.json")

    assert docs.status_code == 200
    assert schema.status_code == 200
    assert "/history" in schema.json()["paths"]
    assert "/stats/today" in schema.json()["paths"]


def test_create_history_entry(client):
    response = client.post("/history", json=payload())

    assert response.status_code == 201
    body = response.json()
    assert body["id"] > 0
    assert body["title"] == "Example article"
    assert body["url"] == "https://www.example.com/article"
    assert body["domain"] == "example.com"
    assert body["word_count"] == 1000
    assert body["minutes"] == 5.0
    assert datetime.fromisoformat(body["visited_at"].replace("Z", "+00:00"))


def test_create_history_with_server_timestamp(client):
    body = payload()
    body.pop("visited_at")

    response = client.post("/history", json=body)

    assert response.status_code == 201
    assert response.json()["visited_at"]


def test_title_is_cleaned(client):
    response = client.post(
        "/history",
        json=payload(title="  A\n\nvery   useful\ttitle  "),
    )

    assert response.status_code == 201
    assert response.json()["title"] == "A very useful title"


def test_list_history_newest_first(client):
    client.post("/history", json=payload(title="Older", visited_at="2026-10-22T10:00:00Z"))
    client.post("/history", json=payload(title="Newer", visited_at="2026-10-23T10:00:00Z"))

    response = client.get("/history")

    assert response.status_code == 200
    assert [entry["title"] for entry in response.json()] == ["Newer", "Older"]


def test_list_history_supports_pagination_and_domain_filter(client):
    for title, domain in [
        ("One", "example.com"),
        ("Two", "news.example"),
        ("Three", "example.com"),
    ]:
        client.post(
            "/history",
            json=payload(title=title, url=f"https://{domain}/article"),
        )

    paginated = client.get("/history", params={"limit": 1, "offset": 1})
    filtered = client.get("/history", params={"domain": "example.com"})

    assert paginated.status_code == 200
    assert len(paginated.json()) == 1
    assert {entry["title"] for entry in filtered.json()} == {"One", "Three"}


def test_empty_history_returns_empty_list(client):
    response = client.get("/history")

    assert response.status_code == 200
    assert response.json() == []


def test_delete_history_returns_deleted_count(client):
    client.post("/history", json=payload())
    client.post("/history", json=payload(title="Second"))

    response = client.delete("/history")

    assert response.status_code == 200
    assert response.json() == {"deleted": 2}
    assert client.get("/history").json() == []


def test_cors_allows_chrome_extension_origins(client):
    response = client.get("/health", headers={"Origin": EXTENSION_ORIGIN})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == EXTENSION_ORIGIN


def test_cors_rejects_website_origins(client):
    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_cors_preflight_for_history_post(client):
    response = client.options(
        "/history",
        headers={
            "Origin": EXTENSION_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == EXTENSION_ORIGIN


def test_database_errors_return_clear_503(app, client):
    def broken_connection():
        raise sqlite3.OperationalError("database is locked")

    app.dependency_overrides[get_connection] = broken_connection

    response = client.get("/history")

    assert response.status_code == 503
    assert response.json() == {"detail": "The local reading database is unavailable."}
