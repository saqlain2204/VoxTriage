import base64
import io
import struct
from typing import Optional

from app.logging_config import get_logger

logger = get_logger(__name__)


def validate_pcm_audio(data: bytes, sample_rate: int = 16000, channels: int = 1) -> bool:
    """Validate that raw bytes look like valid PCM16 audio.

    PCM16 samples are 2 bytes each, so the data length must be even.
    """
    if not data:
        return False
    if len(data) % 2 != 0:
        return False
    return True


def audio_bytes_to_base64(audio_bytes: bytes) -> str:
    """Encode raw audio bytes to base64 string."""
    return base64.b64encode(audio_bytes).decode("utf-8")


def base64_to_audio_bytes(b64_string: str) -> bytes:
    """Decode base64 string to raw audio bytes."""
    return base64.b64decode(b64_string)


def calculate_duration_ms(
    data_length_bytes: int, sample_rate: int = 16000, channels: int = 1, bytes_per_sample: int = 2
) -> float:
    """Calculate audio duration in milliseconds from byte length."""
    if sample_rate <= 0 or channels <= 0 or bytes_per_sample <= 0:
        return 0.0
    total_samples = data_length_bytes / (channels * bytes_per_sample)
    return (total_samples / sample_rate) * 1000.0


def compute_rms_level(pcm_data: bytes) -> Optional[float]:
    """Compute RMS audio level from PCM16 data. Returns value 0.0-1.0."""
    if not pcm_data or len(pcm_data) < 2:
        return None

    num_samples = len(pcm_data) // 2
    samples = struct.unpack(f"<{num_samples}h", pcm_data[: num_samples * 2])

    sum_sq = sum(s * s for s in samples)
    rms = (sum_sq / num_samples) ** 0.5

    # Normalize to 0.0-1.0 range (max int16 is 32767)
    return min(rms / 32767.0, 1.0)


def resample_pcm(
    data: bytes,
    source_rate: int,
    target_rate: int,
    channels: int = 1,
) -> bytes:
    """Simple linear interpolation resample for PCM16 mono audio.

    For production, consider using a proper resampling library (e.g., scipy, librosa).
    This is a lightweight fallback.
    """
    if source_rate == target_rate:
        return data

    num_samples = len(data) // (2 * channels)
    samples = struct.unpack(f"<{num_samples}h", data[: num_samples * 2])

    ratio = source_rate / target_rate
    new_length = int(num_samples / ratio)
    resampled = []

    for i in range(new_length):
        src_idx = i * ratio
        idx_low = int(src_idx)
        idx_high = min(idx_low + 1, num_samples - 1)
        frac = src_idx - idx_low

        interpolated = samples[idx_low] * (1 - frac) + samples[idx_high] * frac
        resampled.append(int(round(interpolated)))

    return struct.pack(f"<{len(resampled)}h", *resampled)
