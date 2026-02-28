import { type FC, useEffect, useRef } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  Info,
  HelpCircle,
  Lightbulb,
  Brain,
  BotMessageSquare,
} from "lucide-react";
import type { CopilotAlert, CopilotInsight } from "../types";

interface Props {
  insights: CopilotInsight[];
}

/* ── severity helpers ── */

const SEVERITY_ICON: Record<CopilotAlert["severity"], FC<{ size?: number }>> = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_CLASS: Record<CopilotAlert["severity"], string> = {
  critical: "copilot-alert--critical",
  warning: "copilot-alert--warning",
  info: "copilot-alert--info",
};

/* ── Single insight card ── */

const InsightCard: FC<{ insight: CopilotInsight; index: number }> = ({
  insight,
  index,
}) => {
  const hasAlerts = insight.alerts.length > 0;
  const hasQuestions = insight.follow_up_questions.length > 0;
  const hasSuggestions = insight.suggestions.length > 0;
  const hasReasoning = insight.clinical_reasoning.trim().length > 0;

  const ts = insight.timestamp
    ? new Date(insight.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div className="copilot-card" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="copilot-card__header">
        <BotMessageSquare size={16} />
        <span className="copilot-card__title">Copilot Insight #{index + 1}</span>
        {ts && <span className="copilot-card__time">{ts}</span>}
      </div>

      {/* ── Alerts ── */}
      {hasAlerts && (
        <div className="copilot-section">
          <h4 className="copilot-section__heading">
            <AlertTriangle size={14} /> Alerts
          </h4>
          <ul className="copilot-alert-list">
            {insight.alerts.map((a, i) => {
              const Icon = SEVERITY_ICON[a.severity];
              return (
                <li key={i} className={`copilot-alert ${SEVERITY_CLASS[a.severity]}`}>
                  <Icon size={14} />
                  <span>{a.message}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Follow-up Questions ── */}
      {hasQuestions && (
        <div className="copilot-section">
          <h4 className="copilot-section__heading">
            <HelpCircle size={14} /> Follow-up Questions
          </h4>
          <ul className="copilot-question-list">
            {insight.follow_up_questions.map((q, i) => (
              <li key={i} className="copilot-question">
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Suggestions ── */}
      {hasSuggestions && (
        <div className="copilot-section">
          <h4 className="copilot-section__heading">
            <Lightbulb size={14} /> Suggestions
          </h4>
          <ul className="copilot-suggestion-list">
            {insight.suggestions.map((s, i) => (
              <li key={i} className="copilot-suggestion">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Clinical Reasoning ── */}
      {hasReasoning && (
        <div className="copilot-section">
          <h4 className="copilot-section__heading">
            <Brain size={14} /> Clinical Reasoning
          </h4>
          <p className="copilot-reasoning">{insight.clinical_reasoning}</p>
        </div>
      )}
    </div>
  );
};

/* ── Main panel ── */

export const CopilotPanel: FC<Props> = ({ insights }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  /* auto-scroll to latest insight */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [insights.length]);

  if (insights.length === 0) {
    return (
      <div className="copilot-empty">
        <BotMessageSquare size={32} />
        <p>AI Copilot insights will appear here as the session progresses.</p>
        <span className="copilot-empty__hint">
          The copilot analyzes each triage update and proactively surfaces
          alerts, questions, and suggestions.
        </span>
      </div>
    );
  }

  return (
    <div className="copilot-panel">
      {insights.map((ins, i) => (
        <InsightCard key={ins.timestamp ?? i} insight={ins} index={i} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
