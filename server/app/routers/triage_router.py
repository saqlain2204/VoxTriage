from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.logging_config import get_logger
from app.models.triage import TriageRecord

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["triage"])


def _get_engine():
    from app.main import app_state
    return app_state["triage_engine"]


class TextTriageRequest(BaseModel):
    """Request body for one-shot text-based triage extraction."""
    transcript: str
    session_id: str = "oneshot"


class TextTriageResponse(BaseModel):
    """Response containing the extracted triage record."""
    success: bool
    record: TriageRecord | None = None
    error: str | None = None


@router.post("/triage/extract", response_model=TextTriageResponse)
async def extract_triage(request: TextTriageRequest) -> TextTriageResponse:
    """One-shot triage extraction from a transcript string.

    Useful for testing or batch processing without a WebSocket session.
    """
    engine = _get_engine()
    from app.services.mistral_service import MistralTriageService
    from app.config import get_settings

    service = MistralTriageService(get_settings())

    try:
        record = await service.extract_triage_data(
            transcript=request.transcript,
            session_id=request.session_id,
        )
        if record:
            return TextTriageResponse(success=True, record=record)
        return TextTriageResponse(
            success=False, error="No triage data could be extracted"
        )
    except Exception:
        logger.exception("oneshot_extraction_failed")
        raise HTTPException(status_code=500, detail="Triage extraction failed")


@router.get("/sessions")
async def list_sessions() -> dict:
    """List all active and recent triage sessions."""
    engine = _get_engine()
    return {
        "active_count": engine.active_session_count,
        "sessions": engine.get_all_sessions(),
    }


@router.get("/sessions/{session_id}")
async def get_session(session_id: str) -> dict:
    """Get details and current triage record for a specific session."""
    engine = _get_engine()
    session = engine.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = {
        "session_id": session.session_id,
        "created_at": session.created_at.isoformat(),
        "is_active": session.is_active,
        "transcript": session.complete_transcript,
    }
    if session.current_record:
        result["triage_record"] = session.current_record.model_dump(mode="json")
    else:
        result["triage_record"] = None

    return result


@router.get("/sessions/{session_id}/transcript")
async def get_session_transcript(session_id: str) -> dict:
    """Get the full transcript for a session."""
    engine = _get_engine()
    session = engine.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session_id,
        "transcript": session.complete_transcript,
        "segment_count": len(session.full_transcript),
    }
