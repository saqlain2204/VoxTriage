import { useCallback, useState } from "react";

const TOKEN_KEY = "voxtriage_token";
const USER_KEY = "voxtriage_user";

export interface AuthState {
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Current username */
  user: string | null;
  /** Raw JWT token (for API headers) */
  token: string | null;
  /** Last login error */
  error: string | null;
  /** Login in progress */
  loading: boolean;
  /** Attempt login with username + password */
  login: (username: string, password: string) => Promise<boolean>;
  /** Register a new user */
  register: (username: string, password: string) => Promise<boolean>;
  /** Clear credentials and log out */
  logout: () => void;
}

/**
 * Manages JWT auth state with localStorage persistence.
 * Calls POST /api/v1/auth/login and stores the token.
 */
export function useAuth(): AuthState {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<string | null>(
    () => localStorage.getItem(USER_KEY),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Login failed" }));
        setError(body.detail ?? "Invalid credentials");
        return false;
      }

      const data: { token: string; username: string; role: string } =
        await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, data.username);
      setToken(data.token);
      setUser(data.username);
      return true;
    } catch {
      setError("Network error — is the server running?");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Registration failed" }));
        setError(body.detail ?? "Registration failed");
        return false;
      }

      const data: { token: string; username: string; role: string } =
        await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, data.username);
      setToken(data.token);
      setUser(data.username);
      return true;
    } catch {
      setError("Network error — is the server running?");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  return {
    isAuthenticated: !!token,
    user,
    token,
    register,
    error,
    loading,
    login,
    logout,
  };
}
