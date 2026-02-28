import { Activity, LogOut, Sun, Moon } from "lucide-react";
import type { FC, ReactNode } from "react";
import type { SessionStatus, Theme } from "../types";

interface HeaderProps {
  status: SessionStatus;
  sessionId: string | null;
  children?: ReactNode;
  user?: string | null;
  onLogout?: () => void;
  theme?: Theme;
  onToggleTheme?: () => void;
}

export const Header: FC<HeaderProps> = ({ status, sessionId, children, user, onLogout, theme, onToggleTheme }) => {
  const statusLabel: Record<SessionStatus, string> = {
    idle: "Ready",
    connecting: "Connecting…",
    active: "Live Session",
    ending: "Ending…",
  };

  const dotClass =
    status === "active"
      ? "status-dot status-dot--recording"
      : status === "connecting"
        ? "status-dot status-dot--connected"
        : "status-dot status-dot--disconnected";

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <div className="app-header__logo">
          <Activity size={18} />
        </div>
        <div>
          <div className="app-header__title">VoxTriage</div>
          <div className="app-header__subtitle">AI Paramedic Copilot</div>
        </div>
      </div>
      {children}
      <div className="app-header__status">
        {sessionId && status === "active" && (
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--color-text-tertiary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {sessionId}
          </span>
        )}
        <div className="connection-badge">
          <span className={dotClass} />
          {statusLabel[status]}
        </div>
        {onToggleTheme && (
          <button className="icon-btn" onClick={onToggleTheme} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        )}
        {user && (
          <>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
              {user}
            </span>
            <button className="icon-btn" onClick={onLogout} title="Sign out">
              <LogOut size={14} />
            </button>
          </>
        )}
      </div>
    </header>
  );
};
