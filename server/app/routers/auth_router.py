"""Authentication router — login endpoint."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.auth import authenticate_user, register_user
from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
    role: str


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    """Authenticate with username + password and receive a JWT."""
    token = authenticate_user(body.username, body.password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return LoginResponse(token=token, username=body.username, role="user")


@router.post("/auth/register", response_model=LoginResponse)
async def register(body: RegisterRequest) -> LoginResponse:
    """Register a new user and receive a JWT."""
    if len(body.username.strip()) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters")
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    token = register_user(body.username.strip(), body.password)
    if not token:
        raise HTTPException(status_code=409, detail="Username already taken")

    return LoginResponse(token=token, username=body.username.strip(), role="user")
