from __future__ import annotations

import pytest


def payload(**overrides):
    body = {
        "title": "Valid title",
        "url": "https://example.com/article",
        "word_count": 100,
        "minutes": 1.0,
    }
    body.update(overrides)
    return body


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title", "   "),
        ("url", "chrome://settings"),
        ("url", "not-a-url"),
        ("word_count", -1),
        ("word_count", 10_000_001),
        ("minutes", -0.1),
        ("minutes", 1440.1),
    ],
)
def test_invalid_fields_return_422(client, field, value):
    response = client.post("/history", json=payload(**{field: value}))

    assert response.status_code == 422
    assert "detail" in response.json()


def test_unknown_fields_are_rejected(client):
    response = client.post("/history", json=payload(extra="not allowed"))

    assert response.status_code == 422


def test_invalid_pagination_returns_422(client):
    assert client.get("/history", params={"limit": 0}).status_code == 422
    assert client.get("/history", params={"limit": 1001}).status_code == 422
    assert client.get("/history", params={"offset": -1}).status_code == 422


def test_unknown_route_returns_404(client):
    response = client.get("/does-not-exist")

    assert response.status_code == 404
    assert response.json()["detail"] == "Not Found"
