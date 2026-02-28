import { type FC, useCallback, useEffect, useState, type FormEvent } from "react";
import { StickyNote, Send, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import type { SessionNote } from "../types";
import { addSessionNote, fetchSessionNotes } from "../api";

interface Props {
  patientId: string | null;
}

type NoteStatus = "idle" | "loading-notes" | "saving" | "saved" | "error";

export const SessionNotes: FC<Props> = ({ patientId }) => {
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [text, setText] = useState("");
  const [noteStatus, setNoteStatus] = useState<NoteStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [loadedForId, setLoadedForId] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    if (!patientId) return;
    setNoteStatus("loading-notes");
    setStatusMsg("Loading notes…");
    try {
      const data = await fetchSessionNotes(patientId);
      setNotes(data);
      setLoadedForId(patientId);
      setNoteStatus("idle");
      setStatusMsg(data.length > 0 ? `${data.length} note${data.length !== 1 ? "s" : ""} loaded` : "No notes yet");
    } catch (e) {
      setNoteStatus("error");
      setStatusMsg(e instanceof Error ? e.message : "Failed to load notes");
    }
  }, [patientId]);

  // Reload when patientId changes
  useEffect(() => {
    if (patientId && patientId !== loadedForId) {
      loadNotes();
    }
  }, [patientId, loadedForId, loadNotes]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!patientId || !text.trim()) return;
      setNoteStatus("saving");
      setStatusMsg("Saving note…");
      try {
        const note = await addSessionNote(patientId, text.trim());
        setNotes((prev) => [...prev, note]);
        setText("");
        setNoteStatus("saved");
        setStatusMsg("Note saved");
        setTimeout(() => {
          setNoteStatus("idle");
          setStatusMsg("");
        }, 2000);
      } catch (e) {
        setNoteStatus("error");
        setStatusMsg(e instanceof Error ? e.message : "Failed to save note");
      }
    },
    [patientId, text],
  );

  if (!patientId) {
    return (
      <div className="triage-card">
        <div className="triage-card__header">
          <div className="triage-card__label">
            <StickyNote size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            Session Notes
          </div>
        </div>
        <div className="triage-card__body">
          <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)" }}>
            Save a session to add manual notes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="triage-card">
      <div className="triage-card__header">
        <div className="triage-card__label">
          <StickyNote size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          Session Notes
        </div>
        {notes.length > 0 && (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
            {notes.length}
          </span>
        )}
      </div>
      <div className="triage-card__body">
        {/* Status bar */}
        {statusMsg && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: "var(--space-2)",
              fontSize: "var(--text-xs)", marginBottom: "var(--space-3)",
              color: noteStatus === "error" ? "var(--color-danger)"
                : noteStatus === "saved" ? "var(--color-success)"
                : "var(--color-text-tertiary)",
            }}
          >
            {noteStatus === "loading-notes" || noteStatus === "saving"
              ? <Loader2 size={12} className="spin" />
              : noteStatus === "saved"
              ? <CheckCircle2 size={12} />
              : noteStatus === "error"
              ? <AlertCircle size={12} />
              : null}
            {statusMsg}
            {noteStatus === "error" && (
              <button className="icon-btn" onClick={loadNotes} title="Retry" style={{ marginLeft: "auto" }}>
                <RefreshCw size={12} />
              </button>
            )}
          </div>
        )}

        {notes.length > 0 && (
          <div className="list-items" style={{ marginBottom: "var(--space-3)", maxHeight: 160, overflowY: "auto" }}>
            {notes.map((n) => (
              <div key={n.id} className="list-item">
                <div className="list-item__dot" style={{ background: "var(--color-info)" }} />
                <div className="list-item__content">
                  <div>{n.text}</div>
                  <div className="list-item__meta">
                    {n.created_by ?? "unknown"} • {new Date(n.created_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-2)" }}>
          <input
            className="toolbar__input"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a note…"
            style={{ flex: 1 }}
          />
          <button
            className="toolbar-btn toolbar-btn--accent toolbar-btn--sm"
            type="submit"
            disabled={noteStatus === "saving" || !text.trim()}
          >
            {noteStatus === "saving" ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
          </button>
        </form>
      </div>
    </div>
  );
};
