"""Real-time audio transcription via the Mistral SDK realtime API."""

import asyncio
from typing import AsyncIterator, Callable, Coroutine, Optional

from mistralai import Mistral
from mistralai.extra.realtime import UnknownRealtimeEvent
from mistralai.models import (
    AudioFormat,
    RealtimeTranscriptionError,
    RealtimeTranscriptionSessionCreated,
    TranscriptionStreamDone,
    TranscriptionStreamTextDelta,
)

from app.config import Settings
from app.logging_config import get_logger

logger = get_logger(__name__)


class VoxtralService:
    """Streams audio to Mistral's Voxtral realtime transcription API
    using the official SDK and fires transcript callbacks."""

    def __init__(self, settings: Settings) -> None:
        self._client = Mistral(api_key=settings.mistral_api_key)
        self._model = settings.voxtral_model
        self._audio_format = AudioFormat(
            encoding="pcm_s16le",
            sample_rate=settings.audio_sample_rate,
        )
        self._audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._active = False
        self._task: Optional[asyncio.Task] = None
        self._session_id: Optional[str] = None

    @property
    def is_active(self) -> bool:
        return self._active

    # ── Audio feed ────────────────────────────────────────────

    async def _audio_stream(self) -> AsyncIterator[bytes]:
        """Async iterator that drains the internal audio queue."""
        while True:
            chunk = await self._audio_queue.get()
            if chunk is None:  # sentinel → stop
                break
            yield chunk

    async def send_audio_chunk(self, audio_bytes: bytes) -> None:
        """Enqueue raw PCM audio bytes for transcription."""
        if self._active:
            await self._audio_queue.put(audio_bytes)

    # ── Lifecycle ─────────────────────────────────────────────

    async def start(
        self,
        session_id: str,
        on_transcript: Callable[[str, bool], Coroutine],
    ) -> None:
        """Start streaming transcription in a background task.

        Args:
            session_id: Identifier for logging / correlation.
            on_transcript: ``async (text, is_final) -> None``
                * ``is_final=False`` — accumulated partial text (sent as
                  each delta arrives so the client can display it live).
                * ``is_final=True``  — the complete transcription segment
                  text, ready to be committed to the extraction buffer.
        """
        self._session_id = session_id
        self._active = True
        self._task = asyncio.create_task(self._run(on_transcript))
        logger.info("voxtral_started", session_id=session_id, model=self._model)

    async def stop(self) -> None:
        """Stop the transcription stream gracefully with a timeout."""
        self._active = False
        # Unblock the audio iterator with a sentinel
        try:
            self._audio_queue.put_nowait(None)
        except asyncio.QueueFull:
            pass
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await asyncio.wait_for(
                    asyncio.shield(self._task), timeout=3.0
                )
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
        self._task = None
        # Drain remaining queue items
        while not self._audio_queue.empty():
            try:
                self._audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        logger.info("voxtral_stopped", session_id=self._session_id)

    # ── Internal stream loop ──────────────────────────────────

    async def _run(
        self,
        on_transcript: Callable[[str, bool], Coroutine],
    ) -> None:
        """Consume audio → Voxtral SDK → fire transcript callbacks."""
        current_text = ""
        try:
            async for event in self._client.audio.realtime.transcribe_stream(
                audio_stream=self._audio_stream(),
                model=self._model,
                audio_format=self._audio_format,
            ):
                if not self._active:
                    break

                if isinstance(event, RealtimeTranscriptionSessionCreated):
                    logger.info(
                        "voxtral_session_created",
                        session_id=self._session_id,
                    )

                elif isinstance(event, TranscriptionStreamTextDelta):
                    if event.text:
                        current_text += event.text
                        # Send accumulated partial for live display
                        await on_transcript(current_text, False)

                elif isinstance(event, TranscriptionStreamDone):
                    if current_text.strip():
                        # Commit the completed segment
                        await on_transcript(current_text, True)
                    current_text = ""
                    logger.debug(
                        "voxtral_segment_done",
                        session_id=self._session_id,
                    )

                elif isinstance(event, RealtimeTranscriptionError):
                    logger.error(
                        "voxtral_transcription_error",
                        session_id=self._session_id,
                        error=str(event),
                    )

                elif isinstance(event, UnknownRealtimeEvent):
                    logger.warning(
                        "voxtral_unknown_event",
                        session_id=self._session_id,
                    )

        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "voxtral_stream_error", session_id=self._session_id
            )
        finally:
            self._active = False
