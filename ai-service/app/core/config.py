"""Application configuration using Pydantic Settings."""

from functools import lru_cache
from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration settings for AgriConnect AI Service."""

    APP_NAME: str = "AgriConnect AI Service"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    AI_HOST: str = "127.0.0.1"
    AI_PORT: int = 8000
    AI_API_PREFIX: str = "/api/v1"
    LOG_LEVEL: str = "INFO"

    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:3001"

    MODEL_DIR: str = "models"
    DATASET_DIR: str = "datasets"
    MAX_UPLOAD_SIZE_MB: int = 10

    PRICE_TRENDS_DB_PATH: Optional[str] = None
    PRICE_TRENDS_DOWNLOAD_URL: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def model_path(self) -> Path:
        """Return Path object for model directory."""
        p = Path(self.MODEL_DIR)
        if not p.is_dir():
            alt = Path(__file__).resolve().parent.parent.parent / self.MODEL_DIR
            if alt.is_dir():
                return alt
        return p

    @property
    def dataset_path(self) -> Path:
        """Return Path object for datasets directory."""
        p = Path(self.DATASET_DIR)
        if not p.is_dir():
            alt = Path(__file__).resolve().parent.parent.parent / self.DATASET_DIR
            if alt.is_dir():
                return alt
        return p

    @property
    def max_upload_size_bytes(self) -> int:
        """Return maximum upload size in bytes."""
        return int(self.MAX_UPLOAD_SIZE_MB * 1024 * 1024)


    @property
    def cors_origins(self) -> List[str]:
        """Return allowed CORS origins based on configured URLs and local dev environments."""
        origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
            "null",
        ]
        for url in [self.FRONTEND_URL, self.BACKEND_URL]:
            cleaned = url.strip().rstrip("/")
            if cleaned and cleaned not in origins:
                origins.append(cleaned)
        return origins


@lru_cache()
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
