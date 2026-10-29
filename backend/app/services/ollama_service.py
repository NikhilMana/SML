"""Ollama client service managing local SLM inference, streaming, health, and fallback adapters."""

import time
import json
from typing import AsyncGenerator, Dict, List, Optional, Any
import httpx
from app.core.config import settings
from app.core.exceptions import (
    ModelUnavailableException,
    ModelInferenceTimeoutException,
    SLMLabException,
)
from app.core.logging import logger
from app.services.model_registry import model_registry


class OllamaService:
    """Handles communication with local Ollama daemon via HTTP API."""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.timeout = settings.MODEL_TIMEOUT_SECONDS

    async def get_health(self) -> Dict[str, Any]:
        """Check whether Ollama daemon is reachable and retrieve server version."""
        start_time = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{self.base_url}/api/version")
                latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
                if response.status_code == 200:
                    version_data = response.json()
                    return {
                        "is_running": True,
                        "version": version_data.get("version", "unknown"),
                        "latency_ms": latency_ms,
                        "base_url": self.base_url,
                    }
        except Exception as e:
            logger.debug(f"Ollama health check unreachable: {e}")

        return {
            "is_running": False,
            "version": None,
            "latency_ms": None,
            "base_url": self.base_url,
            "error": "Cannot connect to local Ollama daemon. Ensure 'ollama serve' is active.",
        }

    async def get_available_models(self) -> List[Dict[str, Any]]:
        """Query Ollama for locally pulled models and sync with model_registry."""
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                if response.status_code == 200:
                    models_data = response.json().get("models", [])
                    model_registry.update_availability(models_data)
                    return models_data
        except Exception as e:
            logger.debug(f"Failed to fetch local Ollama models: {e}")
            model_registry.update_availability([])
        return []

    async def chat_completion(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        timeout: Optional[int] = None,
        system_prompt: Optional[str] = None,
        json_format: bool = False,
    ) -> Dict[str, Any]:
        """Execute chat completion with performance measurement."""
        timeout_val = timeout or self.timeout

        # Ensure model is valid
        if not model_registry.is_valid_model(model):
            raise ModelUnavailableException(model, f"'{model}' is not a registered candidate model.")

        # Check local availability
        meta = model_registry.get_model(model)
        if not meta or not meta.is_available_locally:
            # Check once if available in Ollama
            await self.get_available_models()
            meta = model_registry.get_model(model)
            if not meta or not meta.is_available_locally:
                raise ModelUnavailableException(
                    model,
                    f"Model '{model}' is not installed locally. Run: '{meta.install_command if meta else 'ollama pull ' + model}'",
                )

        # Prepare messages payload
        payload_messages = []
        if system_prompt:
            payload_messages.append({"role": "system", "content": system_prompt})
        payload_messages.extend(messages)

        options: Dict[str, Any] = {
            "temperature": temperature,
        }
        if max_tokens:
            options["num_predict"] = max_tokens

        payload: Dict[str, Any] = {
            "model": model,
            "messages": payload_messages,
            "stream": False,
            "options": options,
        }
        if json_format:
            payload["format"] = "json"

        start_time = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=float(timeout_val)) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json=payload,
                )

            total_latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

            if response.status_code != 200:
                raise SLMLabException(
                    f"Ollama returned error {response.status_code}: {response.text}",
                    status_code=response.status_code,
                )

            data = response.json()
            message_content = data.get("message", {}).get("content", "")

            # Extract hardware & token metrics from Ollama response
            prompt_eval_count = data.get("prompt_eval_count", 0)
            eval_count = data.get("eval_count", 0)
            eval_duration_ns = data.get("eval_duration", 0)

            tokens_per_sec = 0.0
            if eval_duration_ns > 0 and eval_count > 0:
                # convert ns to seconds
                eval_duration_sec = eval_duration_ns / 1_000_000_000.0
                tokens_per_sec = round(eval_count / eval_duration_sec, 2)

            return {
                "model": model,
                "content": message_content,
                "latency_ms": total_latency_ms,
                "ttft_ms": round(data.get("prompt_eval_duration", 0) / 1_000_000.0, 2),
                "tokens_per_second": tokens_per_sec,
                "input_tokens": prompt_eval_count,
                "output_tokens": eval_count,
                "done_reason": data.get("done_reason", "stop"),
            }

        except httpx.TimeoutException:
            raise ModelInferenceTimeoutException(model, timeout_val)
        except httpx.ConnectError:
            raise ModelUnavailableException(model, f"Could not connect to Ollama daemon for model '{model}'.")

    async def stream_chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        timeout: Optional[int] = None,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream response tokens sequentially from Ollama, yielding timing metrics."""
        timeout_val = timeout or self.timeout

        # Verify model
        if not model_registry.is_valid_model(model):
            raise ModelUnavailableException(model, f"'{model}' is not a registered model.")

        payload_messages = []
        if system_prompt:
            payload_messages.append({"role": "system", "content": system_prompt})
        payload_messages.extend(messages)

        options: Dict[str, Any] = {"temperature": temperature}
        if max_tokens:
            options["num_predict"] = max_tokens

        payload = {
            "model": model,
            "messages": payload_messages,
            "stream": True,
            "options": options,
        }

        start_time = time.perf_counter()
        first_token_time: Optional[float] = None

        try:
            async with httpx.AsyncClient(timeout=float(timeout_val)) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as stream_response:
                    if stream_response.status_code != 200:
                        yield {
                            "type": "error",
                            "message": f"Ollama HTTP error {stream_response.status_code}",
                        }
                        return

                    async for line in stream_response.aiter_lines():
                        if not line or not line.strip():
                            continue
                        chunk = json.loads(line)
                        token = chunk.get("message", {}).get("content", "")

                        if token and first_token_time is None:
                            first_token_time = time.perf_counter()
                            ttft_ms = round((first_token_time - start_time) * 1000, 2)
                            yield {"type": "ttft", "ttft_ms": ttft_ms}

                        if token:
                            yield {"type": "token", "token": token}

                        if chunk.get("done"):
                            total_latency = round((time.perf_counter() - start_time) * 1000, 2)
                            eval_count = chunk.get("eval_count", 0)
                            eval_duration_ns = chunk.get("eval_duration", 0)
                            tps = 0.0
                            if eval_duration_ns > 0 and eval_count > 0:
                                tps = round(eval_count / (eval_duration_ns / 1_000_000_000.0), 2)

                            yield {
                                "type": "done",
                                "latency_ms": total_latency,
                                "tokens_per_second": tps,
                                "input_tokens": chunk.get("prompt_eval_count", 0),
                                "output_tokens": eval_count,
                            }
        except httpx.TimeoutException:
            yield {"type": "error", "message": f"Inference timed out after {timeout_val}s."}
        except Exception as e:
            yield {"type": "error", "message": f"Streaming inference error: {str(e)}"}


ollama_service = OllamaService()
