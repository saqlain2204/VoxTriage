import asyncio
import base64
import time
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine, Optional
from uuid import uuid4

from app.config import Settings
from app.logging_config import get_logger
from app.models.triage import TriageRecord
from app.models.websocket import WSMessage, WSMessageType
from app.services.mistral_service import MistralTriageService
from app.services.voxtral_service import VoxtralService

logger = get_logger(__name__)

# Type alias for transcript callback used by the engine
TranscriptCallback = Callable[[str, str, bool], Coroutine]
# Type alias for copilot insight callback
CopilotCallback = Callable[[str, dict], Coroutine]


class TriageSession:
    """Represents a single active triage session with its state."""

    def __init__(self, session_id: str, settings: Settings) -> None:
        self.session_id = session_id
        self.created_at = datetime.now(timezone.utc)
        self.last_activity = time.monotonic()
        self.transcript_buffer: list[str] = []
        self.full_transcript: list[str] = []
        self.current_record: Optional[TriageRecord] = None
        self.voxtral: VoxtralService = VoxtralService(settings)
        self._extraction_lock = asyncio.Lock()
        self._active = False

    @property
    def is_active(self) -> bool:
        return self._active

    @property
    def buffered_transcript(self) -> str:
        return " ".join(self.transcript_buffer)

    @property
    def complete_transcript(self) -> str:
        return " ".join(self.full_transcript)

    def append_transcript(self, text: str) -> None:
        """Append new transcript text to buffers."""
        if text and text.strip():
            self.transcript_buffer.append(text.strip())
            self.full_transcript.append(text.strip())
            self.last_activity = time.monotonic()

    def flush_buffer(self) -> str:
        """Return and clear the transcript buffer."""
        content = self.buffered_transcript
        self.transcript_buffer.clear()
        return content


class TriageEngine:
    """Orchestrates VoxtralService and MistralTriageService for real-time triage.

    Manages sessions, coordinates audio ingestion with transcript extraction,
    and triggers periodic triage analysis via Mistral Large.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._mistral = MistralTriageService(settings)
        self._sessions: dict[str, TriageSession] = {}
        self._extraction_tasks: dict[str, asyncio.Task] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    @property
    def active_session_count(self) -> int:
        return sum(1 for s in self._sessions.values() if s.is_active)

    def get_session(self, session_id: str) -> Optional[TriageSession]:
        return self._sessions.get(session_id)

    def get_all_sessions(self) -> dict[str, dict[str, Any]]:
        """Return metadata for all sessions."""
        result = {}
        for sid, session in self._sessions.items():
            result[sid] = {
                "session_id": sid,
                "created_at": session.created_at.isoformat(),
                "is_active": session.is_active,
                "transcript_length": len(session.complete_transcript),
                "has_triage_record": session.current_record is not None,
                "priority": (
                    session.current_record.priority.value
                    if session.current_record
                    else None
                ),
            }
        return result

    async def start_session(
        self,
        on_transcript: TranscriptCallback,
        on_triage_update: Callable[[str, TriageRecord], Coroutine],
        on_copilot_insight: Optional[CopilotCallback] = None,
    ) -> str:
        """Create and start a new triage session.

        Args:
            on_transcript: Callback(session_id, text, is_partial) for transcript updates.
            on_triage_update: Callback(session_id, record) for triage record updates.
            on_copilot_insight: Callback(session_id, insight_dict) for copilot insights.

        Returns:
            The new session ID.
        """
        session_id = uuid4().hex[:16]
        session = TriageSession(session_id, self._settings)
        self._sessions[session_id] = session

        # Callback wired to the SDK stream — receives (text, is_final)
        async def _voxtral_cb(text: str, is_final: bool) -> None:
            if is_final and text.strip():
                # Commit completed segment to extraction buffer
                session.append_transcript(text.strip())
            # Forward every update (partial + final) to the WebSocket client
            try:
                await on_transcript(session_id, text, not is_final)
            except Exception:
                logger.exception(
                    "transcript_callback_error", session_id=session_id
                )

        try:
            await session.voxtral.start(session_id, _voxtral_cb)
            session._active = True
        except Exception:
            logger.exception("session_start_voxtral_failed", session_id=session_id)
            session._active = True  # Still allow text-based fallback

        # Start periodic extraction task
        periodic_task_id = f"{session_id}_periodic"
        self._extraction_tasks[periodic_task_id] = asyncio.create_task(
            self._periodic_extraction(session, on_triage_update, on_copilot_insight)
        )

        logger.info("session_started", session_id=session_id)
        return session_id

    async def end_session(self, session_id: str) -> Optional[TriageRecord]:
        """End a session and return the final triage record."""
        session = self._sessions.get(session_id)
        if not session:
            logger.warning("session_end_not_found", session_id=session_id)
            return None

        session._active = False

        # Cancel periodic extraction task (with timeout to avoid hanging)
        key = f"{session_id}_periodic"
        task = self._extraction_tasks.pop(key, None)
        if task and not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(
                    asyncio.shield(task), timeout=2.0
                )
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

        # Stop Voxtral realtime stream (has its own internal timeout)
        try:
            await asyncio.wait_for(session.voxtral.stop(), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning("voxtral_stop_timeout", session_id=session_id)

        # Final extraction pass only if there's unprocessed text in the buffer
        remaining = session.flush_buffer()
        if remaining and remaining.strip():
            try:
                record = await asyncio.wait_for(
                    self._mistral.extract_triage_data(
                        remaining, session_id, session.current_record
                    ),
                    timeout=15.0,
                )
                if record:
                    if session.current_record:
                        session.current_record.merge_update(record)
                    else:
                        session.current_record = record
            except asyncio.TimeoutError:
                logger.warning("final_extraction_timeout", session_id=session_id)

        # Clean up session from memory
        self._sessions.pop(session_id, None)

        logger.info(
            "session_ended",
            session_id=session_id,
            transcript_length=len(session.complete_transcript),
            has_record=session.current_record is not None,
        )
        return session.current_record

    async def ingest_audio(self, session_id: str, audio_base64: str) -> None:
        """Receive base64-encoded audio and forward to Voxtral."""
        session = self._sessions.get(session_id)
        if not session or not session.is_active:
            return

        try:
            audio_bytes = base64.b64decode(audio_base64)
            await session.voxtral.send_audio_chunk(audio_bytes)
            session.last_activity = time.monotonic()
        except Exception:
            logger.exception("audio_ingest_failed", session_id=session_id)

    async def ingest_text(
        self,
        session_id: str,
        text: str,
        on_triage_update: Callable[[str, TriageRecord], Coroutine],
        on_copilot_insight: Optional[CopilotCallback] = None,
    ) -> None:
        """Accept raw text input (fallback when audio is not used)."""
        session = self._sessions.get(session_id)
        if not session:
            return

        session.append_transcript(text)

        # Trigger extraction for any meaningful input
        if len(session.buffered_transcript) > 15:
            await self._trigger_extraction(session, on_triage_update, on_copilot_insight)

    async def _periodic_extraction(
        self,
        session: TriageSession,
        on_triage_update: Callable[[str, TriageRecord], Coroutine],
        on_copilot_insight: Optional[CopilotCallback] = None,
    ) -> None:
        """Periodically trigger triage extraction from accumulated transcript."""
        interval = self._settings.triage_extraction_interval_sec

        try:
            while session.is_active:
                await asyncio.sleep(interval)

                if not session.is_active:
                    break

                if session.transcript_buffer:
                    await self._trigger_extraction(session, on_triage_update, on_copilot_insight)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "periodic_extraction_error", session_id=session.session_id
            )

    async def _trigger_extraction(
        self,
        session: TriageSession,
        on_triage_update: Callable[[str, TriageRecord], Coroutine],
        on_copilot_insight: Optional[CopilotCallback] = None,
    ) -> None:
        """Run triage extraction and notify via callback."""
        async with session._extraction_lock:
            transcript_chunk = session.flush_buffer()
            if not transcript_chunk:
                return

            record = await self._mistral.extract_triage_data(
                transcript_chunk, session.session_id, session.current_record
            )

            if not record:
                return

            if session.current_record:
                session.current_record.merge_update(record)
            else:
                session.current_record = record

            try:
                await on_triage_update(session.session_id, session.current_record)
            except Exception:
                logger.exception(
                    "triage_update_callback_error",
                    session_id=session.session_id,
                )

            # Fire copilot insight generation as background task (non-blocking)
            if on_copilot_insight and session.current_record and session.is_active:
                asyncio.create_task(
                    self._generate_copilot(
                        session, transcript_chunk, on_copilot_insight
                    )
                )

    async def _generate_copilot(
        self,
        session: TriageSession,
        latest_transcript: str,
        on_copilot_insight: CopilotCallback,
    ) -> None:
        """Generate and deliver copilot insight (runs as background task)."""
        try:
            insight = await self._mistral.generate_copilot_insight(
                session.current_record, latest_transcript
            )
            if insight and session.is_active:
                # Only send if there's meaningful content
                has_content = (
                    insight.get("alerts")
                    or insight.get("follow_up_questions")
                    or insight.get("suggestions")
                )
                if has_content:
                    await on_copilot_insight(session.session_id, insight)
        except Exception:
            logger.exception(
                "copilot_generation_error", session_id=session.session_id
            )

    async def start_cleanup_loop(self) -> None:
        """Background task to clean up expired sessions."""
        timeout = self._settings.session_timeout_sec
        try:
            while True:
                await asyncio.sleep(60)
                now = time.monotonic()
                expired = [
                    sid
                    for sid, s in self._sessions.items()
                    if s.is_active and (now - s.last_activity) > timeout
                ]
                for sid in expired:
                    logger.info("session_expired", session_id=sid)
                    await self.end_session(sid)
        except asyncio.CancelledError:
            raise

    async def shutdown(self) -> None:
        """Gracefully shut down all sessions and tasks."""
        logger.info("engine_shutdown_initiated", active_sessions=self.active_session_count)
        session_ids = list(self._sessions.keys())
        for sid in session_ids:
            await self.end_session(sid)
        logger.info("engine_shutdown_complete")
