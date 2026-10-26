import time
import numpy as np
from typing import Optional, Tuple


class AudioBuffer:
    """
    Manages incoming streaming PCM16 audio bytes (16kHz, mono, 16-bit signed integer).
    Provides conversion to normalized float32 numpy arrays for faster-whisper,
    energy calculation (VAD heuristic), and sliding window extraction.
    """

    SAMPLE_RATE = 16000
    BYTES_PER_SAMPLE = 2  # 16-bit = 2 bytes

    def __init__(self, silence_threshold_rms: float = 0.02):
        self.silence_threshold_rms = silence_threshold_rms
        self._buffer = bytearray()
        self.last_speech_time: float = time.time()
        self.noise_floor: float = 0.008
        self.total_samples_received: int = 0
        self.last_processed_sample: int = 0

    def add_chunk(self, chunk: bytes) -> None:
        """Append incoming PCM16 audio bytes and track energy/speech timestamp."""
        self._buffer.extend(chunk)
        samples = len(chunk) // self.BYTES_PER_SAMPLE
        self.total_samples_received += samples

        # Check energy in the newly added chunk
        if len(chunk) >= 512:
            arr = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
            rms = float(np.sqrt(np.mean(arr ** 2)))
            # Adaptively track background ambient noise floor
            self.noise_floor = 0.95 * self.noise_floor + 0.05 * min(rms, 0.05)
            # Speech is detected when energy significantly exceeds ambient noise floor
            speech_threshold = max(self.silence_threshold_rms, self.noise_floor * 2.2)
            if rms > speech_threshold:
                self.last_speech_time = time.time()

    def get_silence_duration(self) -> float:
        """Returns seconds elapsed since speech energy was last observed."""
        return time.time() - self.last_speech_time

    def get_audio_window(self, max_seconds: float = 7.0, require_speech_energy: bool = True) -> Optional[np.ndarray]:
        """
        Returns recent audio as a float32 numpy array normalized to [-1.0, 1.0].
        If buffer is too small (<0.6s) or lacks active speech energy, returns None
        to avoid unnecessary inference and silence hallucinations.
        """
        max_bytes = int(max_seconds * self.SAMPLE_RATE * self.BYTES_PER_SAMPLE)
        min_bytes = int(0.6 * self.SAMPLE_RATE * self.BYTES_PER_SAMPLE)

        if len(self._buffer) < min_bytes:
            return None

        # Take last max_bytes
        window_bytes = self._buffer[-max_bytes:]
        usable_len = (len(window_bytes) // self.BYTES_PER_SAMPLE) * self.BYTES_PER_SAMPLE
        arr = np.frombuffer(window_bytes[:usable_len], dtype=np.int16).astype(np.float32) / 32768.0

        if require_speech_energy:
            window_rms = float(np.sqrt(np.mean(arr ** 2)))
            threshold = max(0.012, self.noise_floor * 1.6)
            if window_rms < threshold:
                return None

        return arr

    def clear(self) -> None:
        """Clear buffer and reset counters."""
        self._buffer.clear()
        self.last_speech_time = time.time()
        self.total_samples_received = 0
        self.last_processed_sample = 0

    @property
    def duration_seconds(self) -> float:
        """Current total duration buffered in seconds."""
        return (len(self._buffer) // self.BYTES_PER_SAMPLE) / self.SAMPLE_RATE
