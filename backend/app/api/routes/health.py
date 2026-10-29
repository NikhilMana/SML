"""Health check and preflight verification API routes."""

import os
from pathlib import Path
from fastapi import APIRouter
from app.core.config import settings
from app.core.logging import logger
from app.services.ollama_service import ollama_service
from app.services.model_registry import model_registry
from app.services.resource_monitor import resource_monitor
from app.api.schemas.health import HealthResponse

router = APIRouter(prefix="/health", tags=["System Health"])


@router.get("", response_model=HealthResponse)
async def check_system_health():
    """Perform preflight checks and return operational status of Ollama, hardware, models, and storage."""
    # 1. Ollama Connectivity
    ollama_info = await ollama_service.get_health()

    # 2. Synchronize Local Models
    await ollama_service.get_available_models()
    registered = model_registry.get_registered_models()
    available_count = sum(1 for m in registered if m.is_available_locally)

    # 3. Hardware Resources (RAM, CPU, GPU VRAM)
    telemetry = resource_monitor.snapshot()

    # 4. Storage Directories Verification
    settings.ensure_directories()
    storage_checks = {
        "chroma_dir": os.path.exists(settings.CHROMA_PERSIST_DIRECTORY),
        "upload_dir": os.path.exists(settings.UPLOAD_DIR),
        "writable": os.access(settings.UPLOAD_DIR, os.W_OK),
    }

    # Evaluate Overall Status
    if not ollama_info.get("is_running"):
        overall_status = "degraded"
    elif available_count == 0:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return HealthResponse(
        status=overall_status,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        ollama=ollama_info,
        resources=telemetry,
        models={
            "candidate_count": len(registered),
            "available_count": available_count,
            "installed_tags": [m.tag for m in registered if m.is_available_locally],
            "missing_tags": [m.tag for m in registered if not m.is_available_locally],
        },
        storage=storage_checks,
    )
