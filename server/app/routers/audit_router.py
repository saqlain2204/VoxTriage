"""Audit log viewing endpoint."""

from fastapi import APIRouter, Depends, Query
from typing import Optional

from app.auth import get_current_user
from app.logging_config import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


def _get_db():
    from app.main import app_state
    return app_state["patient_db"]


@router.get("/log")
async def get_audit_log(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    username: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Retrieve audit log entries (newest first). Requires authentication."""
    db = _get_db()
    if hasattr(db, "get_audit_log"):
        entries = await db.get_audit_log(limit=limit, offset=offset, username=username)
        return {"entries": [e.model_dump(mode="json") for e in entries]}
    return {"entries": []}
