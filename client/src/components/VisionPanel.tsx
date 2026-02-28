import { type FC, useCallback, useRef, useState } from "react";
import { Camera, FileText, Upload, Loader2, X, CheckCircle2 } from "lucide-react";
import { analyzeImage, parseDocument } from "../api";
import type { ImageAnalysisResult, DocumentParseResult, TriageRecord } from "../types";

type Mode = "wound" | "document";
type AnalysisStatus = "idle" | "analyzing" | "done" | "error";

interface VisionPanelProps {
  triage?: TriageRecord | null;
  transcript?: string;
}

export const VisionPanel: FC<VisionPanelProps> = ({ triage, transcript }) => {
  const [mode, setMode] = useState<Mode>("wound");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [woundResult, setWoundResult] = useState<ImageAnalysisResult | null>(null);
  const [docResult, setDocResult] = useState<DocumentParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setError(null);
    setWoundResult(null);
    setDocResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setPreview(null);
    setWoundResult(null);
    setDocResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  /* Build clinical context from triage record + transcript for better AI analysis */
  const buildContext = useCallback(() => {
    const parts: string[] = [];
    if (triage) {
      if (triage.chief_complaint) parts.push(`Chief complaint: ${triage.chief_complaint}`);
      if (triage.priority && triage.priority !== "unknown") parts.push(`Triage priority: ${triage.priority}`);
      if (triage.patient_info.age) parts.push(`Age: ${triage.patient_info.age}`);
      if (triage.patient_info.gender) parts.push(`Gender: ${triage.patient_info.gender}`);
      if (triage.patient_info.known_allergies.length > 0) parts.push(`Allergies: ${triage.patient_info.known_allergies.join(", ")}`);
      if (triage.patient_info.known_conditions.length > 0) parts.push(`Conditions: ${triage.patient_info.known_conditions.join(", ")}`);
      if (triage.mechanism_of_injury) parts.push(`Mechanism: ${triage.mechanism_of_injury}`);
      if (triage.symptoms.length > 0) parts.push(`Symptoms: ${triage.symptoms.map(s => s.description).join(", ")}`);
      if (triage.vital_signs.heart_rate) parts.push(`HR: ${triage.vital_signs.heart_rate}`);
      if (triage.vital_signs.spo2) parts.push(`SpO2: ${triage.vital_signs.spo2}%`);
    }
    if (transcript) parts.push(`Transcript excerpt: ${transcript.slice(0, 500)}`);
    return parts.join(". ");
  }, [triage, transcript]);

  const analyze = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setAnalysisStatus("analyzing");
    try {
      if (mode === "wound") {
        const context = buildContext();
        const result = await analyzeImage(file, context);
        setWoundResult(result);
      } else {
        const result = await parseDocument(file);
        setDocResult(result);
      }
      setAnalysisStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setAnalysisStatus("error");
    } finally {
      setLoading(false);
    }
  }, [file, mode, buildContext]);

  const SEVERITY_COLORS: Record<string, string> = {
    minor: "var(--color-success)",
    moderate: "var(--color-warning)",
    severe: "var(--color-emergent)",
    critical: "var(--color-danger)",
  };

  return (
    <div className="triage-card">
      <div className="triage-card__header">
        <div className="triage-card__label">
          <Camera size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          Vision & Document AI
        </div>
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          <button
            className={`toolbar-btn toolbar-btn--sm ${mode === "wound" ? "toolbar-btn--accent" : ""}`}
            onClick={() => { setMode("wound"); clearFile(); }}
          >
            <Camera size={11} /> Wound
          </button>
          <button
            className={`toolbar-btn toolbar-btn--sm ${mode === "document" ? "toolbar-btn--accent" : ""}`}
            onClick={() => { setMode("document"); clearFile(); }}
          >
            <FileText size={11} /> Document
          </button>
        </div>
      </div>
      <div className="triage-card__body">
        {/* Upload Area */}
        <div
          className="vision-upload"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {preview ? (
            <div style={{ position: "relative", width: "100%" }}>
              <img
                src={preview}
                alt="Preview"
                style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: "var(--radius-md)" }}
              />
              <button
                className="icon-btn"
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                style={{ position: "absolute", top: 4, right: 4, background: "var(--color-surface)" }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-6)", color: "var(--color-text-tertiary)" }}>
              <Upload size={24} />
              <span style={{ fontSize: "var(--text-xs)" }}>
                {mode === "wound" ? "Upload wound/injury photo" : "Upload medical document"}
              </span>
              <span style={{ fontSize: "var(--text-xs)", opacity: 0.6 }}>Click or drag & drop</span>
            </div>
          )}
        </div>

        {file && (
          <button
            className="toolbar-btn toolbar-btn--accent"
            style={{ width: "100%", marginTop: "var(--space-3)", justifyContent: "center" }}
            onClick={analyze}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="spin" /> : mode === "wound" ? <Camera size={14} /> : <FileText size={14} />}
            {loading ? "Analyzing…" : `Analyze ${mode === "wound" ? "Image" : "Document"}`}
          </button>
        )}

        {error && (
          <div style={{ color: "var(--color-danger)", fontSize: "var(--text-xs)", marginTop: "var(--space-2)" }}>
            {error}
          </div>
        )}

        {/* Analysis status indicator */}
        {analysisStatus === "analyzing" && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-accent)", marginTop: "var(--space-2)" }}>
            <Loader2 size={12} className="spin" />
            Analyzing {mode === "wound" ? "image" : "document"} with Mistral Vision AI…
          </div>
        )}
        {analysisStatus === "done" && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-success)", marginTop: "var(--space-2)" }}>
            <CheckCircle2 size={12} />
            Analysis complete
          </div>
        )}

        {/* Wound Analysis Result */}
        {woundResult && (
          <div style={{ marginTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <span className="tag">{woundResult.image_type}</span>
              <span className="priority-badge" style={{ background: `${SEVERITY_COLORS[woundResult.severity] ?? "var(--color-text-tertiary)"}22`, color: SEVERITY_COLORS[woundResult.severity] ?? "var(--color-text-tertiary)" }}>
                {woundResult.severity}
              </span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                Confidence: {Math.round(woundResult.confidence * 100)}%
              </span>
            </div>

            <div className="ai-summary">{woundResult.description}</div>

            {woundResult.clinical_findings.length > 0 && (
              <div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: 4 }}>Findings</div>
                <div className="tag-list">
                  {woundResult.clinical_findings.map((f, i) => <span key={i} className="tag tag--neutral">{f}</span>)}
                </div>
              </div>
            )}

            {woundResult.recommended_actions.length > 0 && (
              <div className="list-items">
                {woundResult.recommended_actions.map((a, i) => (
                  <div key={i} className="list-item">
                    <div className="list-item__dot" style={{ background: "var(--color-success)" }} />
                    <div className="list-item__content">{a}</div>
                  </div>
                ))}
              </div>
            )}

            {woundResult.concerns.length > 0 && (
              <div className="vitals-alert vitals-alert--warning">
                <span style={{ fontSize: "var(--text-xs)" }}>⚠ {woundResult.concerns.join(" | ")}</span>
              </div>
            )}

            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
              Triage impact: {woundResult.triage_impact}
              {woundResult.requires_specialist && ` — Needs ${woundResult.specialist_type}`}
            </div>
          </div>
        )}

        {/* Document Parse Result */}
        {docResult && (
          <div style={{ marginTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", gap: "var(--space-3)" }}>
              <span className="tag">{docResult.document_type.replace(/_/g, " ")}</span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                Confidence: {Math.round(docResult.confidence * 100)}%
              </span>
            </div>

            {docResult.extracted_data.patient_name && (
              <div className="data-field">
                <div className="data-field__label">Patient Name</div>
                <div className="data-field__value">{docResult.extracted_data.patient_name}</div>
              </div>
            )}

            {docResult.extracted_data.medications.length > 0 && (
              <div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: 4 }}>Medications</div>
                <div className="list-items">
                  {docResult.extracted_data.medications.map((m, i) => (
                    <div key={i} className="list-item">
                      <div className="list-item__dot" />
                      <div className="list-item__content">
                        <strong>{m.name}</strong> — {m.dosage} ({m.frequency})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {docResult.extracted_data.allergies.length > 0 && (
              <div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: 4 }}>Allergies</div>
                <div className="tag-list">
                  {docResult.extracted_data.allergies.map((a, i) => <span key={i} className="tag">{a}</span>)}
                </div>
              </div>
            )}

            {docResult.extracted_data.conditions.length > 0 && (
              <div className="tag-list">
                {docResult.extracted_data.conditions.map((c, i) => <span key={i} className="tag tag--neutral">{c}</span>)}
              </div>
            )}

            {docResult.notes && (
              <div className="ai-summary">{docResult.notes}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
