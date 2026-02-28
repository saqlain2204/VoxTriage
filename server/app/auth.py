"""Simple JWT-based authentication.

For now uses a single hardcoded user (admin/admin).
Replace with a proper user store when ready.
"""

import hashlib
import hmac
import json
import time
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

# ── Hardcoded user store (replace later) ──────────────────────

_USERS: dict[str, dict] = {
    "admin": {
        "username": "admin",
        "password_hash": hashlib.sha256("admin".encode()).hexdigest(),
        "role": "admin",
    }
}

_JWT_ALGORITHM = "HS256"
_JWT_EXPIRY_SEC = 86400  # 24 hours


def _get_secret() -> str:
    """Derive signing secret from the Mistral API key (always present)."""
    settings = get_settings()
    return hashlib.sha256(
        f"voxtriage-jwt-{settings.mistral_api_key}".encode()
    ).hexdigest()


# ── Minimal JWT implementation (no pyjwt dependency) ──────────


def _b64url_encode(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    import base64

    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)


def _create_token(payload: dict, secret: str) -> str:
    header = {"alg": _JWT_ALGORITHM, "typ": "JWT"}
    h = _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    p = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = hmac.new(
        secret.encode(), f"{h}.{p}".encode(), hashlib.sha256
    ).digest()
    s = _b64url_encode(signature)
    return f"{h}.{p}.{s}"


def _verify_token(token: str, secret: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        h, p, s = parts
        expected_sig = hmac.new(
            secret.encode(), f"{h}.{p}".encode(), hashlib.sha256
        ).digest()
        actual_sig = _b64url_decode(s)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(_b64url_decode(p))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


# ── Public API ────────────────────────────────────────────────


def register_user(username: str, password: str, role: str = "user") -> Optional[str]:
    """Create a new user and return a JWT token, or None if username taken."""
    if username in _USERS:
        return None
    _USERS[username] = {
        "username": username,
        "password_hash": hashlib.sha256(password.encode()).hexdigest(),
        "role": role,
    }
    logger.info("user_registered", username=username, role=role)
    # Auto-login after registration
    return authenticate_user(username, password)


def authenticate_user(username: str, password: str) -> Optional[str]:
    """Validate credentials and return a JWT token, or None."""
    user = _USERS.get(username)
    if not user:
        return None
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    if not hmac.compare_digest(user["password_hash"], password_hash):
        return None

    secret = _get_secret()
    payload = {
        "sub": username,
        "role": user["role"],
        "iat": int(time.time()),
        "exp": int(time.time()) + _JWT_EXPIRY_SEC,
    }
    token = _create_token(payload, secret)
    logger.info("user_authenticated", username=username)
    return token


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token."""
    return _verify_token(token, _get_secret())


# ── FastAPI dependency ────────────────────────────────────────

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict:
    """FastAPI dependency that extracts and verifies the current user from the
    Authorization header.  Returns the token payload dict."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return payload
