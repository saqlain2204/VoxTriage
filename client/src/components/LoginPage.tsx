import { Activity } from "lucide-react";
import { type FC, type FormEvent, useState } from "react";

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<boolean>;
  onRegister: (username: string, password: string) => Promise<boolean>;
  error: string | null;
  loading: boolean;
}

export const LoginPage: FC<LoginPageProps> = ({ onLogin, onRegister, error, loading }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    if (mode === "login") {
      await onLogin(username.trim(), password.trim());
    } else {
      await onRegister(username.trim(), password.trim());
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__logo">
          <Activity size={28} />
        </div>
        <div className="login-card__title">VoxTriage</div>
        <div className="login-card__subtitle">AI Paramedic Copilot</div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-field__label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="login-field__input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={mode === "login" ? "admin" : "Enter username"}
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-field__label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="login-field__input"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            className="login-btn"
            type="submit"
            disabled={loading || !username.trim() || !password.trim()}
          >
            {loading
              ? mode === "login" ? "Signing in…" : "Creating account…"
              : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="login-toggle">
          {mode === "login" ? (
            <span>
              New user?{" "}
              <button
                type="button"
                className="login-toggle__link"
                onClick={() => setMode("register")}
              >
                Create an account
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{" "}
              <button
                type="button"
                className="login-toggle__link"
                onClick={() => setMode("login")}
              >
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
