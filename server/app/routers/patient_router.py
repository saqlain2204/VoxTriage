"""Patient record CRUD endpoints — all require JWT auth.

Uses MySQL (async) backend exclusively via MySQLPatientDB.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import io

from app.auth import get_current_user
from app.logging_config import get_logger
from app.models.triage import TriageRecord

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/patients", tags=["patients"])


def _get_db():
    from app.main import app_state
    return app_state["patient_db"]


# ── Request / response models ────────────────────────────────


class SavePatientRequest(BaseModel):
    session_id: str
    transcript: str = ""
    triage: TriageRecord
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    language: str = "en"
    notes: str = ""


class AddNoteRequest(BaseModel):
    text: str


class DashboardData(BaseModel):
    total_patients: int = 0
    critical_count: int = 0
    avg_confidence: float | None = None
    total_symptoms: int = 0
    priority_counts: dict[str, int] = {}
    age_distribution: dict[str, int] = {}
    top_symptoms: list[dict] = []
    vital_averages: dict[str, float | None] = {}


# ── Audit helper ─────────────────────────────────────────────


async def _audit(db, action: str, user: dict, resource: str = None,
                 detail: str = None, request: Request = None):
    if hasattr(db, "log_audit"):
        ip = request.client.host if request and request.client else None
        await db.log_audit(
            action=action,
            username=user.get("sub"),
            resource=resource,
            detail=detail,
            ip_address=ip,
        )


# ── Routes (specific paths BEFORE parameterised ones) ────────


@router.get("/dashboard", response_model=DashboardData)
async def dashboard_data(_user: dict = Depends(get_current_user)):
    """Aggregated data for the analytics dashboard."""
    db = _get_db()
    stats = await db.stats()
    return DashboardData(
        **stats,
        priority_counts=await db.priority_counts(),
        age_distribution=await db.age_distribution(),
        top_symptoms=await db.top_symptoms(),
        vital_averages=await db.vital_averages(),
    )


@router.post("/clear", status_code=200)
async def clear_patients(request: Request, _user: dict = Depends(get_current_user)):
    """Delete every patient record."""
    db = _get_db()
    removed = await db.clear()
    await _audit(db, "clear_all_patients", _user, detail=f"removed={removed}", request=request)
    return {"cleared": removed}


@router.get("/")
async def list_patients(
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _user: dict = Depends(get_current_user),
):
    """Return patient records with optional filtering."""
    db = _get_db()
    return await db.list_all(
        priority=priority, search=search,
        date_from=date_from, date_to=date_to,
        limit=limit, offset=offset,
    )


@router.post("/", status_code=201)
async def save_patient(
    body: SavePatientRequest,
    request: Request,
    _user: dict = Depends(get_current_user),
):
    """Save or update a patient record for a given session."""
    db = _get_db()
    record = await db.save(
        body.session_id, body.transcript, body.triage,
        latitude=body.latitude, longitude=body.longitude,
        language=body.language, notes=body.notes,
        created_by=_user.get("sub"),
    )
    await _audit(db, "save_patient", _user, resource=record.id, request=request)
    return record


@router.get("/export/{patient_id}")
async def export_patient_pdf(
    patient_id: str,
    request: Request,
    _user: dict = Depends(get_current_user),
):
    """Download a PDF triage report for a patient record."""
    db = _get_db()
    record = await db.get(patient_id)
    if not record:
        raise HTTPException(status_code=404, detail="Patient not found")

    from app.services.pdf_service import generate_triage_pdf
    pdf_bytes = generate_triage_pdf(record)
    await _audit(db, "export_pdf", _user, resource=patient_id, request=request)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="voxtriage-{patient_id}.pdf"'},
    )


@router.get("/map")
async def patients_map(_user: dict = Depends(get_current_user)):
    """Return patient records that have GPS coordinates, for map display."""
    db = _get_db()
    if hasattr(db, "patients_with_location"):
        data = await db.patients_with_location()
        # Convert datetimes to strings for JSON serialization
        for d in data:
            if hasattr(d.get("saved_at", ""), "isoformat"):
                d["saved_at"] = d["saved_at"].isoformat()
        return data
    return []


# ── Session notes ────────────────────────────────────────────


@router.post("/{patient_id}/notes", status_code=201)
async def add_session_note(
    patient_id: str,
    body: AddNoteRequest,
    request: Request,
    _user: dict = Depends(get_current_user),
):
    """Add a manual note to a patient session.

    ``patient_id`` may be either the patient record id (pt-…) or the raw
    session id.  Notes are always stored by session_id so they survive
    even before a patient record is persisted.
    """
    db = _get_db()
    # Try looking up as patient record id first, then as session_id
    record = await db.get(patient_id)
    session_id = record.session_id if record else patient_id
    # If no record found by either key, still allow saving notes by session_id
    # (the patient record may not exist yet during an active session)

    note = await db.add_note(session_id, body.text, created_by=_user.get("sub"))
    await _audit(db, "add_note", _user, resource=patient_id, detail=body.text[:100], request=request)
    return note.model_dump(mode="json")


@router.get("/{patient_id}/notes")
async def get_session_notes(
    patient_id: str,
    _user: dict = Depends(get_current_user),
):
    """Get all notes for a patient session.

    Accepts either patient record id or raw session id.
    """
    db = _get_db()
    record = await db.get(patient_id)
    session_id = record.session_id if record else patient_id

    notes = await db.get_notes(session_id)
    return [n.model_dump(mode="json") for n in notes]


# ── CRUD for individual records ──────────────────────────────


@router.get("/{patient_id}")
async def get_patient(
    patient_id: str,
    _user: dict = Depends(get_current_user),
):
    db = _get_db()
    record = await db.get(patient_id)
    if not record:
        raise HTTPException(status_code=404, detail="Patient not found")
    return record


@router.delete("/{patient_id}", status_code=204)
async def delete_patient(
    patient_id: str,
    request: Request,
    _user: dict = Depends(get_current_user),
):
    db = _get_db()
    success = await db.remove(patient_id)
    if success:
        await _audit(db, "delete_patient", _user, resource=patient_id, request=request)
    if not success:
        raise HTTPException(status_code=404, detail="Patient not found")
    return None
