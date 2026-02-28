import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CopilotInsight,
  SessionStatus,
  TranscriptSegment,
  TriageRecord,
  WSMessage,
} from "../types";

interface UseTriageSessionReturn {
  /** Current session status */
  status: SessionStatus;
  /** Active session ID from server */
  sessionId: string | null;
  /** Ordered transcript segments */
  transcript: TranscriptSegment[];
  /** Latest triage record */
  triageRecord: TriageRecord | null;
  /** AI Copilot insights accumulated during the session */
  copilotInsights: CopilotInsight[];
  /** Last error message */
  error: string | null;
  /** Start a new triage session */
  startSession: () => void;
  /** End the current session */
  endSession: () => void;
  /** Send a text message in lieu of audio */
  sendText: (text: string) => void;
  /** Send raw audio data (base64 encoded) */
  sendAudio: (base64Audio: string) => void;
}

let segmentCounter = 0;

export function useTriageSession(): UseTriageSessionReturn {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [triageRecord, setTriageRecord] = useState<TriageRecord | null>(null);
  const [copilotInsights, setCopilotInsights] = useState<CopilotInsight[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Tear down on unmount.
  useEffect(() => cleanup, [cleanup]);

  const handleMessage = useCallback((ev: MessageEvent) => {
    let msg: WSMessage;
    try {
      msg = JSON.parse(ev.data as string) as WSMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "session_started":
        setSessionId(msg.session_id);
        setStatus("active");
        setError(null);
        break;

      case "transcript_update": {
        const text = (msg.payload.text as string) ?? "";
        const isPartial = (msg.payload.is_partial as boolean) ?? false;

        setTranscript((prev) => {
          // If the last segment was partial, always replace it
          // (whether the new one is partial or final).
          if (prev.length > 0 && prev[prev.length - 1]?.isPartial) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1]!,
              text,
              isPartial,
              timestamp: Date.now(),
            };
            return updated;
          }

          return [
            ...prev,
            {
              id: `seg-${++segmentCounter}`,
              text,
              isPartial,
              timestamp: Date.now(),
            },
          ];
        });
        break;
      }

      case "triage_update":
        setTriageRecord(msg.payload as unknown as TriageRecord);
        break;

      case "copilot_insight":
        setCopilotInsights((prev) => [
          ...prev,
          { ...(msg.payload as unknown as CopilotInsight), timestamp: Date.now() },
        ]);
        break;

      case "session_ended":
        setStatus("idle");
        if (msg.payload && Object.keys(msg.payload).length > 0) {
          setTriageRecord(msg.payload as unknown as TriageRecord);
        }
        cleanup();
        break;

      case "error":
        setError((msg.payload.detail as string) ?? "Unknown error");
        break;

      case "pong":
        break;

      default:
        break;
    }
  }, [cleanup]);

  const startSession = useCallback(() => {
    if (status !== "idle") return;

    setStatus("connecting");
    setTranscript([]);
    setTriageRecord(null);
    setCopilotInsights([]);
    setError(null);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/triage`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "session_start", payload: {} }));

      // Keep-alive ping every 25 s.
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25_000);
    };

    ws.onmessage = handleMessage;

    ws.onerror = () => {
      setError("WebSocket connection error");
      setStatus("idle");
      cleanup();
    };

    ws.onclose = () => {
      if (status !== "idle") {
        setStatus("idle");
      }
    };
  }, [status, handleMessage, cleanup]);

  const endSession = useCallback(() => {
    if (!wsRef.current || status !== "active") return;
    setStatus("ending");
    wsRef.current.send(JSON.stringify({ type: "session_end" }));
  }, [status]);

  const sendText = useCallback(
    (text: string) => {
      if (!wsRef.current || status !== "active") return;
      wsRef.current.send(
        JSON.stringify({ type: "text_input", payload: { text } }),
      );
    },
    [status],
  );

  const sendAudio = useCallback(
    (base64Audio: string) => {
      if (!wsRef.current || status !== "active") return;
      wsRef.current.send(
        JSON.stringify({
          type: "audio_chunk",
          payload: { audio_data: base64Audio },
        }),
      );
    },
    [status],
  );

  return {
    status,
    sessionId,
    transcript,
    triageRecord,
    copilotInsights,
    error,
    startSession,
    endSession,
    sendText,
    sendAudio,
  };
}
