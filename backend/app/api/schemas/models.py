"""Pydantic schemas for model information and model registry endpoints."""

from typing import List, Optional
from pydantic import BaseModel, Field


class ModelInfoSchema(BaseModel):
    """Schema for individual model capabilities and local availability."""

    tag: str = Field(..., description="Unique model identifier used by Ollama")
    display_name: str = Field(..., description="Human-readable model name")
    parameter_count: str = Field(..., description="Approximate parameter size")
    published_parameters: str = Field(..., description="Published parameter count")
    architecture_note: str = Field(..., description="Architectural specifications and disclaimers")
    context_window: int = Field(..., description="Maximum context window in tokens")
    recommended_temperature: float = Field(..., description="Optimal inference temperature")
    capabilities: List[str] = Field(..., description="Supported application domains")
    install_command: str = Field(..., description="CLI command to download model locally")
    is_available_locally: bool = Field(..., description="Whether model is installed in Ollama")
    size_on_disk_bytes: Optional[int] = Field(None, description="Model file size on disk")
    quantization_level: Optional[str] = Field(None, description="Quantization scheme (e.g. Q4_K_M)")


class ModelsResponse(BaseModel):
    """List of all candidate models and registry status."""

    models: List[ModelInfoSchema]
    default_model: str
    ollama_running: bool
    ollama_version: Optional[str] = None


class SelectModelRequest(BaseModel):
    """Payload to select or inspect a specific model."""

    model_tag: str
