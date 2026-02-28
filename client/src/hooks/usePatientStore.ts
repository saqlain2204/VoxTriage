import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computePriorityCounts,
  computeAgeDist,
  computeVitalAverages,
  computeTopSymptoms,
} from "../store/patientStore";
import type { PatientRecord, TriageRecord } from "../types";
import {
  fetchPatients,
  savePatient,
  deletePatient,
  clearPatients,
} from "../api";

/**
 * React hook that reads / writes patient records via the backend API
 * and derives chart data on the client side.
 */
export function usePatientStore() {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(false);

  /* ── Fetch from backend ── */
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPatients();
      setPatients(data);
    } catch {
      // silently ignore — user might not be authenticated yet
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount.
  useEffect(() => {
    refresh();
  }, [refresh]);

  /* ── Mutations ── */
  const save = useCallback(
    async (sessionId: string, transcript: string, triage: TriageRecord): Promise<PatientRecord | null> => {
      try {
        const record = await savePatient(sessionId, transcript, triage);
        await refresh();
        return record;
      } catch (err) {
        console.error("Failed to save patient record", err);
        throw err;
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deletePatient(id);
        await refresh();
      } catch (err) {
        console.error("Failed to delete patient record", err);
      }
    },
    [refresh],
  );

  const clear = useCallback(async () => {
    try {
      await clearPatients();
      await refresh();
    } catch (err) {
      console.error("Failed to clear patient records", err);
    }
  }, [refresh]);

  /* ── Computed chart data ── */
  const priorityCounts = useMemo(
    () => computePriorityCounts(patients),
    [patients],
  );
  const ageDist = useMemo(() => computeAgeDist(patients), [patients]);
  const vitalAverages = useMemo(
    () => computeVitalAverages(patients),
    [patients],
  );
  const topSymptoms = useMemo(
    () => computeTopSymptoms(patients),
    [patients],
  );

  return {
    patients,
    loading,
    refresh,
    priorityCounts,
    ageDist,
    vitalAverages,
    topSymptoms,
    save,
    remove,
    clear,
  };
}
