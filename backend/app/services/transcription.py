import os
import asyncio
import logging
from typing import Optional, List, Dict, Any
import numpy as np

logger = logging.getLogger("transcription_service")

class TranscriptionService:
    """
    Performs local Speech-to-Text inference using faster-whisper.
    Executes in a thread pool to avoid blocking the asyncio event loop.
    """

    def __init__(self, model_size: str = "base.en", device: str = "cpu", compute_type: str = "int8"):
        self.model_size = os.getenv("WHISPER_MODEL_SIZE", model_size)
        self.device = os.getenv("WHISPER_DEVICE", device)
        self.compute_type = os.getenv("WHISPER_COMPUTE_TYPE", compute_type)
        self._model = None
        self._is_loading = False

    def load_model(self) -> None:
        """Synchronously load Whisper model into memory."""
        if self._model is not None:
            return
        try:
            self._is_loading = True
            logger.info(f"Loading faster-whisper model: {self.model_size} ({self.device}, {self.compute_type})...")
            from faster_whisper import WhisperModel
            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
                download_root=os.path.join(os.path.expanduser("~"), ".cache", "whisper")
            )
            logger.info("faster-whisper model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load faster-whisper model: {e}")
            raise e
        finally:
            self._is_loading = False

    async def transcribe_audio_async(self, audio_data: np.ndarray) -> str:
        """
        Runs transcription on a normalized float32 numpy audio array in a worker thread.
        Returns combined text of all detected segments.
        """
        if self._model is None:
            await asyncio.to_thread(self.load_model)

        def _transcribe() -> str:
            try:
                segments, info = self._model.transcribe(
                    audio_data,
                    beam_size=1,
                    language="en",
                    vad_filter=False,
                    condition_on_previous_text=False,
                    temperature=0.0,
                    compression_ratio_threshold=2.4,
                    no_speech_threshold=0.5,
                )
                valid_texts = []
                for seg in segments:
                    # Ignore segments where Whisper confidence is low or detected as silence
                    if getattr(seg, "no_speech_prob", 0.0) > 0.5:
                        continue
                    text = seg.text.strip()
                    if text:
                        words = text.lower().split()
                        # Discard repetitive hallucination loops (e.g. 'Good job. Good job...' or '8-month-old...')
                        if len(words) >= 6:
                            unique_words = set(words)
                            if len(unique_words) <= 3:
                                continue
                            if len(words) >= 9:
                                trigrams = [" ".join(words[i:i+3]) for i in range(len(words)-2)]
                                if len(set(trigrams)) <= max(2, len(trigrams) // 4):
                                    continue
                        valid_texts.append(text)

                result_text = " ".join(valid_texts)
                if result_text:
                    logger.info(f"Transcribed audio: '{result_text}' (prob={info.language_probability:.2f})")
                return result_text
            except Exception as ex:
                logger.warning(f"Error during transcription step: {ex}")
                return ""

        return await asyncio.to_thread(_transcribe)
