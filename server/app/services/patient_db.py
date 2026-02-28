"""In-memory patient record database.

Stores completed triage sessions as patient records.
Replace with a real database when ready for production.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from app.logging_config import get_logger
from app.models.triage import TriageRecord, TriagePriority

logger = get_logger(__name__)


class PatientRecord(BaseModel):
    """A saved patient record from a completed triage session."""

    id: str = Field(default_factory=lambda: f"pt-{uuid4().hex[:8]}")
    session_id: str
    saved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    transcript: str = ""
    triage: TriageRecord


class PatientDB:
    """Thread-safe in-memory patient database."""

    def __init__(self) -> None:
        self._records: dict[str, PatientRecord] = {}

    def save(
        self,
        session_id: str,
        transcript: str,
        triage: TriageRecord,
    ) -> PatientRecord:
        """Create or update a patient record for a session."""
        existing = self.get_by_session(session_id)
        if existing:
            existing.triage = triage
            existing.transcript = transcript
            existing.saved_at = datetime.now(timezone.utc)
            logger.info("patient_record_updated", record_id=existing.id)
            return existing

        record = PatientRecord(
            session_id=session_id,
            transcript=transcript,
            triage=triage,
        )
        self._records[record.id] = record
        logger.info("patient_record_saved", record_id=record.id)
        return record

    def get(self, record_id: str) -> Optional[PatientRecord]:
        return self._records.get(record_id)

    def get_by_session(self, session_id: str) -> Optional[PatientRecord]:
        for rec in self._records.values():
            if rec.session_id == session_id:
                return rec
        return None

    def list_all(self) -> list[PatientRecord]:
        return sorted(
            self._records.values(),
            key=lambda r: r.saved_at,
            reverse=True,
        )

    def remove(self, record_id: str) -> bool:
        if record_id in self._records:
            del self._records[record_id]
            logger.info("patient_record_removed", record_id=record_id)
            return True
        return False

    def clear(self) -> int:
        count = len(self._records)
        self._records.clear()
        logger.info("patient_records_cleared", count=count)
        return count

    @property
    def count(self) -> int:
        return len(self._records)

    # ── Aggregate helpers for dashboard ──

    def priority_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for rec in self._records.values():
            p = rec.triage.priority.value
            counts[p] = counts.get(p, 0) + 1
        return counts

    def age_distribution(self) -> dict[str, int]:
        buckets: dict[str, int] = {
            "0-17": 0, "18-30": 0, "31-50": 0,
            "51-70": 0, "71+": 0, "unknown": 0,
        }
        for rec in self._records.values():
            age = rec.triage.patient_info.age
            if age is None:
                buckets["unknown"] += 1
            elif age <= 17:
                buckets["0-17"] += 1
            elif age <= 30:
                buckets["18-30"] += 1
            elif age <= 50:
                buckets["31-50"] += 1
            elif age <= 70:
                buckets["51-70"] += 1
            else:
                buckets["71+"] += 1
        return {k: v for k, v in buckets.items() if v > 0}

    def top_symptoms(self, limit: int = 10) -> list[dict]:
        freq: dict[str, int] = {}
        for rec in self._records.values():
            for s in rec.triage.symptoms:
                key = s.description.lower()
                freq[key] = freq.get(key, 0) + 1
        return [
            {"symptom": k, "count": v}
            for k, v in sorted(freq.items(), key=lambda x: -x[1])[:limit]
        ]

    def vital_averages(self) -> dict[str, float | None]:
        fields = [
            "heart_rate", "respiratory_rate", "spo2", "temperature", "gcs",
        ]
        result: dict[str, float | None] = {}
        for f in fields:
            values = [
                getattr(rec.triage.vital_signs, f)
                for rec in self._records.values()
                if getattr(rec.triage.vital_signs, f) is not None
            ]
            result[f] = round(sum(values) / len(values), 1) if values else None
        return result

    def stats(self) -> dict:
        records = list(self._records.values())
        critical = sum(
            1 for r in records
            if r.triage.priority in (TriagePriority.IMMEDIATE, TriagePriority.EMERGENT)
        )
        confidences = [
            r.triage.confidence_score for r in records
            if r.triage.confidence_score is not None
        ]
        symptom_count = sum(len(r.triage.symptoms) for r in records)
        return {
            "total_patients": len(records),
            "critical_count": critical,
            "avg_confidence": (
                round(sum(confidences) / len(confidences), 3)
                if confidences else None
            ),
            "total_symptoms": symptom_count,
        }
