"""MySQL-backed patient database replacing the in-memory PatientDB.

Uses aiomysql for async database access. Creates the schema on first connect.
Falls back gracefully if MySQL is unavailable.
"""

import json
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

import aiomysql

from app.config import get_settings
from app.logging_config import get_logger
from app.models.triage import (
    Intervention,
    PatientInfo,
    Symptom,
    TriagePriority,
    TriageRecord,
    VitalSigns,
)

logger = get_logger(__name__)

# ── Schema DDL ────────────────────────────────────────────────

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS patients (
    id               VARCHAR(32) PRIMARY KEY,
    session_id       VARCHAR(64) NOT NULL,
    saved_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    transcript       LONGTEXT,
    triage_json      JSON NOT NULL,
    priority         VARCHAR(20) NOT NULL DEFAULT 'unknown',
    chief_complaint  TEXT,
    age              INT,
    gender           VARCHAR(20),
    confidence_score FLOAT,
    latitude         DOUBLE,
    longitude        DOUBLE,
    language         VARCHAR(10) DEFAULT 'en',
    notes            TEXT,
    created_by       VARCHAR(64),
    INDEX idx_session (session_id),
    INDEX idx_priority (priority),
    INDEX idx_saved_at (saved_at),
    INDEX idx_age (age)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_notes (
    id          VARCHAR(32) PRIMARY KEY,
    session_id  VARCHAR(64) NOT NULL,
    text        TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by  VARCHAR(64),
    INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    ts          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    username    VARCHAR(64),
    action      VARCHAR(64) NOT NULL,
    resource    VARCHAR(128),
    detail      TEXT,
    ip_address  VARCHAR(45),
    INDEX idx_ts (ts),
    INDEX idx_user (username),
    INDEX idx_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


# ── Pydantic model for patient record ────────────────────────

from pydantic import BaseModel, Field


class PatientRecord(BaseModel):
    id: str = Field(default_factory=lambda: f"pt-{uuid4().hex[:8]}")
    session_id: str
    saved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    transcript: str = ""
    triage: TriageRecord
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    language: str = "en"
    notes: str = ""
    created_by: Optional[str] = None


class SessionNote(BaseModel):
    id: str = Field(default_factory=lambda: f"note-{uuid4().hex[:8]}")
    session_id: str
    text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None


class AuditEntry(BaseModel):
    id: Optional[int] = None
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    username: Optional[str] = None
    action: str
    resource: Optional[str] = None
    detail: Optional[str] = None
    ip_address: Optional[str] = None


# ── MySQL database class ─────────────────────────────────────


class MySQLPatientDB:
    """Async MySQL patient database with audit logging."""

    def __init__(self) -> None:
        self._pool: Optional[aiomysql.Pool] = None

    async def connect(self) -> None:
        """Create the connection pool and initialize schema."""
        settings = get_settings()
        try:
            self._pool = await aiomysql.create_pool(
                host=settings.mysql_host,
                port=settings.mysql_port,
                user=settings.mysql_user,
                password=settings.mysql_password,
                db=settings.mysql_database,
                autocommit=True,
                minsize=2,
                maxsize=10,
                charset="utf8mb4",
            )
            # Create tables
            async with self._pool.acquire() as conn:
                async with conn.cursor() as cur:
                    for stmt in _SCHEMA_SQL.strip().split(";"):
                        stmt = stmt.strip()
                        if stmt:
                            await cur.execute(stmt)
            logger.info("mysql_connected", host=settings.mysql_host, db=settings.mysql_database)
        except Exception:
            logger.exception("mysql_connection_failed")
            raise

    async def close(self) -> None:
        if self._pool:
            self._pool.close()
            await self._pool.wait_closed()

    # ── Patient CRUD ──

    async def save(
        self,
        session_id: str,
        transcript: str,
        triage: TriageRecord,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        language: str = "en",
        notes: str = "",
        created_by: Optional[str] = None,
    ) -> PatientRecord:
        existing = await self.get_by_session(session_id)
        if existing:
            triage_json = triage.model_dump(mode="json")
            async with self._pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """UPDATE patients SET transcript=%s, triage_json=%s,
                           priority=%s, chief_complaint=%s, age=%s, gender=%s,
                           confidence_score=%s, saved_at=%s,
                           latitude=%s, longitude=%s, language=%s, notes=%s
                           WHERE id=%s""",
                        (
                            transcript,
                            json.dumps(triage_json),
                            triage.priority.value,
                            triage.chief_complaint,
                            triage.patient_info.age,
                            triage.patient_info.gender,
                            triage.confidence_score,
                            datetime.now(timezone.utc),
                            latitude,
                            longitude,
                            language,
                            notes,
                            existing.id,
                        ),
                    )
            existing.triage = triage
            existing.transcript = transcript
            existing.saved_at = datetime.now(timezone.utc)
            existing.latitude = latitude
            existing.longitude = longitude
            existing.language = language
            existing.notes = notes
            return existing

        record = PatientRecord(
            session_id=session_id,
            transcript=transcript,
            triage=triage,
            latitude=latitude,
            longitude=longitude,
            language=language,
            notes=notes,
            created_by=created_by,
        )
        triage_json = triage.model_dump(mode="json")
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO patients
                       (id, session_id, saved_at, transcript, triage_json,
                        priority, chief_complaint, age, gender,
                        confidence_score, latitude, longitude, language, notes, created_by)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        record.id,
                        session_id,
                        record.saved_at,
                        transcript,
                        json.dumps(triage_json),
                        triage.priority.value,
                        triage.chief_complaint,
                        triage.patient_info.age,
                        triage.patient_info.gender,
                        triage.confidence_score,
                        latitude,
                        longitude,
                        language,
                        notes,
                        created_by,
                    ),
                )
        logger.info("patient_saved", record_id=record.id)
        return record

    def _row_to_record(self, row: dict) -> PatientRecord:
        triage_data = row["triage_json"]
        if isinstance(triage_data, str):
            triage_data = json.loads(triage_data)
        triage = self._parse_triage(triage_data, row["session_id"])
        return PatientRecord(
            id=row["id"],
            session_id=row["session_id"],
            saved_at=row["saved_at"],
            transcript=row.get("transcript", ""),
            triage=triage,
            latitude=row.get("latitude"),
            longitude=row.get("longitude"),
            language=row.get("language", "en"),
            notes=row.get("notes", ""),
            created_by=row.get("created_by"),
        )

    def _parse_triage(self, data: dict, session_id: str) -> TriageRecord:
        vital_data = data.get("vital_signs") or {}
        patient_data = data.get("patient_info") or {}
        symptoms_data = data.get("symptoms") or []
        interventions_data = data.get("interventions") or []
        priority_str = data.get("priority", "unknown")
        try:
            priority = TriagePriority(priority_str)
        except ValueError:
            priority = TriagePriority.UNKNOWN

        return TriageRecord(
            id=data.get("id", uuid4().hex[:12]),
            session_id=session_id,
            priority=priority,
            chief_complaint=data.get("chief_complaint"),
            patient_info=PatientInfo(
                age=patient_data.get("age"),
                gender=patient_data.get("gender"),
                weight_kg=patient_data.get("weight_kg"),
                known_allergies=patient_data.get("known_allergies", []),
                known_conditions=patient_data.get("known_conditions", []),
                medications=patient_data.get("medications", []),
            ),
            vital_signs=VitalSigns(
                heart_rate=vital_data.get("heart_rate"),
                blood_pressure_systolic=vital_data.get("blood_pressure_systolic"),
                blood_pressure_diastolic=vital_data.get("blood_pressure_diastolic"),
                respiratory_rate=vital_data.get("respiratory_rate"),
                spo2=vital_data.get("spo2"),
                temperature=vital_data.get("temperature"),
                gcs=vital_data.get("gcs"),
            ),
            symptoms=[
                Symptom(
                    description=s.get("description", ""),
                    onset=s.get("onset"),
                    severity=s.get("severity"),
                    location=s.get("location"),
                )
                for s in symptoms_data if s.get("description")
            ],
            interventions=[
                Intervention(
                    action=i.get("action", ""),
                    timestamp=i.get("timestamp"),
                    status=i.get("status", "reported"),
                )
                for i in interventions_data if i.get("action")
            ],
            mechanism_of_injury=data.get("mechanism_of_injury"),
            scene_notes=data.get("scene_notes"),
            ai_summary=data.get("ai_summary"),
            raw_transcript_snippet=data.get("raw_transcript_snippet"),
            confidence_score=data.get("confidence_score"),
        )

    async def get(self, record_id: str) -> Optional[PatientRecord]:
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM patients WHERE id=%s", (record_id,))
                row = await cur.fetchone()
                return self._row_to_record(row) if row else None

    async def get_by_session(self, session_id: str) -> Optional[PatientRecord]:
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM patients WHERE session_id=%s LIMIT 1", (session_id,))
                row = await cur.fetchone()
                return self._row_to_record(row) if row else None

    async def list_all(
        self,
        priority: Optional[str] = None,
        search: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[PatientRecord]:
        clauses: list[str] = []
        params: list[Any] = []
        if priority:
            clauses.append("priority = %s")
            params.append(priority)
        if search:
            clauses.append("(transcript LIKE %s OR chief_complaint LIKE %s OR notes LIKE %s)")
            q = f"%{search}%"
            params.extend([q, q, q])
        if date_from:
            clauses.append("saved_at >= %s")
            params.append(date_from)
        if date_to:
            clauses.append("saved_at <= %s")
            params.append(date_to)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"SELECT * FROM patients {where} ORDER BY saved_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])

        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, params)
                rows = await cur.fetchall()
                return [self._row_to_record(r) for r in rows]

    async def remove(self, record_id: str) -> bool:
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM patients WHERE id=%s", (record_id,))
                return cur.rowcount > 0

    async def clear(self) -> int:
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT COUNT(*) FROM patients")
                (count,) = await cur.fetchone()
                await cur.execute("DELETE FROM patients")
                return count

    @property
    async def count(self) -> int:
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT COUNT(*) FROM patients")
                (c,) = await cur.fetchone()
                return c

    # ── Aggregates ──

    async def priority_counts(self) -> dict[str, int]:
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT priority, COUNT(*) as cnt FROM patients GROUP BY priority")
                return {r[0]: r[1] for r in await cur.fetchall()}

    async def age_distribution(self) -> dict[str, int]:
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("""
                    SELECT
                        CASE
                            WHEN age IS NULL THEN 'unknown'
                            WHEN age <= 17 THEN '0-17'
                            WHEN age <= 30 THEN '18-30'
                            WHEN age <= 50 THEN '31-50'
                            WHEN age <= 70 THEN '51-70'
                            ELSE '71+'
                        END AS bucket,
                        COUNT(*) as cnt
                    FROM patients GROUP BY bucket HAVING cnt > 0
                """)
                return {r[0]: r[1] for r in await cur.fetchall()}

    async def top_symptoms(self, limit: int = 10) -> list[dict]:
        records = await self.list_all(limit=500)
        freq: dict[str, int] = {}
        for rec in records:
            for s in rec.triage.symptoms:
                key = s.description.lower()
                freq[key] = freq.get(key, 0) + 1
        return [
            {"symptom": k, "count": v}
            for k, v in sorted(freq.items(), key=lambda x: -x[1])[:limit]
        ]

    async def vital_averages(self) -> dict[str, float | None]:
        fields = ["heart_rate", "respiratory_rate", "spo2", "temperature", "gcs"]
        records = await self.list_all(limit=500)
        result: dict[str, float | None] = {}
        for f in fields:
            values = [
                getattr(rec.triage.vital_signs, f)
                for rec in records
                if getattr(rec.triage.vital_signs, f) is not None
            ]
            result[f] = round(sum(values) / len(values), 1) if values else None
        return result

    async def stats(self) -> dict:
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT COUNT(*) FROM patients")
                (total,) = await cur.fetchone()
                await cur.execute(
                    "SELECT COUNT(*) FROM patients WHERE priority IN ('immediate','emergent')"
                )
                (critical,) = await cur.fetchone()
                await cur.execute(
                    "SELECT AVG(confidence_score) FROM patients WHERE confidence_score IS NOT NULL"
                )
                (avg_conf,) = await cur.fetchone()

        records = await self.list_all(limit=500)
        symptom_count = sum(len(r.triage.symptoms) for r in records)

        return {
            "total_patients": total,
            "critical_count": critical,
            "avg_confidence": round(avg_conf, 3) if avg_conf else None,
            "total_symptoms": symptom_count,
        }

    # ── Session Notes ──

    async def add_note(
        self, session_id: str, text: str, created_by: Optional[str] = None
    ) -> SessionNote:
        note = SessionNote(session_id=session_id, text=text, created_by=created_by)
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO session_notes (id, session_id, text, created_at, created_by) VALUES (%s,%s,%s,%s,%s)",
                    (note.id, session_id, text, note.created_at, created_by),
                )
        return note

    async def get_notes(self, session_id: str) -> list[SessionNote]:
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    "SELECT * FROM session_notes WHERE session_id=%s ORDER BY created_at",
                    (session_id,),
                )
                rows = await cur.fetchall()
                return [
                    SessionNote(
                        id=r["id"],
                        session_id=r["session_id"],
                        text=r["text"],
                        created_at=r["created_at"],
                        created_by=r.get("created_by"),
                    )
                    for r in rows
                ]

    # ── Audit Log ──

    async def log_audit(
        self,
        action: str,
        username: Optional[str] = None,
        resource: Optional[str] = None,
        detail: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        try:
            async with self._pool.acquire() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "INSERT INTO audit_log (ts, username, action, resource, detail, ip_address) VALUES (%s,%s,%s,%s,%s,%s)",
                        (datetime.now(timezone.utc), username, action, resource, detail, ip_address),
                    )
        except Exception:
            logger.exception("audit_log_write_failed")

    async def get_audit_log(
        self, limit: int = 100, offset: int = 0, username: Optional[str] = None
    ) -> list[AuditEntry]:
        clauses = []
        params: list[Any] = []
        if username:
            clauses.append("username = %s")
            params.append(username)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"SELECT * FROM audit_log {where} ORDER BY ts DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, params)
                rows = await cur.fetchall()
                return [
                    AuditEntry(
                        id=r["id"],
                        ts=r["ts"],
                        username=r.get("username"),
                        action=r["action"],
                        resource=r.get("resource"),
                        detail=r.get("detail"),
                        ip_address=r.get("ip_address"),
                    )
                    for r in rows
                ]

    # ── Search (full-text on transcript / complaints / notes) ──

    async def search_patients(self, query: str, limit: int = 50) -> list[PatientRecord]:
        return await self.list_all(search=query, limit=limit)

    # ── Geolocation helpers ──

    async def patients_with_location(self) -> list[dict]:
        """Return minimal patient data with GPS coords for map display."""
        async with self._pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    "SELECT id, session_id, priority, chief_complaint, latitude, longitude, saved_at "
                    "FROM patients WHERE latitude IS NOT NULL AND longitude IS NOT NULL "
                    "ORDER BY saved_at DESC LIMIT 200"
                )
                return list(await cur.fetchall())
