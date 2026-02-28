import type { FC } from "react";
import type { PatientRecord } from "../types";
import { Trash2, ChevronRight, Download } from "lucide-react";

interface Props {
  patients: PatientRecord[];
  onRemove: (id: string) => void;
  onSelect: (p: PatientRecord) => void;
  onExportPDF?: (id: string) => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  immediate: "Immediate",
  emergent: "Emergent",
  urgent: "Urgent",
  less_urgent: "Less Urgent",
  non_urgent: "Non-Urgent",
  unknown: "Unknown",
};

export const PatientTable: FC<Props> = ({ patients, onRemove, onSelect, onExportPDF }) => {
  if (patients.length === 0) {
    return (
      <div className="chart-empty" style={{ padding: "var(--space-8)" }}>
        <span>No patient records saved yet. Complete a triage session to see records here.</span>
      </div>
    );
  }

  return (
    <div className="patient-table-wrapper">
      <table className="patient-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Chief Complaint</th>
            <th>Age / Gender</th>
            <th>Priority</th>
            <th>Confidence</th>
            <th>Saved</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => {
            const t = p.triage;
            return (
              <tr key={p.id} onClick={() => onSelect(p)} className="patient-table__row">
                <td className="patient-table__id">{p.id}</td>
                <td>{t.chief_complaint ?? "—"}</td>
                <td>
                  {t.patient_info.age ?? "?"} / {t.patient_info.gender ?? "?"}
                </td>
                <td>
                  <span className={`priority-badge priority-badge--${t.priority}`}>
                    {PRIORITY_LABELS[t.priority] ?? t.priority}
                  </span>
                </td>
                <td>
                  {t.confidence_score != null
                    ? `${Math.round(t.confidence_score * 100)}%`
                    : "—"}
                </td>
                <td className="patient-table__time">
                  {new Date(p.saved_at).toLocaleTimeString()}
                </td>
                <td className="patient-table__actions">
                  {onExportPDF && (
                    <button
                      className="icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExportPDF(p.id);
                      }}
                      aria-label="Export PDF"
                      title="Export PDF"
                    >
                      <Download size={14} />
                    </button>
                  )}
                  <button
                    className="icon-btn icon-btn--danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(p.id);
                    }}
                    aria-label="Remove record"
                  >
                    <Trash2 size={14} />
                  </button>
                  <ChevronRight size={14} className="icon-muted" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
