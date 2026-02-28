from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class TriagePriority(str, Enum):
    """Standard triage severity levels."""
    IMMEDIATE = "immediate"       # Red - life-threatening
    EMERGENT = "emergent"         # Orange - serious, could deteriorate
    URGENT = "urgent"             # Yellow - requires attention soon
    LESS_URGENT = "less_urgent"   # Green - can wait
    NON_URGENT = "non_urgent"     # Blue - minor
    UNKNOWN = "unknown"


class VitalSigns(BaseModel):
    """Extracted vital signs from audio stream."""
    heart_rate: Optional[int] = Field(None, description="Heart rate in BPM")
    blood_pressure_systolic: Optional[int] = Field(None, description="Systolic BP in mmHg")
    blood_pressure_diastolic: Optional[int] = Field(None, description="Diastolic BP in mmHg")
    respiratory_rate: Optional[int] = Field(None, description="Respiratory rate per minute")
    spo2: Optional[int] = Field(None, description="Oxygen saturation percentage")
    temperature: Optional[float] = Field(None, description="Temperature in Fahrenheit")
    gcs: Optional[int] = Field(None, description="Glasgow Coma Scale score (3-15)")


class PatientInfo(BaseModel):
    """Extracted patient demographic information."""
    age: Optional[int] = None
    gender: Optional[str] = None
    weight_kg: Optional[float] = None
    known_allergies: list[str] = Field(default_factory=list)
    known_conditions: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)


class Symptom(BaseModel):
    """A single extracted symptom."""
    description: str
    onset: Optional[str] = None
    severity: Optional[str] = None
    location: Optional[str] = None


class Intervention(BaseModel):
    """A medical intervention performed or recommended."""
    action: str
    timestamp: Optional[str] = None
    status: str = "reported"


class TriageRecord(BaseModel):
    """Complete structured triage record assembled from audio stream."""
    id: str = Field(default_factory=lambda: uuid4().hex[:12])
    session_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    priority: TriagePriority = TriagePriority.UNKNOWN
    chief_complaint: Optional[str] = None
    patient_info: PatientInfo = Field(default_factory=PatientInfo)
    vital_signs: VitalSigns = Field(default_factory=VitalSigns)
    symptoms: list[Symptom] = Field(default_factory=list)
    interventions: list[Intervention] = Field(default_factory=list)
    mechanism_of_injury: Optional[str] = None
    scene_notes: Optional[str] = None
    ai_summary: Optional[str] = None
    raw_transcript_snippet: Optional[str] = None
    confidence_score: Optional[float] = Field(None, ge=0.0, le=1.0)

    def merge_update(self, other: "TriageRecord") -> None:
        """Merge non-None fields from another record into this one."""
        if other.priority != TriagePriority.UNKNOWN:
            self.priority = other.priority
        if other.chief_complaint:
            self.chief_complaint = other.chief_complaint
        if other.mechanism_of_injury:
            self.mechanism_of_injury = other.mechanism_of_injury
        if other.scene_notes:
            self.scene_notes = other.scene_notes
        if other.ai_summary:
            self.ai_summary = other.ai_summary
        if other.confidence_score is not None:
            self.confidence_score = other.confidence_score

        # Merge vital signs - update only non-None values
        for field_name in VitalSigns.model_fields:
            new_val = getattr(other.vital_signs, field_name, None)
            if new_val is not None:
                setattr(self.vital_signs, field_name, new_val)

        # Merge patient info
        for field_name in ["age", "gender", "weight_kg"]:
            new_val = getattr(other.patient_info, field_name, None)
            if new_val is not None:
                setattr(self.patient_info, field_name, new_val)

        # Merge list fields for patient info (deduplicate)
        for field_name in ["known_allergies", "known_conditions", "medications"]:
            existing = set(getattr(self.patient_info, field_name))
            incoming = getattr(other.patient_info, field_name)
            for item in incoming:
                if item not in existing:
                    getattr(self.patient_info, field_name).append(item)

        # Append new symptoms (simple dedup by description)
        existing_descs = {s.description.lower() for s in self.symptoms}
        for symptom in other.symptoms:
            if symptom.description.lower() not in existing_descs:
                self.symptoms.append(symptom)
                existing_descs.add(symptom.description.lower())

        # Append new interventions
        existing_actions = {i.action.lower() for i in self.interventions}
        for intervention in other.interventions:
            if intervention.action.lower() not in existing_actions:
                self.interventions.append(intervention)
                existing_actions.add(intervention.action.lower())

        self.timestamp = datetime.now(timezone.utc)
