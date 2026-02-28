import { type FC, useState, useCallback, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  Activity,
  Heart,
  TrendingUp,
  Trash2,
  Search,
  Download,
  Filter,
} from "lucide-react";
import { usePatientStore } from "../hooks/usePatientStore";
import { PriorityChart, BarChart, StatCard } from "./Charts";
import { PatientTable } from "./PatientTable";
import { TriageSidebar } from "./TriageSidebar";
import { AuditLog } from "./AuditLog";
import { exportPatientPDF } from "../api";
import type { PatientRecord } from "../types";

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All Priorities" },
  { value: "immediate", label: "Immediate" },
  { value: "emergent", label: "Emergent" },
  { value: "urgent", label: "Urgent" },
  { value: "less_urgent", label: "Less Urgent" },
  { value: "non_urgent", label: "Non-Urgent" },
  { value: "unknown", label: "Unknown" },
];

export const Dashboard: FC = () => {
  const {
    patients,
    priorityCounts,
    ageDist,
    vitalAverages,
    topSymptoms,
    refresh,
    remove,
    clear,
  } = usePatientStore();

  /* Re-fetch patient data every time the Dashboard mounts (tab switch). */
  useEffect(() => {
    refresh();
  }, [refresh]);

  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  /* ── Search / Filter state ── */
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const filteredPatients = patients.filter((p) => {
    if (priorityFilter && p.triage.priority !== priorityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (p.triage.chief_complaint ?? "").toLowerCase().includes(q) ||
        p.transcript.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSelect = useCallback((p: PatientRecord) => {
    setSelectedPatient((prev) => (prev?.id === p.id ? null : p));
  }, []);

  const handleRemove = useCallback(
    (id: string) => {
      if (selectedPatient?.id === id) setSelectedPatient(null);
      remove(id);
    },
    [selectedPatient, remove],
  );

  const handleExportPDF = useCallback(async (patientId: string) => {
    try {
      const blob = await exportPatientPDF(patientId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voxtriage-${patientId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed", err);
    }
  }, []);

  return (
    <div className="dashboard">
      {/* ── Top Stats ── */}
      <div className="dashboard__stats">
        <StatCard
          label="Total Patients"
          value={patients.length}
          accent
        />
        <StatCard
          label="Critical"
          value={
            patients.filter(
              (p) =>
                p.triage.priority === "immediate" ||
                p.triage.priority === "emergent",
            ).length
          }
          sub="Immediate + Emergent"
        />
        <StatCard
          label="Avg Confidence"
          value={
            patients.length > 0
              ? `${Math.round(
                  (patients
                    .map((p) => p.triage.confidence_score ?? 0)
                    .reduce((a, b) => a + b, 0) /
                    patients.length) *
                    100,
                )}%`
              : "—"
          }
        />
        <StatCard
          label="Symptoms Tracked"
          value={patients.reduce((acc, p) => acc + p.triage.symptoms.length, 0)}
        />
      </div>

      {/* ── Search + Filter Bar ── */}
      <div className="dashboard__filter-bar">
        <div className="dashboard__search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search patients, complaints, transcripts…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="dashboard__search-input"
          />
        </div>
        <div className="dashboard__filters">
          <Filter size={14} />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="dashboard__select"
          >
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          className={`toolbar-btn toolbar-btn--sm ${showAudit ? "toolbar-btn--accent" : ""}`}
          onClick={() => setShowAudit(!showAudit)}
        >
          Audit Log
        </button>
      </div>

      {/* ── Charts Row ── */}
      <div className="dashboard__charts">
        <div className="dashboard__card">
          <div className="dashboard__card-header">
            <Activity size={14} />
            <span>Priority Distribution</span>
          </div>
          <div className="dashboard__card-body">
            <PriorityChart data={priorityCounts} />
          </div>
        </div>

        <div className="dashboard__card">
          <div className="dashboard__card-header">
            <Users size={14} />
            <span>Age Distribution</span>
          </div>
          <div className="dashboard__card-body">
            <BarChart
              data={ageDist.map((a) => ({ label: a.range, value: a.count }))}
            />
          </div>
        </div>

        <div className="dashboard__card">
          <div className="dashboard__card-header">
            <TrendingUp size={14} />
            <span>Top Symptoms</span>
          </div>
          <div className="dashboard__card-body">
            <BarChart
              data={topSymptoms.map((s) => ({ label: s.symptom, value: s.count }))}
              barColor="#fb923c"
            />
          </div>
        </div>
      </div>

      {/* ── Vital Averages ── */}
      {vitalAverages.length > 0 && (
        <div className="dashboard__card dashboard__card--full">
          <div className="dashboard__card-header">
            <Heart size={14} />
            <span>Average Vitals</span>
          </div>
          <div className="dashboard__card-body">
            <div className="vitals-grid">
              {vitalAverages.map((v) => (
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
      )}

      {/* ── Patient Records Table ── */}
      <div className="dashboard__card dashboard__card--full">
        <div className="dashboard__card-header">
          <LayoutDashboard size={14} />
          <span>Patient Records</span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
            {filteredPatients.length}{filteredPatients.length !== patients.length ? ` / ${patients.length}` : ""}
          </span>
          {patients.length > 0 && (
            <button className="icon-btn icon-btn--danger" onClick={clear} style={{ marginLeft: "auto" }}>
              <Trash2 size={12} />
              <span style={{ fontSize: "var(--text-xs)" }}>Clear All</span>
            </button>
          )}
        </div>
        <div className="dashboard__card-body" style={{ padding: 0 }}>
          <PatientTable
            patients={filteredPatients}
            onRemove={handleRemove}
            onSelect={handleSelect}
            onExportPDF={handleExportPDF}
          />
        </div>
      </div>

      {/* ── Audit Log ── */}
      {showAudit && <AuditLog />}

      {/* ── Selected Patient Detail ── */}
      {selectedPatient && (
        <div className="dashboard__card dashboard__card--full">
          <div className="dashboard__card-header">
            <span>Detail: {selectedPatient.id}</span>
            <div style={{ display: "flex", gap: "var(--space-2)", marginLeft: "auto" }}>
              <button
                className="toolbar-btn toolbar-btn--sm toolbar-btn--accent"
                onClick={() => handleExportPDF(selectedPatient.id)}
              >
                <Download size={12} /> PDF
              </button>
              <button
                className="icon-btn"
                onClick={() => setSelectedPatient(null)}
                style={{ fontSize: "var(--text-xs)" }}
              >
                Close
              </button>
            </div>
          </div>
          <div className="dashboard__card-body">
            <TriageSidebar record={selectedPatient.triage} />
          </div>
        </div>
      )}
    </div>
  );
};
