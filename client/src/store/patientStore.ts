/**
 * Patient store helpers.
 *
 * The source of truth is now the backend API.  This module provides:
 *  - Computed chart-data helpers that operate on an array of PatientRecord[]
 *    fetched from the API (pure functions, no internal state).
 *  - Re-exported types used by Charts / PatientTable components.
 */

import type { PatientRecord, TriagePriority } from "../types";

// Re-export PatientRecord so existing imports from this file still work.
export type { PatientRecord };

/* ── Priority chart helpers ── */

export interface PriorityCount {
  priority: string;
  count: number;
  color: string;
}

const PRIORITY_COLORS: Record<TriagePriority, string> = {
  immediate: "#ef4444",
  emergent: "#f97316",
  urgent: "#eab308",
  less_urgent: "#22c55e",
  non_urgent: "#3b82f6",
  unknown: "#6e6e73",
};

const PRIORITY_LABELS: Record<TriagePriority, string> = {
  immediate: "Immediate",
  emergent: "Emergent",
  urgent: "Urgent",
  less_urgent: "Less Urgent",
  non_urgent: "Non-Urgent",
  unknown: "Unknown",
};

export function computePriorityCounts(patients: PatientRecord[]): PriorityCount[] {
  const counts: Record<string, number> = {};
  for (const p of patients) {
    const key = p.triage.priority;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts).map(([priority, count]) => ({
    priority: PRIORITY_LABELS[priority as TriagePriority] ?? priority,
    count,
    color: PRIORITY_COLORS[priority as TriagePriority] ?? "#6e6e73",
  }));
}

/* ── Age distribution ── */

export interface AgeGroup {
  range: string;
  count: number;
}

export function computeAgeDist(patients: PatientRecord[]): AgeGroup[] {
  const buckets: Record<string, number> = {
    "0–17": 0, "18–30": 0, "31–50": 0, "51–70": 0, "71+": 0, Unknown: 0,
  };
  for (const p of patients) {
    const age = p.triage.patient_info.age;
    if (age == null) buckets["Unknown"]!++;
    else if (age <= 17) buckets["0–17"]!++;
    else if (age <= 30) buckets["18–30"]!++;
    else if (age <= 50) buckets["31–50"]!++;
    else if (age <= 70) buckets["51–70"]!++;
    else buckets["71+"]!++;
  }
  return Object.entries(buckets)
    .filter(([, count]) => count > 0)
    .map(([range, count]) => ({ range, count }));
}

/* ── Vital averages ── */

export interface VitalAverage {
  label: string;
  value: number | null;
  unit: string;
}

export function computeVitalAverages(patients: PatientRecord[]): VitalAverage[] {
  if (patients.length === 0) return [];
  const fields = [
    { key: "heart_rate" as const, label: "Avg HR", unit: "bpm" },
    { key: "respiratory_rate" as const, label: "Avg RR", unit: "/min" },
    { key: "spo2" as const, label: "Avg SpO₂", unit: "%" },
    { key: "temperature" as const, label: "Avg Temp", unit: "°F" },
    { key: "gcs" as const, label: "Avg GCS", unit: "/15" },
  ];
  return fields.map(({ key, label, unit }) => {
    const values = patients
      .map((p) => p.triage.vital_signs[key])
      .filter((v): v is number => v != null);
    return {
      label,
      value:
        values.length > 0
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : null,
      unit,
    };
  });
}

/* ── Top symptoms ── */

export interface SymptomFrequency {
  symptom: string;
  count: number;
}

export function computeTopSymptoms(
  patients: PatientRecord[],
  limit = 8,
): SymptomFrequency[] {
  const freq: Record<string, number> = {};
  for (const p of patients) {
    for (const s of p.triage.symptoms) {
      const key = s.description.toLowerCase();
      freq[key] = (freq[key] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([symptom, count]) => ({ symptom, count }));
}
