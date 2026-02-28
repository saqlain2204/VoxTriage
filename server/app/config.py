import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    app_name: str = "VoxTriage"
    app_version: str = "1.0.0"
    debug: bool = False

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    allowed_origins: list[str] = ["*"]

    # Mistral API
    mistral_api_key: str = Field(..., description="Mistral API key")
    voxtral_model: str = "voxtral-mini-transcribe-realtime-2602"
    triage_model: str = "mistral-large-latest"
    vision_model: str = "mistral-small-latest"

    # MySQL
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "voxtriage"

    # Audio
    audio_sample_rate: int = 16000
    audio_channels: int = 1
    audio_chunk_duration_ms: int = 500

    # Triage engine
    triage_extraction_interval_sec: float = 3.0
    max_transcript_buffer_chars: int = 10000
    session_timeout_sec: int = 3600

    # Logging
    log_level: str = "INFO"
    log_format: str = "json"

    model_config = {
        "env_file": os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache()
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
