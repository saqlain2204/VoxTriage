import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.logging_config import get_logger
from app.models.triage import TriageRecord
from app.models.websocket import WSMessage, WSMessageType
from app.services.triage_engine import TriageEngine

logger = get_logger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket connections mapped to triage sessions."""

    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}

    async def accept(self, websocket: WebSocket) -> None:
        await websocket.accept()

    def register(self, session_id: str, websocket: WebSocket) -> None:
        self._connections[session_id] = websocket

    def remove(self, session_id: str) -> None:
        self._connections.pop(session_id, None)

    def get(self, session_id: str) -> WebSocket | None:
        return self._connections.get(session_id)

    async def send_message(self, session_id: str, message: WSMessage) -> bool:
        """Send a WSMessage to the client associated with session_id."""
        ws = self._connections.get(session_id)
        if not ws:
            return False
        try:
            await ws.send_json(message.model_dump(mode="json"))
            return True
        except Exception:
            logger.exception("ws_send_failed", session_id=session_id)
            return False

    @property
    def connection_count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


def get_triage_engine() -> TriageEngine:
    """Retrieve the triage engine from the app state. Set during app startup."""
    from app.main import app_state

    return app_state["triage_engine"]


@router.websocket("/ws/triage")
async def triage_websocket(websocket: WebSocket) -> None:
    """Main WebSocket endpoint for real-time triage sessions.

    Protocol:
    1. Client connects and sends a `session_start` message.
    2. Server creates a session and responds with `session_started`.
    3. Client sends `audio_chunk` messages with base64-encoded audio.
    4. Server sends back `transcript_update` and `triage_update` messages.
    5. Client sends `session_end` to close the session.
    """
    await manager.accept(websocket)
    session_id = None
    engine = get_triage_engine()

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await _send_error(websocket, None, "Invalid JSON message")
                continue

            msg_type = data.get("type", "")

            if msg_type == WSMessageType.PING.value:
                await websocket.send_json(
                    WSMessage(
                        type=WSMessageType.PONG,
                        session_id=session_id,
                    ).model_dump(mode="json")
                )
                continue

            if msg_type == WSMessageType.SESSION_START.value:
                if session_id:
                    await _send_error(
                        websocket, session_id, "Session already active on this connection"
                    )
                    continue

                session_id = await engine.start_session(
                    on_transcript=_make_transcript_callback(),
                    on_triage_update=_make_triage_callback(),
                    on_copilot_insight=_make_copilot_callback(),
                )
                manager.register(session_id, websocket)

                await websocket.send_json(
                    WSMessage(
                        type=WSMessageType.SESSION_STARTED,
                        session_id=session_id,
                        payload={
                            "message": "Triage session started",
                            "incident_type": data.get("payload", {}).get("incident_type"),
                        },
                    ).model_dump(mode="json")
                )
                logger.info("ws_session_started", session_id=session_id)
                continue

            if not session_id:
                await _send_error(
                    websocket, None, "No active session. Send session_start first."
                )
                continue

            if msg_type == WSMessageType.AUDIO_CHUNK.value:
                payload = data.get("payload", {})
                audio_data = payload.get("audio_data", "")
                if audio_data:
                    await engine.ingest_audio(session_id, audio_data)
                continue

            if msg_type == "text_input":
                # Optional: accept direct text input for testing/fallback
                payload = data.get("payload", {})
                text = payload.get("text", "")
                if text:
                    await engine.ingest_text(
                        session_id, text, _make_triage_callback(),
                        on_copilot_insight=_make_copilot_callback(),
                    )
                    # Also send a transcript update back
                    await manager.send_message(
                        session_id,
                        WSMessage(
                            type=WSMessageType.TRANSCRIPT_UPDATE,
                            session_id=session_id,
                            payload={"text": text, "is_partial": False},
                        ),
                    )
                continue

            if msg_type == WSMessageType.SESSION_END.value:
                final_record = await engine.end_session(session_id)
                manager.remove(session_id)

                payload = {}
                if final_record:
                    payload = final_record.model_dump(mode="json")

                await websocket.send_json(
                    WSMessage(
                        type=WSMessageType.SESSION_ENDED,
                        session_id=session_id,
                        payload=payload,
                    ).model_dump(mode="json")
                )
                logger.info("ws_session_ended", session_id=session_id)
                session_id = None
                continue

            await _send_error(
                websocket, session_id, f"Unknown message type: {msg_type}"
            )

    except WebSocketDisconnect:
        logger.info("ws_client_disconnected", session_id=session_id)
    except Exception:
        logger.exception("ws_unexpected_error", session_id=session_id)
    finally:
        if session_id:
            await engine.end_session(session_id)
            manager.remove(session_id)


def _make_transcript_callback():
    """Create an async callback for transcript updates."""

    async def callback(session_id: str, text: str, is_partial: bool) -> None:
        await manager.send_message(
            session_id,
            WSMessage(
                type=WSMessageType.TRANSCRIPT_UPDATE,
                session_id=session_id,
                payload={"text": text, "is_partial": is_partial},
            ),
        )

    return callback


def _make_triage_callback():
    """Create an async callback for triage record updates."""

    async def callback(session_id: str, record: TriageRecord) -> None:
        await manager.send_message(
            session_id,
            WSMessage(
                type=WSMessageType.TRIAGE_UPDATE,
                session_id=session_id,
                payload=record.model_dump(mode="json"),
            ),
        )

    return callback


def _make_copilot_callback():
    """Create an async callback for copilot insight updates."""

    async def callback(session_id: str, insight: dict) -> None:
        await manager.send_message(
            session_id,
            WSMessage(
                type=WSMessageType.COPILOT_INSIGHT,
                session_id=session_id,
                payload=insight,
            ),
        )

    return callback


async def _send_error(websocket: WebSocket, session_id: str | None, detail: str) -> None:
    """Send an error message to the client."""
    await websocket.send_json(
        WSMessage(
            type=WSMessageType.ERROR,
            session_id=session_id,
            payload={"detail": detail},
        ).model_dump(mode="json")
    )
