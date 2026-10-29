"""Tests for Model Registry metadata, parameter disclosures, and availability mapping."""

import pytest
from app.services.model_registry import ModelRegistry, model_registry


def test_registered_candidate_models():
    """Verify all 3 required small language models are registered."""
    models = model_registry.get_registered_models()
    tags = [m.tag for m in models]

    assert "qwen2.5:3b" in tags
    assert "llama3.2:3b" in tags
    assert "qwen3:1.7b" in tags


def test_qwen25_parameter_distinction():
    """Ensure the ~3.09B parameter distinction for Qwen2.5 3B is explicitly recorded."""
    qwen = model_registry.get_model("qwen2.5:3b")
    assert qwen is not None
    assert "3.09B" in qwen.parameter_count or "3.09" in qwen.published_parameters
    assert "3.09B" in qwen.architecture_note


def test_update_availability():
    """Test updating registry availability from simulated Ollama /api/tags response."""
    registry = ModelRegistry()

    simulated_ollama_tags = [
        {
            "name": "qwen2.5:3b:latest",
            "size": 1900000000,
            "modified_at": "2026-10-18T00:00:00Z",
            "details": {"quantization_level": "Q4_K_M"},
        }
    ]

    registry.update_availability(simulated_ollama_tags)

    qwen = registry.get_model("qwen2.5:3b")
    llama = registry.get_model("llama3.2:3b")

    assert qwen.is_available_locally is True
    assert qwen.size_on_disk_bytes == 1900000000
    assert qwen.quantization_level == "Q4_K_M"

    assert llama.is_available_locally is False
    assert llama.size_on_disk_bytes is None


def test_invalid_model_rejection():
    """Verify unknown models are rejected by is_valid_model."""
    assert model_registry.is_valid_model("gpt-4-cloud") is False
    assert model_registry.is_valid_model("qwen2.5:3b") is True
