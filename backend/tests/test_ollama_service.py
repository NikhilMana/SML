"""Tests for Ollama service error handling and graceful degradation."""

import pytest
from app.services.ollama_service import OllamaService
from app.core.exceptions import ModelUnavailableException


@pytest.mark.asyncio
async def test_ollama_offline_health():
    """Verify get_health gracefully reports offline state when daemon is not reachable."""
    service = OllamaService()
    # Point to nonexistent port to simulate offline daemon
    service.base_url = "http://127.0.0.1:54321"

    health = await service.get_health()
    assert health["is_running"] is False
    assert health["version"] is None
    assert "error" in health


@pytest.mark.asyncio
async def test_model_unavailable_exception_on_unpulled_model():
    """Ensure attempting inference on an uninstalled model raises ModelUnavailableException."""
    service = OllamaService()
    service.base_url = "http://127.0.0.1:54321"

    with pytest.raises(ModelUnavailableException) as exc_info:
        await service.chat_completion(
            model="qwen3:1.7b",
            messages=[{"role": "user", "content": "Hello"}],
        )

    assert "qwen3:1.7b" in str(exc_info.value)
    assert exc_info.value.status_code == 503
