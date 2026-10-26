import asyncio
import numpy as np
from app.services.audio_buffer import AudioBuffer
from app.services.transcription import TranscriptionService
from app.services.question_detector import QuestionDetector
from app.services.answer_generator import HuggingFaceAnswerGenerator

async def test_components():
    print("--- 1. Testing AudioBuffer ---")
    buf = AudioBuffer()
    # 3 seconds of 440Hz sine wave (16kHz PCM16)
    t = np.linspace(0, 3, 3 * 16000, endpoint=False)
    sig = (0.2 * np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16).tobytes()
    buf.add_chunk(sig)
    print(f"Buffer duration: {buf.duration_seconds:.2f}s")
    window = buf.get_audio_window(max_seconds=5.0)
    print(f"Extracted window samples: {len(window)}, dtype: {window.dtype}, max: {window.max():.3f}")

    print("\n--- 2. Testing QuestionDetector ---")
    qd = QuestionDetector()
    q1 = "Can you explain how state management works in React and Redux?"
    res = qd.evaluate(q1, silence_duration=1.0, text_stable_seconds=1.2)
    print(f"Question evaluated: '{res}'")
    assert res is not None, "Question should be detected!"

    print("\n--- 3. Testing AnswerGenerator Streaming ---")
    ag = HuggingFaceAnswerGenerator()
    tokens = []
    async for tok in ag.stream_answer(question=q1, resume="React dev 5 yrs", job_description="Frontend dev"):
        tokens.append(tok)
    full_answer = "".join(tokens)
    print(f"Streamed tokens count: {len(tokens)}")
    print(f"Answer snippet: {full_answer[:150]}...")
    assert len(tokens) > 5, "Answer should yield tokens!"

    print("\n--- 4. Testing TranscriptionService with Whisper ---")
    ts = TranscriptionService()
    ts.load_model()
    # Transcribe 1 sec of silence/sine
    txt = await ts.transcribe_audio_async(window[:16000])
    print(f"Transcribed test sine: '{txt}'")

    print("\nALL COMPONENT CHECKS PASSED!")

if __name__ == "__main__":
    asyncio.run(test_components())
