import { type FC, useCallback, useEffect, useState } from "react";
import { Shield, Clock, RefreshCw } from "lucide-react";
import { fetchAuditLog } from "../api";
import type { AuditEntry } from "../types";

export const AuditLog: FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLog(200);
      setEntries(data.entries);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const actionColor = (action: string) => {
    if (action.includes("delete") || action.includes("clear")) return "var(--color-danger)";
    if (action.includes("save") || action.includes("add")) return "var(--color-success)";
    if (action.includes("export")) return "var(--color-info)";
    return "var(--color-text-secondary)";
  };

  return (
    <div className="dashboard__card dashboard__card--full">
      <div className="dashboard__card-header">
        <Shield size={14} />
        <span>Audit Log</span>
        <button className="icon-btn" onClick={load} style={{ marginLeft: "auto" }}>
          <RefreshCw size={12} className={loading ? "spin" : ""} />
        </button>
      </div>
      <div className="dashboard__card-body" style={{ padding: 0, maxHeight: 360, overflowY: "auto" }}>
        {entries.length === 0 ? (
          <div className="chart-empty" style={{ padding: "var(--space-8)" }}>
            <span>No audit entries recorded yet.</span>
          </div>
        ) : (
          <table className="patient-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Detail</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="patient-table__time">
                    <Clock size={10} style={{ marginRight: 4, verticalAlign: -1 }} />
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td>{e.username ?? "—"}</td>
                  <td>
                    <span style={{ color: actionColor(e.action), fontWeight: 600, fontSize: "var(--text-xs)" }}>
                      {e.action}
                    </span>
                  </td>
                  <td className="patient-table__id">{e.resource ?? "—"}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.detail ?? "—"}
                  </td>
                  <td className="patient-table__time">{e.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
