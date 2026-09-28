from array import array
from hashlib import sha256
import io
import math
import random
import wave


SAMPLE_RATE = 16_000


def wav_bytes(duration_seconds: float, kind: str = "tone") -> bytes:
    sample_count = round(duration_seconds * SAMPLE_RATE)
    values = array("h")
    random_source = random.Random(20260929)
    for index in range(sample_count):
        if kind == "tone":
            value = 0.5 * math.sin(2 * math.pi * 440 * index / SAMPLE_RATE)
        elif kind == "silence":
            value = 0.0
        elif kind == "noise":
            value = random_source.uniform(-0.25, 0.25)
        else:
            raise ValueError(f"unknown fixture kind: {kind}")
        values.append(round(value * 32767))

    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(values.tobytes())
    return output.getvalue()


def preview_headers(payload: bytes, version: str = "audio-preprocess-v1") -> dict[str, str]:
    return {
        "Content-Type": "audio/wav",
        "X-Preview-Sha256": sha256(payload).hexdigest(),
        "X-Feature-Version": version,
    }
