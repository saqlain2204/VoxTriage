import { MessageSquare } from "lucide-react";
import { type FC, useEffect, useRef } from "react";
import type { TranscriptSegment } from "../types";

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  /** Live interim text from browser speech recognition */
  interimText?: string;
}

export const TranscriptPanel: FC<TranscriptPanelProps> = ({ segments, interimText }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interimText]);

  if (segments.length === 0 && !interimText) {
    return (
      <div className="transcript__empty">
        <MessageSquare className="transcript__empty-icon" />
        <div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>No transcript yet</div>
          <div style={{ fontSize: "var(--text-xs)" }}>
            Start a session and speak or type to begin
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="transcript">
      {segments.map((seg) => (
        <div
          key={seg.id}
          className={`transcript__segment ${seg.isPartial ? "transcript__segment--partial" : ""}`}
        >
          {seg.text}
        </div>
      ))}
      {interimText && (
        <div className="transcript__segment transcript__segment--partial">
          {interimText}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
};
