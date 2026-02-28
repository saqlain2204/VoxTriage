"""AI-powered services: treatment suggestions, vision analysis, document parsing.

Uses Mistral LLM for text-based reasoning and Mistral Vision for image analysis.
"""

import base64
import json
from typing import Optional

from mistralai import Mistral

from app.config import get_settings
from app.logging_config import get_logger
from app.models.triage import TriageRecord

logger = get_logger(__name__)

# ── Treatment Suggestion Prompt ──────────────────────────────

TREATMENT_PROMPT = """You are a senior emergency medicine physician AI assistant.
Given the following triage data from a paramedic in the field, provide evidence-based
treatment suggestions and recommendations.

You MUST respond with valid JSON matching this schema:
{
  "suggestions": [
    {
      "category": "immediate_actions | medications | monitoring | transport | reassessment",
      "priority": "critical | high | medium | low",
      "action": "Brief action description",
      "rationale": "Clinical reasoning",
      "contraindications": ["list of contraindications to check"]
    }
  ],
  "transport_recommendation": {
    "destination_type": "trauma_center | stroke_center | cardiac_center | nearest_er | urgent_care",
    "urgency": "immediate | soon | routine",
    "reason": "Explanation"
  },
  "differential_diagnoses": [
    {
      "diagnosis": "Name",
      "likelihood": "high | medium | low",
      "key_findings": ["supporting findings"]
    }
  ],
  "warnings": ["Any critical warnings or red flags"],
  "clinical_notes": "Additional clinical context or observations"
}

Rules:
- Base suggestions ONLY on the provided triage data
- Prioritize life-threatening conditions
- Include medication dosages where appropriate
- Consider patient allergies and existing conditions
- Flag any contraindications
- Be specific and actionable for field paramedics
"""

# ── Vision Analysis Prompt ───────────────────────────────────

VISION_WOUND_PROMPT = """You are an emergency medicine AI assistant analyzing a medical image
(likely a wound, injury, or clinical finding photographed by a paramedic in the field).

Analyze the image and provide a structured assessment. Respond with valid JSON:
{
  "image_type": "wound | burn | rash | fracture | bruising | swelling | other",
  "description": "Detailed clinical description of what you observe",
  "severity": "minor | moderate | severe | critical",
  "estimated_measurements": {
    "approximate_size": "e.g., 5cm x 3cm if estimable",
    "depth": "superficial | partial_thickness | full_thickness | unknown"
  },
  "clinical_findings": ["list of observable clinical findings"],
  "recommended_actions": ["immediate field actions"],
  "concerns": ["any concerning features"],
  "requires_specialist": true/false,
  "specialist_type": "trauma_surgery | plastics | orthopedics | dermatology | none",
  "triage_impact": "How this finding should influence triage priority",
  "confidence": 0.0 to 1.0
}

Rules:
- Describe only what is clearly visible
- Do not diagnose definitively from images alone
- Indicate uncertainty where appropriate
- Focus on actionable information for paramedics
- Consider infection risk, bleeding severity, and functional impact
"""

DOCUMENT_PARSE_PROMPT = """You are a medical records AI assistant. Parse the following medical
document image (e.g., insurance card, medication list, prescription, allergy bracelet,
medical ID, or clinical document) and extract all relevant patient information.

Respond with valid JSON:
{
  "document_type": "insurance_card | prescription | medication_list | allergy_list | medical_id | clinical_note | lab_result | other",
  "extracted_data": {
    "patient_name": "string or null",
    "date_of_birth": "string or null",
    "insurance_info": {
      "provider": "string or null",
      "policy_number": "string or null",
      "group_number": "string or null"
    },
    "medications": [{"name": "string", "dosage": "string", "frequency": "string"}],
    "allergies": ["list of allergies found"],
    "conditions": ["list of medical conditions found"],
    "emergency_contact": {"name": "string or null", "phone": "string or null"},
    "blood_type": "string or null",
    "dnr_status": "string or null"
  },
  "raw_text": "All readable text from the document",
  "confidence": 0.0 to 1.0,
  "notes": "Any additional observations about the document"
}

Rules:
- Extract only clearly readable information
- Mark uncertain fields as null
- Note any partially legible text
- Preserve exact medication names and dosages
"""


class AIService:
    """Provides AI-powered clinical features via Mistral."""

    def __init__(self) -> None:
        settings = get_settings()
        self._client = Mistral(api_key=settings.mistral_api_key)
        self._triage_model = settings.triage_model
        self._vision_model = settings.vision_model

    async def suggest_treatment(
        self, triage_record: TriageRecord, transcript: str = ""
    ) -> dict:
        """Generate evidence-based treatment suggestions from triage data."""
        triage_summary = json.dumps(triage_record.model_dump(mode="json"), indent=2)
        user_prompt = f"TRIAGE DATA:\n{triage_summary}"
        if transcript:
            user_prompt += f"\n\nRELEVANT TRANSCRIPT:\n{transcript[:2000]}"

        try:
            response = await self._client.chat.complete_async(
                model=self._triage_model,
                messages=[
                    {"role": "system", "content": TREATMENT_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
            logger.info("treatment_suggestions_generated",
                        suggestion_count=len(result.get("suggestions", [])))
            return result
        except Exception:
            logger.exception("treatment_suggestion_failed")
            return {"error": "Failed to generate treatment suggestions"}

    async def analyze_image(
        self, image_base64: str, mime_type: str = "image/jpeg",
        context: Optional[str] = None,
    ) -> dict:
        """Analyze a wound/injury photo using Mistral Vision."""
        content = [
            {"type": "text", "text": VISION_WOUND_PROMPT},
        ]
        if context:
            content.append({"type": "text", "text": f"\nClinical context: {context}"})
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{image_base64}"},
        })

        try:
            response = await self._client.chat.complete_async(
                model=self._vision_model,
                messages=[{"role": "user", "content": content}],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
            logger.info("image_analysis_complete",
                        image_type=result.get("image_type"),
                        severity=result.get("severity"))
            return result
        except Exception:
            logger.exception("image_analysis_failed")
            return {"error": "Failed to analyze image"}

    async def parse_document(
        self, image_base64: str, mime_type: str = "image/jpeg",
    ) -> dict:
        """Parse a medical document image using Mistral Vision."""
        content = [
            {"type": "text", "text": DOCUMENT_PARSE_PROMPT},
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{image_base64}"},
            },
        ]

        try:
            response = await self._client.chat.complete_async(
                model=self._vision_model,
                messages=[{"role": "user", "content": content}],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
            logger.info("document_parsed",
                        doc_type=result.get("document_type"))
            return result
        except Exception:
            logger.exception("document_parse_failed")
            return {"error": "Failed to parse document"}
