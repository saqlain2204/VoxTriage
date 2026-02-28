import { ClipboardList, Brain, HeartPulse, Shield, AlertTriangle } from "lucide-react";
import type { FC } from "react";
import type { TriageRecord, TriagePriority } from "../types";

interface TriageSidebarProps {
  record: TriageRecord | null;
}

/* ── Helpers ── */

const priorityLabel: Record<TriagePriority, string> = {
  immediate: "Immediate",
  emergent: "Emergent",
  urgent: "Urgent",
  less_urgent: "Less Urgent",
  non_urgent: "Non-Urgent",
  unknown: "Assessing…",
};

function DataField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="data-field">
      <div className="data-field__label">{label}</div>
      <div className="data-field__value">{children}</div>
    </div>
  );
}

function EmptyField() {
  return <span className="data-field__value--empty">—</span>;
}

/* ── Component ── */

export const TriageSidebar: FC<TriageSidebarProps> = ({ record }) => {
  if (!record) {
    return (
      <div className="panel__body">
        <div className="empty-state">
          <ClipboardList className="empty-state__icon" />
          <div className="empty-state__text">
            Triage data will appear here as the AI extracts information from the conversation.
          </div>
        </div>
      </div>
    );
  }

  const vs = record.vital_signs;
  const pi = record.patient_info;

  const vitals = [
    { label: "HR", value: vs.heart_rate, unit: "bpm" },
    {
      label: "BP",
      value:
        vs.blood_pressure_systolic && vs.blood_pressure_diastolic
          ? `${vs.blood_pressure_systolic}/${vs.blood_pressure_diastolic}`
          : null,
      unit: "",
    },
    { label: "RR", value: vs.respiratory_rate, unit: "/min" },
    { label: "SpO₂", value: vs.spo2, unit: "%" },
    { label: "Temp", value: vs.temperature, unit: "°F" },
    { label: "GCS", value: vs.gcs, unit: "/15" },
  ];

  return (
    <div className="panel__body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Priority & Chief Complaint */}
      <div className="triage-card">
        <div className="triage-card__header">
          <div className="triage-card__label">
            <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            Priority
          </div>
          <span className={`priority-badge priority-badge--${record.priority}`}>
            {priorityLabel[record.priority]}
          </span>
        </div>
        <div className="triage-card__body">
          <DataField label="Chief Complaint">
            {record.chief_complaint ?? <EmptyField />}
          </DataField>
          {record.mechanism_of_injury && (
            <DataField label="Mechanism of Injury">{record.mechanism_of_injury}</DataField>
          )}
        </div>
      </div>

      {/* Vitals */}
      <div className="triage-card">
        <div className="triage-card__header">
          <div className="triage-card__label">
            <HeartPulse size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            Vital Signs
          </div>
        </div>
        <div className="triage-card__body">
          <div className="vitals-grid">
            {vitals.map((v) => (
              <div
                key={v.label}
                className={`vital-item ${v.value == null ? "vital-item--empty" : ""}`}
              >
                <div className="vital-item__value">
                  {v.value != null ? `${v.value}` : "—"}
                  {v.value != null && (
                    <span style={{ fontSize: "var(--text-xs)", fontWeight: 400 }}>
                      {v.unit}
                    </span>
                  )}
                </div>
                <div className="vital-item__label">{v.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Patient Info */}
      <div className="triage-card">
        <div className="triage-card__header">
          <div className="triage-card__label">
            <Shield size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            Patient
          </div>
        </div>
        <div className="triage-card__body">
          <DataField label="Demographics">
            {pi.age || pi.gender ? (
              <>
                {pi.age && `${pi.age}y`}
                {pi.age && pi.gender && " / "}
                {pi.gender}
                {pi.weight_kg && ` / ${pi.weight_kg}kg`}
              </>
            ) : (
              <EmptyField />
            )}
          </DataField>

          {pi.known_allergies.length > 0 && (
            <DataField label="Allergies">
              <div className="tag-list">
                {pi.known_allergies.map((a) => (
                  <span key={a} className="tag">{a}</span>
                ))}
              </div>
            </DataField>
          )}

          {pi.known_conditions.length > 0 && (
            <DataField label="Conditions">
              <div className="tag-list">
                {pi.known_conditions.map((c) => (
                  <span key={c} className="tag tag--neutral">{c}</span>
                ))}
              </div>
            </DataField>
          )}

          {pi.medications.length > 0 && (
            <DataField label="Medications">
              <div className="tag-list">
                {pi.medications.map((m) => (
                  <span key={m} className="tag tag--neutral">{m}</span>
                ))}
              </div>
            </DataField>
          )}
        </div>
      </div>

      {/* Symptoms */}
      {record.symptoms.length > 0 && (
        <div className="triage-card">
          <div className="triage-card__header">
            <div className="triage-card__label">Symptoms</div>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
              {record.symptoms.length}
            </span>
          </div>
          <div className="triage-card__body">
            <div className="list-items">
              {record.symptoms.map((s, i) => (
                <div key={i} className="list-item">
                  <div className="list-item__dot" />
                  <div className="list-item__content">
                    <div>{s.description}</div>
                    {(s.severity ?? s.onset ?? s.location) && (
                      <div className="list-item__meta">
                        {[s.severity, s.location, s.onset].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Interventions */}
      {record.interventions.length > 0 && (
        <div className="triage-card">
          <div className="triage-card__header">
            <div className="triage-card__label">Interventions</div>
          </div>
          <div className="triage-card__body">
            <div className="list-items">
              {record.interventions.map((iv, i) => (
                <div key={i} className="list-item">
                  <div className="list-item__dot" style={{ background: "var(--color-success)" }} />
                  <div className="list-item__content">
                    <div>{iv.action}</div>
                    <div className="list-item__meta">{iv.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI Summary */}
      {record.ai_summary && (
        <div className="triage-card">
          <div className="triage-card__header">
            <div className="triage-card__label">
              <Brain size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
              AI Summary
            </div>
          </div>
          <div className="triage-card__body">
            <div className="ai-summary">{record.ai_summary}</div>
          </div>
        </div>
      )}

      {/* Confidence */}
      {record.confidence_score != null && (
        <div className="confidence-meter">
          <div className="confidence-meter__bar">
            <div
              className="confidence-meter__fill"
              style={{ width: `${Math.round(record.confidence_score * 100)}%` }}
            />
          </div>
          <div className="confidence-meter__label">
            {Math.round(record.confidence_score * 100)}%
          </div>
        </div>
      )}
    </div>
  );
};
