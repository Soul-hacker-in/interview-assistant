import asyncio
import numpy as np
import pytest
from app.services.audio_buffer import AudioBuffer
from app.services.question_detector import QuestionDetector
from app.services.answer_generator import HuggingFaceAnswerGenerator
from app.schemas.events import (
    StartMessage,
    StatusEvent,
    QuestionDetectedEvent,
    AnswerCompleteEvent,
    AnswerMetrics,
)


def test_audio_buffer_duration_and_samples():
    """Verify AudioBuffer accurately computes audio duration and sample counts."""
    buf = AudioBuffer()
    # 2 seconds of 16kHz PCM16 audio (64,000 bytes)
    sample_rate = 16000
    duration_secs = 2
    samples = np.zeros(sample_rate * duration_secs, dtype=np.int16)
    buf.add_chunk(samples.tobytes())

    assert buf.duration_seconds == pytest.approx(2.0, abs=0.01)
    assert buf.total_samples_received == sample_rate * duration_secs


def test_audio_buffer_energy_detection():
    """Verify AudioBuffer energy gating distinguishes speech from silence."""
    buf = AudioBuffer(silence_threshold_rms=0.02)

    # 1. Add 1 second of silence
    silence = np.zeros(16000, dtype=np.int16).tobytes()
    buf.add_chunk(silence)
    # Window with require_speech_energy=True should reject pure silence
    assert buf.get_audio_window(max_seconds=5.0, require_speech_energy=True) is None

    # 2. Add 1 second of loud sine wave
    t = np.linspace(0, 1, 16000, endpoint=False)
    tone = (0.5 * np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16).tobytes()
    buf.add_chunk(tone)

    window = buf.get_audio_window(max_seconds=5.0, require_speech_energy=True)
    assert window is not None
    assert len(window) > 0
    assert window.max() > 0.1


def test_question_detector_identifies_interrogative():
    """Verify QuestionDetector triggers on standard 5W1H and interview prompts."""
    qd = QuestionDetector()
    q = "What is the difference between state and props in React?"
    detected = qd.evaluate(q, silence_duration=1.0, text_stable_seconds=1.0)
    assert detected is not None
    assert "difference between state and props" in detected.lower()


def test_question_detector_rejects_filler():
    """Verify QuestionDetector filters out conversational filler and affirmations."""
    qd = QuestionDetector()
    fillers = [
        "okay, okay, okay",
        "yeah, got it, sure",
        "cool, awesome",
        "um uh",
    ]
    for filler in fillers:
        detected = qd.evaluate(filler, silence_duration=1.0, text_stable_seconds=1.0)
        assert detected is None, f"Filler '{filler}' should not be detected as a question"


def test_question_detector_rejects_statements():
    """Verify non-interrogative assertions without question intent are rejected."""
    qd = QuestionDetector()
    statement = "We deployed the microservice to production last Tuesday."
    detected = qd.evaluate(statement, silence_duration=1.0, text_stable_seconds=1.0)
    assert detected is None, "Non-question declarative statement should be ignored"


def test_question_detector_deduplication():
    """Verify repeated questions within the sliding time window are deduplicated."""
    qd = QuestionDetector()
    q = "How does Redux Toolkit simplify state management in React applications?"

    first = qd.evaluate(q, silence_duration=1.0, text_stable_seconds=1.0)
    assert first is not None

    # Immediate second call with identical or near-identical question should be blocked
    second = qd.evaluate(q, silence_duration=1.0, text_stable_seconds=1.0)
    assert second is None, "Duplicate question within cache window should be rejected"


def test_answer_generator_grounded_fallback():
    """Verify fallback answer synthesis returns structured, speakable answer bullets."""
    ag = HuggingFaceAnswerGenerator()
    bullets = ag._generate_grounded_fallback(
        question="What is React and how does the virtual DOM work?",
        resume="Experienced React developer",
        job_description="Senior Frontend Engineer",
    )
    assert len(bullets) >= 2
    full_text = " ".join(bullets)
    assert any(term in full_text.lower() for term in ["react", "dom", "ui", "state"])



def test_event_schemas_validation():
    """Verify Pydantic models validate typed WebSocket event contracts."""
    start = StartMessage(resume="Senior Dev", jobDescription="Fullstack", answerMode="concise")
    assert start.type == "start"
    assert start.answerMode == "concise"

    status = StatusEvent(status="listening", message="Microphone active")
    assert status.status == "listening"

    q_event = QuestionDetectedEvent(question="Tell me about yourself.", timestamp=1700000000.0)
    assert q_event.type == "question_detected"

    complete = AnswerCompleteEvent(
        answer="I have 5 years of experience in distributed systems.",
        metrics=AnswerMetrics(ttft_ms=350.5, total_ms=1200.0, token_count=45),
        timestamp=1700000001.0,
    )
    assert complete.metrics.ttft_ms == 350.5
    assert complete.metrics.token_count == 45
