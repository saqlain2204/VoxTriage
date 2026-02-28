import { type FC, useCallback, useState } from "react";
import { Stethoscope, AlertTriangle, Truck, FlaskConical, Loader2, CheckCircle2 } from "lucide-react";
import { suggestTreatment } from "../api";
import type { TriageRecord, TreatmentResult } from "../types";

interface Props {
  triage: TriageRecord | null;
  transcript?: string;
}

type GenStatus = "idle" | "generating" | "done" | "error";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "var(--color-immediate)",
  high: "var(--color-emergent)",
  medium: "var(--color-urgent)",
  low: "var(--color-success)",
};

const CATEGORY_ICONS: Record<string, string> = {
  immediate_actions: "🚨",
  medications: "💊",
  monitoring: "📊",
  transport: "🚑",
  reassessment: "🔄",
};

export const TreatmentPanel: FC<Props> = ({ triage, transcript }) => {
  const [result, setResult] = useState<TreatmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");

  const generate = useCallback(async () => {
    if (!triage) return;
    setLoading(true);
    setError(null);
    setGenStatus("generating");
    try {
      const data = await suggestTreatment(triage, transcript);
      setResult(data);
      setGenStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate suggestions");
      setGenStatus("error");
    } finally {
      setLoading(false);
    }
  }, [triage, transcript]);

  if (!triage) {
    return (
      <div className="triage-card">
        <div className="triage-card__header">
          <div className="triage-card__label">
            <Stethoscope size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            AI Treatment Suggestions
          </div>
        </div>
        <div className="triage-card__body">
          <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)" }}>
            Start a session and build triage data to get AI-powered treatment suggestions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="triage-card">
      <div className="triage-card__header">
        <div className="triage-card__label">
          <Stethoscope size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          AI Treatment Suggestions
        </div>
        <button
          className="toolbar-btn toolbar-btn--accent toolbar-btn--sm"
          onClick={generate}
          disabled={loading}
        >
          {loading ? <Loader2 size={12} className="spin" /> : <FlaskConical size={12} />}
          {loading ? "Analyzing…" : result ? "Regenerate" : "Generate"}
        </button>
      </div>
      <div className="triage-card__body">
        {error && (
          <div style={{ color: "var(--color-danger)", fontSize: "var(--text-xs)", marginBottom: "var(--space-3)" }}>
            {error}
          </div>
        )}

        {/* Status indicator */}
        {genStatus === "generating" && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-accent)", marginBottom: "var(--space-3)" }}>
            <Loader2 size={12} className="spin" />
            Generating treatment suggestions with Mistral AI…
          </div>
        )}
        {genStatus === "done" && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-success)", marginBottom: "var(--space-3)" }}>
            <CheckCircle2 size={12} />
            Treatment suggestions ready
          </div>
        )}

        {!result && !loading && genStatus !== "generating" && (
          <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)" }}>
            Click "Generate" to get AI-powered treatment recommendations based on the current triage data.
          </p>
        )}

        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="vitals-alert vitals-alert--critical">
                <AlertTriangle size={14} />
                <div>
                  {result.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: "var(--text-xs)" }}>{w}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions */}
            <div className="list-items">
              {result.suggestions.map((s, i) => (
                <div key={i} className="list-item" style={{ borderLeft: `3px solid ${PRIORITY_COLORS[s.priority] ?? "var(--color-accent)"}` }}>
                  <div className="list-item__content">
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <span>{CATEGORY_ICONS[s.category] ?? "•"}</span>
                      <strong style={{ fontSize: "var(--text-sm)" }}>{s.action}</strong>
                    </div>
                    <div className="list-item__meta">{s.rationale}</div>
                    {s.contraindications.length > 0 && (
                      <div style={{ marginTop: 4, fontSize: "var(--text-xs)", color: "var(--color-warning)" }}>
                        ⚠ Check: {s.contraindications.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Transport */}
            {result.transport_recommendation && (
              <div className="list-item" style={{ borderLeft: "3px solid var(--color-info)" }}>
                <Truck size={14} style={{ flexShrink: 0, marginTop: 3, color: "var(--color-info)" }} />
                <div className="list-item__content">
                  <strong style={{ fontSize: "var(--text-sm)" }}>
                    {result.transport_recommendation.destination_type.replace(/_/g, " ")}
                  </strong>
                  <div className="list-item__meta">
                    Urgency: {result.transport_recommendation.urgency} — {result.transport_recommendation.reason}
                  </div>
                </div>
              </div>
            )}

            {/* Differential Diagnoses */}
            {result.differential_diagnoses.length > 0 && (
              <div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "var(--space-2)" }}>
                  Differential Diagnoses
                </div>
                <div className="tag-list">
                  {result.differential_diagnoses.map((d, i) => (
                    <span key={i} className={`tag ${d.likelihood === "high" ? "" : "tag--neutral"}`}>
                      {d.diagnosis} ({d.likelihood})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Clinical Notes */}
            {result.clinical_notes && (
              <div className="ai-summary">{result.clinical_notes}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
