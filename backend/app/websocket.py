import json
import time
import asyncio
import logging
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from .schemas.events import (
    StatusEvent,
    TranscriptPartialEvent,
    TranscriptFinalEvent,
    QuestionDetectedEvent,
    AnswerChunkEvent,
    AnswerCompleteEvent,
    AnswerMetrics,
    ErrorEvent,
)
from .services import (
    AudioBuffer,
    TranscriptionService,
    QuestionDetector,
    HuggingFaceAnswerGenerator,
)

logger = logging.getLogger("interview_websocket")


class InterviewSession:
    def __init__(
        self,
        websocket: WebSocket,
        transcription_service: TranscriptionService,
        answer_generator: HuggingFaceAnswerGenerator,
    ):
        self.ws = websocket
        self.transcription_service = transcription_service
        self.answer_generator = answer_generator
        self.audio_buffer = AudioBuffer()
        self.question_detector = QuestionDetector()

        self.resume: str = ""
        self.job_description: str = ""
        self.answer_mode: str = "concise"

        self.is_active: bool = False
        self.accumulated_text: str = ""
        self.last_emitted_partial: str = ""
        self.last_text_change_time: float = 0.0
        self._processing_task: Optional[asyncio.Task] = None
        self._current_answer_task: Optional[asyncio.Task] = None
        self._is_generating_answer: bool = False

    async def send_event(self, event) -> None:
        """Helper to send pydantic event as JSON if client is connected."""
        try:
            if self.ws.client_state == WebSocketState.CONNECTED:
                await self.ws.send_text(event.model_dump_json())
        except Exception as e:
            logger.debug(f"Failed to send event {event.type}: {e}")

    async def start(self, resume: str, job_description: str, answer_mode: str) -> None:
        self.resume = resume
        self.job_description = job_description
        self.answer_mode = answer_mode
        self.is_active = True
        self.accumulated_text = ""
        self.last_emitted_partial = ""
        self.last_text_change_time = 0.0
        self.audio_buffer.clear()
        self.question_detector.reset()

        await self.send_event(StatusEvent(status="listening", message="Listening for interview questions..."))

        # Launch periodic transcription & detection worker
        if self._processing_task is None or self._processing_task.done():
            self._processing_task = asyncio.create_task(self._audio_processing_loop())

    async def handle_audio_chunk(self, data: bytes) -> None:
        if not self.is_active:
            return
        self.audio_buffer.add_chunk(data)

    async def stop(self) -> None:
        self.is_active = False
        if self._processing_task and not self._processing_task.done():
            self._processing_task.cancel()
            try:
                await self._processing_task
            except asyncio.CancelledError:
                pass
        self._processing_task = None

        if self._current_answer_task and not self._current_answer_task.done():
            self._current_answer_task.cancel()
            try:
                await self._current_answer_task
            except asyncio.CancelledError:
                pass
        self._current_answer_task = None

        self.audio_buffer.clear()
        if self.ws.client_state == WebSocketState.CONNECTED:
            await self.send_event(StatusEvent(status="stopped", message="Session ended."))

    async def _audio_processing_loop(self) -> None:
        """Periodic loop that transcribes audio windows and checks for completed questions."""
        logger.info("Started audio processing loop.")
        while self.is_active:
            await asyncio.sleep(0.4)

            audio_window = self.audio_buffer.get_audio_window(max_seconds=7.0)
            if audio_window is None or len(audio_window) == 0:
                continue

            # Run STT
            try:
                transcript = await self.transcription_service.transcribe_audio_async(audio_window)
            except Exception as e:
                logger.error(f"Error during STT: {e}")
                continue

            if not transcript or not transcript.strip():
                continue

            # Clean and update text
            new_text = transcript.strip()
            if new_text != self.last_emitted_partial:
                self.last_emitted_partial = new_text
                self.accumulated_text = new_text
                self.last_text_change_time = time.time()
                await self.send_event(TranscriptPartialEvent(
                    text=new_text,
                    timestamp=time.time()
                ))

            # Check for completed question via pause OR text stability
            silence_sec = self.audio_buffer.get_silence_duration()
            text_stable_sec = (time.time() - self.last_text_change_time) if (self.accumulated_text and self.last_text_change_time > 0) else 0.0
            detected_question = self.question_detector.evaluate(self.accumulated_text, silence_sec, text_stable_sec)

            if detected_question:
                await self._process_question(detected_question)

    async def _process_question(self, question: str, force: bool = False) -> None:
        """Triggered when an interview question is identified. Cancels any active answer task to respond immediately to new questions."""
        clean_q = question.strip()
        if not clean_q:
            return

        # If an answer task is currently active:
        if self._current_answer_task and not self._current_answer_task.done():
            # If candidate re-triggers exact duplicate of what's currently streaming, don't restart
            if not force and self.question_detector.is_duplicate_or_similar(clean_q, threshold=0.85):
                logger.info(f"Ignoring duplicate question during streaming: '{clean_q}'")
                return
            # User asked another question or forced! Cancel previous answer immediately.
            logger.info(f"Interrupting current answer for new question: '{clean_q}'")
            self._current_answer_task.cancel()
            try:
                await self._current_answer_task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.debug(f"Error cancelling previous answer task: {e}")

        # Check duplicate against recently finished answers unless forced
        if not force and self.question_detector.is_duplicate_or_similar(clean_q):
            logger.info(f"Ignoring duplicate/similar question: '{clean_q}'")
            return

        # Launch the answer streaming as a tracked asynchronous task
        self._current_answer_task = asyncio.create_task(self._stream_answer_flow(clean_q))

    async def _stream_answer_flow(self, clean_q: str) -> None:
        """Asynchronous stream flow for formulating and emitting answer tokens."""
        self._is_generating_answer = True
        self.question_detector.record_answered(clean_q)
        logger.info(f"Processing question: {clean_q}")
        now = time.time()

        # Emit finalized transcript & question detected
        await self.send_event(TranscriptFinalEvent(text=clean_q, timestamp=now))
        await self.send_event(QuestionDetectedEvent(question=clean_q, timestamp=now))
        await self.send_event(StatusEvent(status="thinking", message="Formulating response in <= 2s..."))

        # Generate answer with timing metrics
        start_time = time.time()
        ttft: Optional[float] = None
        accumulated_answer = ""
        token_count = 0

        try:
            await self.send_event(StatusEvent(status="answering", message="Streaming answer..."))

            async for token in self.answer_generator.stream_answer(
                question=clean_q,
                resume=self.resume,
                job_description=self.job_description,
                answer_mode=self.answer_mode
            ):
                if not self.is_active:
                    break

                if ttft is None:
                    ttft = (time.time() - start_time) * 1000.0  # ms

                accumulated_answer += token
                token_count += 1

                await self.send_event(AnswerChunkEvent(
                    text=accumulated_answer,
                    delta=token,
                    timestamp=time.time()
                ))

            total_duration_ms = (time.time() - start_time) * 1000.0
            if ttft is None:
                ttft = total_duration_ms

            await self.send_event(AnswerCompleteEvent(
                answer=accumulated_answer,
                metrics=AnswerMetrics(
                    ttft_ms=round(ttft, 1),
                    total_ms=round(total_duration_ms, 1),
                    token_count=token_count
                ),
                timestamp=time.time()
            ))
        except asyncio.CancelledError:
            logger.info(f"Answer stream cancelled for '{clean_q}' (new question asked).")
            raise
        except Exception as e:
            logger.error(f"Error generating answer: {e}")
            await self.send_event(ErrorEvent(message=f"Answer generation error: {str(e)}"))
        finally:
            self._is_generating_answer = False
            # Reset accumulated text so next question starts fresh
            self.accumulated_text = ""
            self.last_emitted_partial = ""
            self.audio_buffer.clear()
            if self.is_active:
                await self.send_event(StatusEvent(status="listening", message="Listening for next question..."))


async def handle_interview_websocket(
    websocket: WebSocket,
    transcription_service: TranscriptionService,
    answer_generator: HuggingFaceAnswerGenerator
):
    await websocket.accept()
    session = InterviewSession(websocket, transcription_service, answer_generator)
    logger.info("Interview WebSocket client connected.")

    try:
        while True:
            message = await websocket.receive()

            # Handle normal WebSocket disconnection cleanly
            if message.get("type") == "websocket.disconnect":
                logger.info("WebSocket disconnect message received.")
                break

            # Binary audio frame
            if "bytes" in message and message["bytes"] is not None:
                await session.handle_audio_chunk(message["bytes"])
                continue

            # Text / JSON control message
            if "text" in message and message["text"] is not None:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")

                    if msg_type == "start":
                        await session.start(
                            resume=payload.get("resume", ""),
                            job_description=payload.get("jobDescription", ""),
                            answer_mode=payload.get("answerMode", "concise")
                        )
                    elif msg_type == "stop":
                        await session.stop()
                    elif msg_type == "trigger_question":
                        custom_q = (payload.get("question") or session.accumulated_text or session.last_emitted_partial).strip()
                        force = payload.get("force", False)
                        if custom_q:
                            if force or session.question_detector.is_valid_interview_question(custom_q):
                                await session._process_question(custom_q, force=force)
                            else:
                                logger.info(f"Filtered out non-question/filler trigger: '{custom_q}'")
                    else:
                        logger.warning(f"Unknown message type: {msg_type}")
                except json.JSONDecodeError:
                    await session.send_event(ErrorEvent(message="Invalid JSON payload received."))
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    except Exception as e:
        logger.debug(f"WebSocket session closed: {e}")
    finally:
        await session.stop()
