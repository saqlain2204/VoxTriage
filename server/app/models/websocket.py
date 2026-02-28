from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class WSMessageType(str, Enum):
    """WebSocket message types for client-server communication."""

    # Client -> Server
    AUDIO_CHUNK = "audio_chunk"
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    PING = "ping"

    # Server -> Client
    TRANSCRIPT_UPDATE = "transcript_update"
    TRIAGE_UPDATE = "triage_update"
    COPILOT_INSIGHT = "copilot_insight"
    SESSION_STARTED = "session_started"
    SESSION_ENDED = "session_ended"
    ERROR = "error"
    PONG = "pong"


class WSMessage(BaseModel):
    """Standard WebSocket message envelope."""
    type: WSMessageType
    session_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payload: dict[str, Any] = Field(default_factory=dict)


class AudioChunkPayload(BaseModel):
    """Payload for incoming audio data."""
    audio_data: str  # base64-encoded audio bytes
    sample_rate: int = 16000
    channels: int = 1
    format: str = "pcm_s16le"


class TranscriptPayload(BaseModel):
    """Payload for transcript updates sent to client."""
    text: str
    is_partial: bool = False
    segment_id: Optional[str] = None


class SessionStartPayload(BaseModel):
    """Payload for session start requests."""
    incident_type: Optional[str] = None
    location: Optional[str] = None
    dispatcher_id: Optional[str] = None
