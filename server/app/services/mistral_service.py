import json
from typing import Optional

from mistralai import Mistral

from app.config import Settings
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

TRIAGE_SYSTEM_PROMPT = """You are a medical triage AI assistant deployed in an emergency response setting. 
Your role is to continuously analyze incoming transcripts from paramedics, ER staff, or 911 dispatchers and extract structured medical data.

You MUST respond with valid JSON matching this exact schema. Do not include any text outside the JSON.

Schema:
{
  "priority": "immediate | emergent | urgent | less_urgent | non_urgent | unknown",
  "chief_complaint": "string or null",
  "patient_info": {
    "age": number or null,
    "gender": "string or null",
    "weight_kg": number or null,
    "known_allergies": ["string"],
    "known_conditions": ["string"],
    "medications": ["string"]
  },
  "vital_signs": {
    "heart_rate": number or null,
    "blood_pressure_systolic": number or null,
    "blood_pressure_diastolic": number or null,
    "respiratory_rate": number or null,
    "spo2": number or null,
    "temperature": number or null,
    "gcs": number or null
  },
  "symptoms": [{"description": "string", "onset": "string or null", "severity": "string or null", "location": "string or null"}],
  "interventions": [{"action": "string", "timestamp": "string or null", "status": "reported"}],
  "mechanism_of_injury": "string or null",
  "scene_notes": "string or null",
  "ai_summary": "Brief clinical summary of the situation",
  "confidence_score": 0.0 to 1.0
}

Rules:
- Only extract information explicitly mentioned in the transcript.
- Do not fabricate or infer data that is not clearly stated.
- Set fields to null if no relevant information is available.
- Use standard medical terminology where possible.
- Assign triage priority based on clinical presentation using ESI (Emergency Severity Index) principles.
- The confidence_score should reflect how much relevant medical data was present in the transcript.
- If the transcript is mostly non-medical chatter, return minimal data with low confidence.
"""

COPILOT_SYSTEM_PROMPT = """You are an expert emergency medical AI copilot working alongside a paramedic in real-time.
Your role is to proactively analyze the current triage situation and provide actionable intelligence.

You MUST respond with valid JSON matching this exact schema:
{
  "alerts": [
    {
      "severity": "critical | warning | info",
      "message": "Brief, actionable clinical alert based on pattern detection"
    }
  ],
  "follow_up_questions": [
    "Question the paramedic should ask the patient or verify next"
  ],
  "suggestions": [
    "Proactive clinical suggestion or action to consider"
  ],
  "clinical_reasoning": "One sentence explaining your key clinical concern right now"
}

Rules:
- Detect dangerous vital sign patterns (shock, respiratory distress, cardiac events, etc.)
- Flag drug interactions and allergy concerns immediately
- Suggest what information is MISSING that would be critical for triage
- Keep alerts to max 3 most critical, follow_up_questions to max 3, suggestions to max 3
- Be concise and actionable — every word matters in an emergency
- Do NOT repeat information the paramedic already provided — only add new insights
- If the clinical picture is incomplete, ask for what's missing
- Use standard emergency medicine protocols (ATLS, ACLS, PHTLS) as reference
- If there are no meaningful insights to add, return empty arrays
"""


class MistralTriageService:
    """Uses Mistral Large to extract structured triage data from transcripts."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = Mistral(api_key=settings.mistral_api_key)
        self._model = settings.triage_model

    async def extract_triage_data(
        self,
        transcript: str,
        session_id: str,
        existing_record: Optional[TriageRecord] = None,
    ) -> Optional[TriageRecord]:
        """Analyze transcript text and return a structured TriageRecord.

        Args:
            transcript: Raw transcript text from Voxtral.
            session_id: Current session identifier.
            existing_record: Prior triage record for context continuity.

        Returns:
            A TriageRecord populated from the transcript, or None on failure.
        """
        if not transcript or not transcript.strip():
            return None

        user_prompt = self._build_user_prompt(transcript, existing_record)

        try:
            response = await self._client.chat.complete_async(
                model=self._model,
                messages=[
                    {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )

            raw_content = response.choices[0].message.content
            parsed = json.loads(raw_content)

            record = self._parse_to_record(parsed, session_id, transcript)

            logger.info(
                "triage_extraction_complete",
                session_id=session_id,
                priority=record.priority.value,
                confidence=record.confidence_score,
                symptoms_count=len(record.symptoms),
            )
            return record

        except json.JSONDecodeError:
            logger.error(
                "triage_json_parse_failed",
                session_id=session_id,
                raw_content=raw_content[:500] if raw_content else "empty",
            )
            return None
        except Exception:
            logger.exception("triage_extraction_failed", session_id=session_id)
            return None

    def _build_user_prompt(
        self, transcript: str, existing_record: Optional[TriageRecord]
    ) -> str:
        """Build the user prompt with transcript and optional prior context."""
        parts = []

        if existing_record:
            parts.append(
                "PRIOR TRIAGE CONTEXT (update and refine based on new transcript):\n"
                f"Priority: {existing_record.priority.value}\n"
                f"Chief Complaint: {existing_record.chief_complaint or 'Not yet identified'}\n"
                f"Patient: Age {existing_record.patient_info.age or 'unknown'}, "
                f"Gender {existing_record.patient_info.gender or 'unknown'}\n"
                f"Known symptoms: {', '.join(s.description for s in existing_record.symptoms) or 'None'}\n"
                "---"
            )

        parts.append(
            f"NEW TRANSCRIPT SEGMENT:\n\"\"\"\n{transcript}\n\"\"\"\n\n"
            "Extract all medical triage information from this transcript. "
            "Respond ONLY with the JSON structure specified in the system prompt."
        )

        return "\n\n".join(parts)

    def _parse_to_record(
        self, data: dict, session_id: str, transcript: str
    ) -> TriageRecord:
        """Convert raw JSON response into a TriageRecord model."""
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
                for s in symptoms_data
                if s.get("description")
            ],
            interventions=[
                Intervention(
                    action=i.get("action", ""),
                    timestamp=i.get("timestamp"),
                    status=i.get("status", "reported"),
                )
                for i in interventions_data
                if i.get("action")
            ],
            mechanism_of_injury=data.get("mechanism_of_injury"),
            scene_notes=data.get("scene_notes"),
            ai_summary=data.get("ai_summary"),
            raw_transcript_snippet=transcript[:500],
            confidence_score=data.get("confidence_score"),
        )

    # ── Copilot Insight Generation ────────────────────────────

    async def generate_copilot_insight(
        self,
        record: TriageRecord,
        latest_transcript: str,
    ) -> Optional[dict]:
        """Generate proactive copilot insights from current triage state.

        Returns a dict with alerts, follow_up_questions, suggestions,
        and clinical_reasoning — or None on failure.
        """
        if not record:
            return None

        # Build a concise clinical snapshot for the copilot
        parts = [
            f"CURRENT TRIAGE STATE:",
            f"Priority: {record.priority.value}",
            f"Chief Complaint: {record.chief_complaint or 'Not yet identified'}",
            f"Patient: Age {record.patient_info.age or 'unknown'}, "
            f"Gender {record.patient_info.gender or 'unknown'}",
        ]

        vs = record.vital_signs
        vitals_str = ", ".join(
            f"{k}: {v}" for k, v in {
                "HR": vs.heart_rate, "BP": f"{vs.blood_pressure_systolic}/{vs.blood_pressure_diastolic}"
                if vs.blood_pressure_systolic else None,
                "RR": vs.respiratory_rate, "SpO2": vs.spo2,
                "Temp": vs.temperature, "GCS": vs.gcs,
            }.items() if v and v != "None/None"
        )
        if vitals_str:
            parts.append(f"Vitals: {vitals_str}")

        if record.patient_info.known_allergies:
            parts.append(f"Allergies: {', '.join(record.patient_info.known_allergies)}")
        if record.patient_info.medications:
            parts.append(f"Medications: {', '.join(record.patient_info.medications)}")
        if record.patient_info.known_conditions:
            parts.append(f"Conditions: {', '.join(record.patient_info.known_conditions)}")
        if record.symptoms:
            parts.append(f"Symptoms: {', '.join(s.description for s in record.symptoms)}")
        if record.interventions:
            parts.append(f"Interventions: {', '.join(i.action for i in record.interventions)}")
        if record.mechanism_of_injury:
            parts.append(f"Mechanism: {record.mechanism_of_injury}")

        parts.append(f"\nLATEST PARAMEDIC INPUT:\n\"\"\"\n{latest_transcript[-500:]}\n\"\"\"")
        parts.append(
            "\nAnalyze this clinical situation. Identify critical patterns, "
            "missing information, and provide proactive guidance."
        )

        try:
            response = await self._client.chat.complete_async(
                model=self._model,
                messages=[
                    {"role": "system", "content": COPILOT_SYSTEM_PROMPT},
                    {"role": "user", "content": "\n".join(parts)},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )

            raw = response.choices[0].message.content
            parsed = json.loads(raw)

            # Validate structure
            result = {
                "alerts": parsed.get("alerts", [])[:3],
                "follow_up_questions": parsed.get("follow_up_questions", [])[:3],
                "suggestions": parsed.get("suggestions", [])[:3],
                "clinical_reasoning": parsed.get("clinical_reasoning", ""),
            }

            logger.info(
                "copilot_insight_generated",
                session_id=record.session_id,
                alerts=len(result["alerts"]),
                questions=len(result["follow_up_questions"]),
                suggestions=len(result["suggestions"]),
            )
            return result

        except Exception:
            logger.exception("copilot_insight_failed", session_id=record.session_id)
            return None
