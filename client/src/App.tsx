import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { RecordControls, ChatBox } from "./components/RecordControls";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { TriageSidebar } from "./components/TriageSidebar";
import { Dashboard } from "./components/Dashboard";
import { LoginPage } from "./components/LoginPage";
import { VitalsAlerts } from "./components/VitalsAlerts";
import { TreatmentPanel } from "./components/TreatmentPanel";
import { VisionPanel } from "./components/VisionPanel";
import { SessionNotes } from "./components/SessionNotes";
import { CopilotPanel } from "./components/CopilotPanel";
import { StatusToast } from "./components/StatusToast";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { useTriageSession } from "./hooks/useTriageSession";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { usePatientStore } from "./hooks/usePatientStore";
import { useAuth } from "./hooks/useAuth";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import { LayoutDashboard, Radio, Camera, Stethoscope, StickyNote, BotMessageSquare } from "lucide-react";
import type { TriageRecord } from "./types";
import "./styles/components.css";
import "./styles/dashboard.css";

type View = "session" | "dashboard";
type SessionPanel = "triage" | "treatment" | "vision" | "notes" | "copilot";

export function App() {
  const auth = useAuth();

  /* ── Gate: show login if not authenticated ── */
  if (!auth.isAuthenticated) {
    return (
      <LoginPage
        onLogin={auth.login}
        onRegister={auth.register}
        error={auth.error}
        loading={auth.loading}
      />
    );
  }

  return <AuthenticatedApp onLogout={auth.logout} user={auth.user} />;
}

/* ── Main application (only rendered when logged in) ── */

function AuthenticatedApp({
  onLogout,
  user,
}: {
  onLogout: () => void;
  user: string | null;
}) {
  const [view, setView] = useState<View>("session");
  const [sessionPanel, setSessionPanel] = useState<SessionPanel>("triage");
  const [language, setLanguage] = useState("en");
  const { theme, toggle: toggleTheme } = useTheme();
  const { toasts, addToast, removeToast, updateToast } = useToast();

  const {
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
  } = useTriageSession();

  const { save } = usePatientStore();

  /* Track the last saved patient id so sub-components can use it */
  const [lastSavedPatientId, setLastSavedPatientId] = useState<string | null>(null);

  /* ── Audio recording ── */
  const onChunk = useCallback(
    (base64: string) => sendAudio(base64),
    [sendAudio],
  );

  const { isRecording, start: startRecording, stop: stopRecording } =
    useAudioRecorder(onChunk);

  /* ── Browser speech recognition for live transcripts ── */
  const lastFinalRef = useRef("");
  const [interimText, setInterimText] = useState("");

  const onSpeechResult = useCallback(
    (text: string, isFinal: boolean) => {
      if (isFinal && text.trim()) {
        if (text.trim() !== lastFinalRef.current) {
          lastFinalRef.current = text.trim();
          sendText(text.trim());
        }
        setInterimText("");
      } else {
        setInterimText(text);
      }
    },
    [sendText],
  );

  const {
    isListening,
    start: startSpeech,
    stop: stopSpeech,
  } = useSpeechRecognition(onSpeechResult);

  /* ── Session handlers ── */
  const handleStartSession = useCallback(() => {
    addToast("info", "Starting triage session…");
    startSession();
  }, [startSession, addToast]);

  const handleEndSession = useCallback(() => {
    if (isRecording) stopRecording();
    if (isListening) stopSpeech();
    setInterimText("");
    addToast("loading", "Ending session & finalizing triage…");
    endSession();
  }, [isRecording, stopRecording, isListening, stopSpeech, endSession, addToast]);

  const handleStartRecording = useCallback(async () => {
    await startRecording();
    startSpeech();
  }, [startRecording, startSpeech]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    stopSpeech();
    setInterimText("");
  }, [stopRecording, stopSpeech]);

  /* ── Auto-save completed sessions to patient store ── */
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (
      prevStatusRef.current !== "idle" &&
      status === "idle" &&
      sessionId &&
      transcript.length > 0
    ) {
      const fullTranscript = transcript.map((s) => s.text).join(" ");
      const record: TriageRecord = triageRecord ?? {
        id: sessionId,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        priority: "unknown",
        chief_complaint: null,
        patient_info: {
          age: null,
          gender: null,
          weight_kg: null,
          known_allergies: [],
          known_conditions: [],
          medications: [],
        },
        vital_signs: {
          heart_rate: null,
          blood_pressure_systolic: null,
          blood_pressure_diastolic: null,
          respiratory_rate: null,
          spo2: null,
          temperature: null,
          gcs: null,
        },
        symptoms: [],
        interventions: [],
        mechanism_of_injury: null,
        scene_notes: null,
        ai_summary: fullTranscript,
        raw_transcript_snippet: fullTranscript.slice(0, 200),
        confidence_score: null,
      };
      const tid = addToast("loading", "Saving patient record…");
      save(sessionId, fullTranscript, record)
        .then((saved) => {
          if (saved) {
            setLastSavedPatientId(saved.id);
            updateToast(tid, "success", "Patient record saved to database");
          }
        })
        .catch(() => {
          updateToast(tid, "error", "Failed to save patient record");
        });
    }
    prevStatusRef.current = status;
  }, [status, triageRecord, sessionId, transcript, save, addToast, updateToast]);

  /* ── Show toast on session status changes ── */
  useEffect(() => {
    if (status === "active") {
      addToast("success", "Session connected — ready for input");
    }
  }, [status === "active"]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-layout">
      <Header
        status={status}
        sessionId={sessionId}
        user={user}
        onLogout={onLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      >
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${view === "session" ? "nav-tab--active" : ""}`}
            onClick={() => setView("session")}
          >
            <Radio size={14} />
            Session
          </button>
          <button
            className={`nav-tab ${view === "dashboard" ? "nav-tab--active" : ""}`}
            onClick={() => setView("dashboard")}
          >
            <LayoutDashboard size={14} />
            Dashboard
          </button>
        </nav>
      </Header>

      {error && (
        <div className="error-bar">
          {error}
        </div>
      )}

      {/* Keep both views mounted; hide the inactive one to preserve component state */}
      <main className="app-main app-main--session" style={{ display: view === "session" ? undefined : "none" }}>
          {/* Top: controls + transcript */}
          <div className="panel panel--primary">
            <RecordControls
              status={status}
              isRecording={isRecording}
              isListening={isListening}
              onStartSession={handleStartSession}
              onEndSession={handleEndSession}
              language={language}
              onLanguageChange={setLanguage}
            />
            <div className="panel__header">
              <span className="panel__title">Live Transcript</span>
              {transcript.length > 0 && (
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {transcript.length} segment{transcript.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="panel__body">
              <TranscriptPanel segments={transcript} interimText={interimText} />
            </div>
            {/* Chatbox pinned to bottom of transcript panel */}
            {status === "active" && (
              <ChatBox
                onSendText={sendText}
                isRecording={isRecording}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
              />
            )}
          </div>

          {/* Vitals alerts (shown when triage has vitals) */}
          {triageRecord?.vital_signs && (
            <VitalsAlerts vitals={triageRecord.vital_signs} />
          )}

          {/* Bottom: triage + AI panels */}
          <div className="panel panel--triage">
            {/* Sub-tabs for session panels */}
            <div className="panel__header">
              <nav className="session-panel-tabs">
                <button
                  className={`session-panel-tab ${sessionPanel === "triage" ? "session-panel-tab--active" : ""}`}
                  onClick={() => setSessionPanel("triage")}
                >
                  Triage Record
                </button>
                <button
                  className={`session-panel-tab ${sessionPanel === "treatment" ? "session-panel-tab--active" : ""}`}
                  onClick={() => setSessionPanel("treatment")}
                >
                  <Stethoscope size={12} /> Treatment
                </button>
                <button
                  className={`session-panel-tab ${sessionPanel === "vision" ? "session-panel-tab--active" : ""}`}
                  onClick={() => setSessionPanel("vision")}
                >
                  <Camera size={12} /> Vision AI
                </button>
                <button
                  className={`session-panel-tab ${sessionPanel === "notes" ? "session-panel-tab--active" : ""}`}
                  onClick={() => setSessionPanel("notes")}
                >
                  <StickyNote size={12} /> Notes
                </button>
                <button
                  className={`session-panel-tab ${sessionPanel === "copilot" ? "session-panel-tab--active" : ""}`}
                  onClick={() => setSessionPanel("copilot")}
                >
                  <BotMessageSquare size={12} /> Copilot
                  {copilotInsights.length > 0 && (
                    <span className="copilot-badge">{copilotInsights.length}</span>
                  )}
                </button>
              </nav>
            </div>
            <div className="panel__body">
              {/* Keep all panels mounted to preserve state; hide inactive ones */}
              <div style={{ display: sessionPanel === "triage" ? undefined : "none" }}>
                <TriageSidebar record={triageRecord} />
              </div>
              <div style={{ display: sessionPanel === "treatment" ? undefined : "none" }}>
                <TreatmentPanel
                  triage={triageRecord}
                  transcript={transcript.map((s) => s.text).join(" ")}
                />
              </div>
              <div style={{ display: sessionPanel === "vision" ? undefined : "none" }}>
                <VisionPanel
                  triage={triageRecord}
                  transcript={transcript.map((s) => s.text).join(" ")}
                />
              </div>
              <div style={{ display: sessionPanel === "notes" ? undefined : "none" }}>
                <SessionNotes patientId={lastSavedPatientId ?? sessionId ?? ""} />
              </div>
              <div style={{ display: sessionPanel === "copilot" ? undefined : "none" }}>
                <CopilotPanel insights={copilotInsights} />
              </div>
            </div>
          </div>
        </main>

        <main className="app-main app-main--dashboard" style={{ display: view === "dashboard" ? undefined : "none" }}>
          <Dashboard />
        </main>

      <StatusToast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
