"""Tests for health check endpoint and preflight reporting."""

import pytest
from fastapi.testclient import TestClient


def test_health_endpoint_structure(client: TestClient):
    """Verify /api/health returns well-formed diagnostics."""
    response = client.get("/api/health")
    assert response.status_code == 200

    data = response.json()
    assert "status" in data
    assert data["status"] in ["healthy", "degraded", "offline"]
    assert "ollama" in data
    assert "resources" in data
    assert "models" in data
    assert "storage" in data

    # Verify model candidate reporting
    models_info = data["models"]
    assert models_info["candidate_count"] == 3
    assert "candidate_count" in models_info
    assert isinstance(models_info["installed_tags"], list)
    assert isinstance(models_info["missing_tags"], list)


def test_models_list_endpoint(client: TestClient):
    """Verify /api/models returns candidate list with tags and commands."""
    response = client.get("/api/models")
    assert response.status_code == 200

    data = response.json()
    assert "models" in data
    assert len(data["models"]) == 3
    assert "default_model" in data

    tags = [m["tag"] for m in data["models"]]
    assert "qwen2.5:3b" in tags
    assert "llama3.2:3b" in tags
    assert "qwen3:1.7b" in tags

    for m in data["models"]:
        assert "install_command" in m
        assert "capabilities" in m
        assert "architecture_note" in m


def test_root_api_endpoint(client: TestClient):
    """Verify /api returns API metadata and docs URL."""
    response = client.get("/api")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Local SLM Laboratory"
    assert data["docs_url"] == "/docs"
