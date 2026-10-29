"""Pydantic schemas for system health and preflight diagnostics."""

from typing import Dict, Any, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """System health check summary."""

    status: str = Field(..., description="Overall health: 'healthy', 'degraded', or 'offline'")
    version: str = Field(..., description="Application version")
    environment: str = Field(..., description="Running environment")
    ollama: Dict[str, Any] = Field(..., description="Ollama connectivity and latency")
    resources: Dict[str, Any] = Field(..., description="RAM, CPU, and GPU telemetry")
    models: Dict[str, Any] = Field(..., description="Registered and installed models status")
    storage: Dict[str, Any] = Field(..., description="Database and vector storage directories")
