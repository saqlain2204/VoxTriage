import { type FC, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { VitalSigns, VitalsAlert } from "../types";

interface Props {
  vitals: VitalSigns | null;
}

/**
 * Real-time vitals alert — flashes warnings when critical thresholds are exceeded.
 */
export const VitalsAlerts: FC<Props> = ({ vitals }) => {
  const alerts = useMemo<VitalsAlert[]>(() => {
    if (!vitals) return [];
    const result: VitalsAlert[] = [];

    if (vitals.heart_rate != null) {
      if (vitals.heart_rate > 150)
        result.push({ vital: "HR", value: vitals.heart_rate, threshold: ">150", severity: "critical", message: "Tachycardia — HR critically elevated" });
      else if (vitals.heart_rate > 120)
        result.push({ vital: "HR", value: vitals.heart_rate, threshold: ">120", severity: "warning", message: "Tachycardia — elevated heart rate" });
      else if (vitals.heart_rate < 40)
        result.push({ vital: "HR", value: vitals.heart_rate, threshold: "<40", severity: "critical", message: "Severe bradycardia — HR critically low" });
      else if (vitals.heart_rate < 50)
        result.push({ vital: "HR", value: vitals.heart_rate, threshold: "<50", severity: "warning", message: "Bradycardia — low heart rate" });
    }

    if (vitals.spo2 != null) {
      if (vitals.spo2 < 85)
        result.push({ vital: "SpO₂", value: vitals.spo2, threshold: "<85%", severity: "critical", message: "Severe hypoxia — immediate oxygen" });
      else if (vitals.spo2 < 90)
        result.push({ vital: "SpO₂", value: vitals.spo2, threshold: "<90%", severity: "warning", message: "Hypoxia — supplemental oxygen needed" });
    }

    if (vitals.respiratory_rate != null) {
      if (vitals.respiratory_rate > 30)
        result.push({ vital: "RR", value: vitals.respiratory_rate, threshold: ">30", severity: "critical", message: "Severe tachypnea — respiratory distress" });
      else if (vitals.respiratory_rate > 24)
        result.push({ vital: "RR", value: vitals.respiratory_rate, threshold: ">24", severity: "warning", message: "Tachypnea — elevated respiratory rate" });
      else if (vitals.respiratory_rate < 8)
        result.push({ vital: "RR", value: vitals.respiratory_rate, threshold: "<8", severity: "critical", message: "Bradypnea — respiratory depression" });
    }

    if (vitals.blood_pressure_systolic != null) {
      if (vitals.blood_pressure_systolic < 80)
        result.push({ vital: "SBP", value: vitals.blood_pressure_systolic, threshold: "<80", severity: "critical", message: "Severe hypotension — shock risk" });
      else if (vitals.blood_pressure_systolic < 90)
        result.push({ vital: "SBP", value: vitals.blood_pressure_systolic, threshold: "<90", severity: "warning", message: "Hypotension — low blood pressure" });
      else if (vitals.blood_pressure_systolic > 200)
        result.push({ vital: "SBP", value: vitals.blood_pressure_systolic, threshold: ">200", severity: "critical", message: "Hypertensive crisis" });
      else if (vitals.blood_pressure_systolic > 180)
        result.push({ vital: "SBP", value: vitals.blood_pressure_systolic, threshold: ">180", severity: "warning", message: "Severe hypertension" });
    }

    if (vitals.temperature != null) {
      if (vitals.temperature > 104)
        result.push({ vital: "Temp", value: vitals.temperature, threshold: ">104°F", severity: "critical", message: "Hyperthermia — immediate cooling" });
      else if (vitals.temperature > 101)
        result.push({ vital: "Temp", value: vitals.temperature, threshold: ">101°F", severity: "warning", message: "Fever — elevated temperature" });
      else if (vitals.temperature < 95)
        result.push({ vital: "Temp", value: vitals.temperature, threshold: "<95°F", severity: "critical", message: "Hypothermia — warming needed" });
    }

    if (vitals.gcs != null) {
      if (vitals.gcs <= 3)
        result.push({ vital: "GCS", value: vitals.gcs, threshold: "≤3", severity: "critical", message: "Unresponsive — GCS 3" });
      else if (vitals.gcs <= 8)
        result.push({ vital: "GCS", value: vitals.gcs, threshold: "≤8", severity: "critical", message: "Severe impairment — consider intubation" });
      else if (vitals.gcs <= 12)
        result.push({ vital: "GCS", value: vitals.gcs, threshold: "≤12", severity: "warning", message: "Moderate impairment — close monitoring" });
    }

    return result;
  }, [vitals]);

  if (alerts.length === 0) return null;

  return (
    <div className="vitals-alerts">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`vitals-alert vitals-alert--${alert.severity}`}
        >
          <AlertTriangle size={14} />
          <div className="vitals-alert__content">
            <span className="vitals-alert__vital">{alert.vital}: {alert.value} ({alert.threshold})</span>
            <span className="vitals-alert__message">{alert.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
