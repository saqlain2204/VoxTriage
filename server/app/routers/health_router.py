import time

from fastapi import APIRouter

from app.config import get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["health"])

_start_time = time.monotonic()


@router.get("/health")
async def health_check() -> dict:
    """Basic health check endpoint."""
    return {"status": "healthy", "service": "voxtriage"}


@router.get("/health/detailed")
async def detailed_health() -> dict:
    """Detailed health check with configuration and uptime info."""
    from app.main import app_state

    settings = get_settings()
    engine = app_state.get("triage_engine")
    uptime_seconds = round(time.monotonic() - _start_time, 2)

    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.app_version,
        "uptime_seconds": uptime_seconds,
        "active_sessions": engine.active_session_count if engine else 0,
        "voxtral_model": settings.voxtral_model,
        "triage_model": settings.triage_model,
        "debug": settings.debug,
    }
