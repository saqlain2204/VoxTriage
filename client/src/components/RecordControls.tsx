import { Mic, Square, Send, StopCircle, Globe } from "lucide-react";
import { type FC, useState, type FormEvent, useCallback, useRef, useEffect } from "react";
import type { SessionStatus } from "../types";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" },
];

interface RecordControlsProps {
  status: SessionStatus;
  isRecording: boolean;
  isListening?: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
  language?: string;
  onLanguageChange?: (lang: string) => void;
}

/* ── Top toolbar: session controls only ── */

export const RecordControls: FC<RecordControlsProps> = ({
  status,
  isRecording,
  isListening,
  onStartSession,
  onEndSession,
  language = "en",
  onLanguageChange,
}) => {
  return (
    <div className="toolbar">
      <div className="toolbar__group">
        {status === "idle" && (
          <button className="toolbar-btn toolbar-btn--accent" onClick={onStartSession}>
            <Mic size={16} />
            Start Session
          </button>
        )}

        {status === "connecting" && (
          <button className="toolbar-btn" disabled>
            Connecting…
          </button>
        )}

        {status === "ending" && (
          <button className="toolbar-btn" disabled>
            Ending…
          </button>
        )}

        {status === "active" && (
          <button className="toolbar-btn toolbar-btn--muted" onClick={onEndSession}>
            <StopCircle size={14} />
            End Session
          </button>
        )}

        {onLanguageChange && (
          <div className="toolbar__lang">
            <Globe size={14} />
            <select
              className="toolbar__lang-select"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              disabled={status === "active"}
              title="Transcription language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Status indicators */}
      <div className="toolbar__group">
        {isRecording && (
          <div className="audio-visualizer">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="audio-visualizer__bar" />
            ))}
          </div>
        )}
        {isListening && (
          <span className="listening-badge">
            <span className="status-dot status-dot--connected" />
            Listening
          </span>
        )}
      </div>
    </div>
  );
};

/* ── Bottom chatbox: full-width, auto-growing textarea + record button ── */

interface ChatBoxProps {
  onSendText: (text: string) => void;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export const ChatBox: FC<ChatBoxProps> = ({
  onSendText,
  isRecording,
  onStartRecording,
  onStopRecording,
}) => {
  const [textInput, setTextInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Auto-resize textarea to fit content */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [textInput]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = textInput.trim();
      if (!trimmed) return;
      onSendText(trimmed);
      setTextInput("");
    },
    [textInput, onSendText],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const trimmed = textInput.trim();
        if (!trimmed) return;
        onSendText(trimmed);
        setTextInput("");
      }
    },
    [textInput, onSendText],
  );

  return (
    <form className="chatbox" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="chatbox__textarea"
        value={textInput}
        onChange={(e) => setTextInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
        rows={1}
      />

      {/* Send button — visible when there's text */}
      {textInput.trim() && (
        <button className="chatbox__btn chatbox__btn--send" type="submit">
          <Send size={16} />
        </button>
      )}

      {/* Record / Stop toggle */}
      {!isRecording ? (
        <button
          className="chatbox__btn chatbox__btn--record"
          type="button"
          onClick={onStartRecording}
          title="Start recording"
        >
          <Mic size={18} />
        </button>
      ) : (
        <button
          className="chatbox__btn chatbox__btn--stop"
          type="button"
          onClick={onStopRecording}
          title="Stop recording"
        >
          <Square size={16} />
        </button>
      )}
    </form>
  );
};
