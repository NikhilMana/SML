"""Model registry and selection API routes."""

from typing import List
from fastapi import APIRouter, HTTPException, status
from app.core.config import settings
from app.services.ollama_service import ollama_service
from app.services.model_registry import model_registry
from app.api.schemas.models import ModelsResponse, ModelInfoSchema

router = APIRouter(prefix="/models", tags=["Model Registry"])


@router.get("", response_model=ModelsResponse)
async def list_models():
    """Retrieve all candidate models with real-time availability and Ollama connection status."""
    ollama_info = await ollama_service.get_health()
    if ollama_info.get("is_running"):
        await ollama_service.get_available_models()

    registered = model_registry.get_registered_models()
    schemas = [ModelInfoSchema(**m.model_dump()) for m in registered]

    return ModelsResponse(
        models=schemas,
        default_model=settings.DEFAULT_MODEL,
        ollama_running=ollama_info.get("is_running", False),
        ollama_version=ollama_info.get("version"),
    )


@router.get("/{model_tag}", response_model=ModelInfoSchema)
async def get_model_details(model_tag: str):
    """Retrieve specifications, parameter details, and availability for a specific model."""
    meta = model_registry.get_model(model_tag)
    if not meta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{model_tag}' is not registered as a candidate model.",
        )
    return ModelInfoSchema(**meta.model_dump())
