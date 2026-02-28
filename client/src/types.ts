/* ── Domain Types (mirrors backend models) ──────────────────── */

export type TriagePriority =
  | "immediate"
  | "emergent"
  | "urgent"
  | "less_urgent"
  | "non_urgent"
  | "unknown";

export interface VitalSigns {
  heart_rate: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  gcs: number | null;
}

export interface PatientInfo {
  age: number | null;
  gender: string | null;
  weight_kg: number | null;
  known_allergies: string[];
  known_conditions: string[];
  medications: string[];
}

export interface Symptom {
  description: string;
  onset: string | null;
  severity: string | null;
  location: string | null;
}

export interface Intervention {
  action: string;
  timestamp: string | null;
  status: string;
}

export interface TriageRecord {
  id: string;
  session_id: string;
  timestamp: string;
  priority: TriagePriority;
  chief_complaint: string | null;
  patient_info: PatientInfo;
  vital_signs: VitalSigns;
  symptoms: Symptom[];
  interventions: Intervention[];
  mechanism_of_injury: string | null;
  scene_notes: string | null;
  ai_summary: string | null;
  raw_transcript_snippet: string | null;
  confidence_score: number | null;
}

/* ── WebSocket Message Types ── */

export type WSMessageType =
  | "audio_chunk"
  | "session_start"
  | "session_end"
  | "ping"
  | "text_input"
  | "transcript_update"
  | "triage_update"
  | "copilot_insight"
  | "session_started"
  | "session_ended"
  | "error"
  | "pong";

export interface WSMessage {
  type: WSMessageType;
  session_id: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
}

/* ── API Response Types ── */

export interface HealthResponse {
  status: string;
  service: string;
}

export interface DetailedHealthResponse extends HealthResponse {
  version: string;
  uptime_seconds: number;
  active_sessions: number;
  voxtral_model: string;
  triage_model: string;
  debug: boolean;
}

export interface TextTriageResponse {
  success: boolean;
  record: TriageRecord | null;
  error: string | null;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  isPartial: boolean;
  timestamp: number;
}

/* ── App State ── */

export type SessionStatus = "idle" | "connecting" | "active" | "ending";

/* ── Patient Record (mirrors backend PatientRecord) ── */

export interface PatientRecord {
  id: string;
  session_id: string;
  saved_at: string;
  transcript: string;
  triage: TriageRecord;
  latitude?: number | null;
  longitude?: number | null;
  language?: string;
  notes?: string;
  created_by?: string | null;
}

/* ── Session Note ── */

export interface SessionNote {
  id: string;
  session_id: string;
  text: string;
  created_at: string;
  created_by: string | null;
}

/* ── Audit Log Entry ── */

export interface AuditEntry {
  id: number;
  ts: string;
  username: string | null;
  action: string;
  resource: string | null;
  detail: string | null;
  ip_address: string | null;
}

/* ── AI Treatment Suggestion ── */

export interface TreatmentSuggestion {
  category: string;
  priority: string;
  action: string;
  rationale: string;
  contraindications: string[];
}

export interface TransportRecommendation {
  destination_type: string;
  urgency: string;
  reason: string;
}

export interface DifferentialDiagnosis {
  diagnosis: string;
  likelihood: string;
  key_findings: string[];
}

export interface TreatmentResult {
  suggestions: TreatmentSuggestion[];
  transport_recommendation: TransportRecommendation;
  differential_diagnoses: DifferentialDiagnosis[];
  warnings: string[];
  clinical_notes: string;
}

/* ── Vision AI ── */

export interface ImageAnalysisResult {
  image_type: string;
  description: string;
  severity: string;
  clinical_findings: string[];
  recommended_actions: string[];
  concerns: string[];
  requires_specialist: boolean;
  specialist_type: string;
  triage_impact: string;
  confidence: number;
}

export interface DocumentParseResult {
  document_type: string;
  extracted_data: {
    patient_name: string | null;
    date_of_birth: string | null;
    medications: Array<{ name: string; dosage: string; frequency: string }>;
    allergies: string[];
    conditions: string[];
    blood_type: string | null;
  };
  raw_text: string;
  confidence: number;
  notes: string;
}

/* ── Theme ── */
export type Theme = "dark" | "light";

/* ── Copilot Insight ── */

export interface CopilotAlert {
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface CopilotInsight {
  alerts: CopilotAlert[];
  follow_up_questions: string[];
  suggestions: string[];
  clinical_reasoning: string;
  timestamp?: number;
}

/* ── Vitals Alert ── */
export interface VitalsAlert {
  vital: string;
  value: number;
  threshold: string;
  severity: "warning" | "critical";
  message: string;
}
