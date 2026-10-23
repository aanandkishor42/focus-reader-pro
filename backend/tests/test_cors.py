from __future__ import annotations

from fastapi.testclient import TestClient


def test_exact_extension_origin_can_be_configured(monkeypatch, tmp_path):
    allowed = "chrome-extension://" + ("b" * 32)
    blocked = "chrome-extension://" + ("c" * 32)

    monkeypatch.setenv("FOCUS_READER_DB", str(tmp_path / "cors.db"))
    monkeypatch.setenv("FOCUS_READER_TIMEZONE", "UTC")
    monkeypatch.setenv("FOCUS_READER_ALLOWED_ORIGINS", allowed)

    from backend.app.main import create_app

    application = create_app()
    with TestClient(application) as client:
        allowed_response = client.get("/health", headers={"Origin": allowed})
        blocked_response = client.get("/health", headers={"Origin": blocked})

    assert allowed_response.headers["access-control-allow-origin"] == allowed
    assert "access-control-allow-origin" not in blocked_response.headers


def test_extension_preflight_allows_json_writes(monkeypatch, tmp_path):
    origin = "chrome-extension://" + ("d" * 32)

    monkeypatch.setenv("FOCUS_READER_DB", str(tmp_path / "cors-preflight.db"))
    monkeypatch.setenv("FOCUS_READER_TIMEZONE", "UTC")
    monkeypatch.setenv("FOCUS_READER_ALLOWED_ORIGINS", origin)

    from backend.app.main import create_app

    application = create_app()
    with TestClient(application) as client:
        response = client.options(
            "/history",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "content-type" in response.headers["access-control-allow-headers"].lower()
