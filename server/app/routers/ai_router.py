"""AI-powered endpoints: treatment suggestions, vision analysis, document parsing."""

import base64
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional

from app.auth import get_current_user
from app.logging_config import get_logger
from app.models.triage import TriageRecord
from app.services.ai_service import AIService

logger = get_logger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

_ai_service: Optional[AIService] = None


def _get_ai() -> AIService:
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service


# ── Request models ──


class TreatmentRequest(BaseModel):
    triage: TriageRecord
    transcript: str = ""


# ── Treatment suggestions ──


@router.post("/suggest-treatment")
async def suggest_treatment(
    body: TreatmentRequest,
    user: dict = Depends(get_current_user),
):
    """Generate AI-powered treatment suggestions from triage data."""
    ai = _get_ai()
    result = await ai.suggest_treatment(body.triage, body.transcript)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ── Vision: wound/injury photo analysis ──


@router.post("/analyze-image")
async def analyze_image(
    file: UploadFile = File(...),
    context: str = Form(""),
    user: dict = Depends(get_current_user),
):
    """Analyze a wound/injury photo using Mistral Vision AI."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 10 MB")

    content = await file.read()
    image_b64 = base64.b64encode(content).decode()
    ai = _get_ai()
    result = await ai.analyze_image(image_b64, file.content_type, context or None)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ── Document AI: parse medical documents ──


@router.post("/parse-document")
async def parse_document(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Parse a medical document image (insurance card, prescription, etc.)."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 10 MB")

    content = await file.read()
    image_b64 = base64.b64encode(content).decode()
    ai = _get_ai()
    result = await ai.parse_document(image_b64, file.content_type)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
