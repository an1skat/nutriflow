import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_health_check():
    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_database_health_check_is_not_public_by_default():
    with TestClient(app) as client:
        response = client.get("/api/v1/health/db")

    assert response.status_code == 404


@pytest.mark.no_clean_database
def test_ready_check():
    with TestClient(app) as client:
        response = client.get("/api/v1/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "detail": "MongoDB available",
    }
