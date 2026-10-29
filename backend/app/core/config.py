"""Application configuration settings using pydantic-settings."""

import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized application settings."""

    # Project metadata
    PROJECT_NAME: str = "Local SLM Laboratory"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server binding
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # Ollama settings
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    DEFAULT_MODEL: str = "qwen2.5:3b"
    CANDIDATE_MODELS: str = "qwen2.5:3b,llama3.2:3b,qwen3:1.7b"
    MODEL_TIMEOUT_SECONDS: int = 90

    # Storage paths
    APP_DB_URL: str = "sqlite:///./storage/app_data.db"
    DEMO_DB_URL: str = "sqlite:///./storage/demo_ecommerce.db"
    CHROMA_PERSIST_DIRECTORY: str = "./storage/chroma_db"
    UPLOAD_DIR: str = "./storage/uploads"

    # RAG defaults
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    DEFAULT_CHUNK_SIZE: int = 500
    DEFAULT_CHUNK_OVERLAP: int = 50
    DEFAULT_TOP_K: int = 3

    # Resource monitoring
    ENABLE_RESOURCE_MONITORING: bool = True

    # Model definition parameters
    # Note: Qwen 2.5 3B Instruct has ~3.09B actual parameters. Documented for scientific accuracy.
    MODEL_PARAM_COUNTS: dict = {
        "qwen2.5:3b": "3.09B parameters (Instruct)",
        "llama3.2:3b": "3.21B parameters (Instruct)",
        "qwen3:1.7b": "1.70B parameters",
    }

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def candidate_model_list(self) -> List[str]:
        """Return candidate models as a clean list of strings."""
        return [m.strip() for m in self.CANDIDATE_MODELS.split(",") if m.strip()]

    @property
    def DOCUMENTS_DIR(self) -> Path:
        """Return absolute path to documents directory."""
        base_dir = Path(__file__).resolve().parent.parent.parent
        p = (base_dir / "storage" / "documents").resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    def ensure_directories(self) -> None:
        """Ensure necessary storage directories exist on disk."""
        base_dir = Path(__file__).resolve().parent.parent.parent
        for path_str in [self.CHROMA_PERSIST_DIRECTORY, self.UPLOAD_DIR]:
            p = (base_dir / path_str).resolve() if not os.path.isabs(path_str) else Path(path_str)
            p.mkdir(parents=True, exist_ok=True)
            
        _ = self.DOCUMENTS_DIR
            
        # Ensure db parent directories exist
        for db_url in [self.APP_DB_URL, self.DEMO_DB_URL]:
            if db_url.startswith("sqlite:///"):
                db_path = db_url.replace("sqlite:///", "")
                p = (base_dir / db_path).resolve() if not os.path.isabs(db_path) else Path(db_path)
                p.parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
