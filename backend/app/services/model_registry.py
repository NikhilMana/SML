"""Model Registry managing metadata, capabilities, and local availability of Small Language Models."""

from typing import Dict, List, Optional
from pydantic import BaseModel
from app.core.config import settings
from app.core.logging import logger


class ModelMetadata(BaseModel):
    """Metadata describing a candidate small language model."""

    tag: str
    display_name: str
    parameter_count: str
    published_parameters: str
    architecture_note: str
    context_window: int
    recommended_temperature: float
    capabilities: List[str]
    install_command: str
    is_available_locally: bool = False
    size_on_disk_bytes: Optional[int] = None
    modified_at: Optional[str] = None
    quantization_level: Optional[str] = None


class ModelRegistry:
    """Central registry tracking model specifications, capabilities, and runtime availability."""

    def __init__(self):
        self._registered_models: Dict[str, ModelMetadata] = {
            "qwen2.5:3b": ModelMetadata(
                tag="qwen2.5:3b",
                display_name="Qwen 2.5 3B Instruct",
                parameter_count="~3.09B",
                published_parameters="3.09 Billion (Instruct)",
                architecture_note=(
                    "Commonly marketed as a 3B model, although published parameter count is ~3.09B. "
                    "Features dense transformer architecture with strong multilingual reasoning, "
                    "structured JSON generation, and robust instruction adherence."
                ),
                context_window=32768,
                recommended_temperature=0.7,
                capabilities=["chat", "rag", "database_crud", "json_mode", "streaming"],
                install_command="ollama pull qwen2.5:3b",
            ),
            "llama3.2:3b": ModelMetadata(
                tag="llama3.2:3b",
                display_name="Llama 3.2 3B Instruct",
                parameter_count="~3.21B",
                published_parameters="3.21 Billion (Instruct)",
                architecture_note=(
                    "Meta's lightweight model optimized for edge devices and laptops. "
                    "Excellent conversational fluency, strong prompt comprehension, and reliable reasoning."
                ),
                context_window=131072,
                recommended_temperature=0.6,
                capabilities=["chat", "rag", "database_crud", "structured_output", "streaming"],
                install_command="ollama pull llama3.2:3b",
            ),
            "qwen3:1.7b": ModelMetadata(
                tag="qwen3:1.7b",
                display_name="Qwen3 1.7B",
                parameter_count="~1.70B",
                published_parameters="1.70 Billion",
                architecture_note=(
                    "Ultra-compact sub-2B model designed for minimal VRAM footprint (~1.2-1.5 GB). "
                    "Enables rapid inference on laptop GPUs while evaluating performance trade-offs."
                ),
                context_window=32768,
                recommended_temperature=0.7,
                capabilities=["chat", "rag", "database_crud", "streaming"],
                install_command="ollama pull qwen3:1.7b",
            ),
        }

    def get_registered_models(self) -> List[ModelMetadata]:
        """Return list of all configured candidate models."""
        return list(self._registered_models.values())

    def get_model(self, tag: str) -> Optional[ModelMetadata]:
        """Retrieve metadata for a specific model tag."""
        return self._registered_models.get(tag)

    def update_availability(self, local_models: List[Dict]) -> None:
        """Update local availability, disk size, and quantization from Ollama list output."""
        local_tags = {}
        for m in local_models:
            name = m.get("name", "")
            # Ollama tags can include ':latest' if omitted in pull
            base_name = name.replace(":latest", "")
            local_tags[name] = m
            local_tags[base_name] = m

        for tag, metadata in self._registered_models.items():
            clean_tag = tag.replace(":latest", "")
            matched = local_tags.get(tag) or local_tags.get(clean_tag)
            if matched:
                metadata.is_available_locally = True
                metadata.size_on_disk_bytes = matched.get("size")
                metadata.modified_at = matched.get("modified_at")
                metadata.quantization_level = matched.get("details", {}).get("quantization_level", "Unknown")
            else:
                metadata.is_available_locally = False
                metadata.size_on_disk_bytes = None
                metadata.quantization_level = None

        logger.debug(
            f"Updated model registry availability: "
            f"{[m.tag for m in self._registered_models.values() if m.is_available_locally]} available locally."
        )

    def is_valid_model(self, tag: str) -> bool:
        """Check if model tag is part of registered candidate models."""
        return tag in self._registered_models


model_registry = ModelRegistry()
