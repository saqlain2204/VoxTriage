import type {
  DetailedHealthResponse,
  TextTriageResponse,
  PatientRecord,
  SessionNote,
  AuditEntry,
  TreatmentResult,
  ImageAnalysisResult,
  DocumentParseResult,
  TriageRecord,
} from "./types";

const API_BASE = "/api/v1";

/** Read token from localStorage for auth headers. */
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("voxtriage_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Wrapper around fetch that handles JSON parsing and error throwing.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...init?.headers,
    },
    ...init,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/* ── Auth ── */

export interface AuthResponse {
  token: string;
  username: string;
  role: string;
}

export async function registerUser(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>(`${API_BASE}/auth/register`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

/* ── Health ── */

export function fetchHealth(): Promise<DetailedHealthResponse> {
  return request<DetailedHealthResponse>("/health/detailed");
}

/* ── Triage (one-shot) ── */

export function extractTriage(
  transcript: string,
  sessionId = "oneshot",
): Promise<TextTriageResponse> {
  return request<TextTriageResponse>(`${API_BASE}/triage/extract`, {
    method: "POST",
    body: JSON.stringify({ transcript, session_id: sessionId }),
  });
}

/* ── Sessions ── */

export interface SessionListResponse {
  active_count: number;
  sessions: Record<string, unknown>[];
}

export function fetchSessions(): Promise<SessionListResponse> {
  return request<SessionListResponse>(`${API_BASE}/sessions`);
}

export function fetchSession(sessionId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}`);
}

/* ── Patients ── */

export interface PatientListParams {
  priority?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export function fetchPatients(params?: PatientListParams): Promise<PatientRecord[]> {
  const qs = new URLSearchParams();
  if (params?.priority) qs.set("priority", params.priority);
  if (params?.search) qs.set("search", params.search);
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to) qs.set("date_to", params.date_to);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return request<PatientRecord[]>(`${API_BASE}/patients/${query ? "?" + query : ""}`);
}

export function savePatient(
  sessionId: string,
  transcript: string,
  triage: unknown,
  opts?: { latitude?: number; longitude?: number; language?: string; notes?: string },
): Promise<PatientRecord> {
  return request<PatientRecord>(`${API_BASE}/patients/`, {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      transcript,
      triage,
      ...opts,
    }),
  });
}

export function deletePatient(patientId: string): Promise<void> {
  return request<void>(`${API_BASE}/patients/${encodeURIComponent(patientId)}`, {
    method: "DELETE",
  });
}

export function clearPatients(): Promise<{ cleared: number }> {
  return request<{ cleared: number }>(`${API_BASE}/patients/clear`, {
    method: "POST",
  });
}

export interface DashboardData {
  total_patients: number;
  critical_count: number;
  avg_confidence: number | null;
  total_symptoms: number;
  priority_counts: Record<string, number>;
  age_distribution: Record<string, number>;
  top_symptoms: Array<{ symptom: string; count: number }>;
  vital_averages: Record<string, number | null>;
}

export function fetchDashboard(): Promise<DashboardData> {
  return request<DashboardData>(`${API_BASE}/patients/dashboard`);
}

/* ── PDF Export ── */

export async function exportPatientPDF(patientId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/patients/export/${encodeURIComponent(patientId)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
}

/* ── Session Notes ── */

export function addSessionNote(
  patientId: string,
  text: string,
): Promise<SessionNote> {
  return request<SessionNote>(
    `${API_BASE}/patients/${encodeURIComponent(patientId)}/notes`,
    { method: "POST", body: JSON.stringify({ text }) },
  );
}

export function fetchSessionNotes(patientId: string): Promise<SessionNote[]> {
  return request<SessionNote[]>(
    `${API_BASE}/patients/${encodeURIComponent(patientId)}/notes`,
  );
}

/* ── Audit Log ── */

export function fetchAuditLog(
  limit = 100,
  offset = 0,
): Promise<{ entries: AuditEntry[] }> {
  return request<{ entries: AuditEntry[] }>(
    `${API_BASE}/audit/log?limit=${limit}&offset=${offset}`,
  );
}

/* ── AI: Treatment Suggestions ── */

export function suggestTreatment(
  triage: TriageRecord,
  transcript = "",
): Promise<TreatmentResult> {
  return request<TreatmentResult>(`${API_BASE}/ai/suggest-treatment`, {
    method: "POST",
    body: JSON.stringify({ triage, transcript }),
  });
}

/* ── AI: Vision (wound analysis) ── */

export async function analyzeImage(
  file: File,
  context = "",
): Promise<ImageAnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (context) formData.append("context", context);

  const res = await fetch(`${API_BASE}/ai/analyze-image`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

/* ── AI: Document parsing ── */

export async function parseDocument(file: File): Promise<DocumentParseResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/ai/parse-document`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

/* ── Map Data ── */

export function fetchMapData(): Promise<
  Array<{
    id: string;
    session_id: string;
    priority: string;
    chief_complaint: string | null;
    latitude: number;
    longitude: number;
    saved_at: string;
  }>
> {
  return request(`${API_BASE}/patients/map`);
}
