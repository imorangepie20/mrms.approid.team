from array import array
from dataclasses import dataclass
import math
import shutil
import subprocess
import sys

from .contracts import FeatureSummary, PreprocessFeatures, SegmentSummary, SignalSummary


SAMPLE_RATE = 16_000
CHANNEL_COUNT = 1
MAX_DURATION_SECONDS = 30.0
CODEC_PADDING_TOLERANCE_SECONDS = 0.05
SEGMENT_SECONDS = 10.0


class AudioPreprocessError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class DecodedAudio:
    samples: tuple[float, ...]
    sample_rate: int = SAMPLE_RATE

    @property
    def duration_seconds(self) -> float:
        return len(self.samples) / self.sample_rate


class FfmpegDecoder:
    def __init__(self, timeout_seconds: float = 20.0) -> None:
        self.timeout_seconds = timeout_seconds

    def available(self) -> bool:
        return shutil.which("ffmpeg") is not None

    def decode(self, payload: bytes) -> DecodedAudio:
        if not self.available():
            raise AudioPreprocessError("ffmpeg_unavailable")

        command = [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-vn",
            "-ac",
            str(CHANNEL_COUNT),
            "-ar",
            str(SAMPLE_RATE),
            "-t",
            str(MAX_DURATION_SECONDS + CODEC_PADDING_TOLERANCE_SECONDS + 0.01),
            "-f",
            "f32le",
            "pipe:1",
        ]

        try:
            result = subprocess.run(
                command,
                input=payload,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
                timeout=self.timeout_seconds,
            )
        except subprocess.TimeoutExpired as error:
            raise AudioPreprocessError("preview_decode_timeout") from error

        if result.returncode != 0:
            raise AudioPreprocessError("preview_decode_failed")

        samples = array("f")
        try:
            samples.frombytes(result.stdout)
        except ValueError as error:
            raise AudioPreprocessError("preview_decode_failed") from error
        if sys.byteorder != "little":
            samples.byteswap()

        max_samples = int(MAX_DURATION_SECONDS * SAMPLE_RATE)
        tolerance_samples = math.ceil(
            (MAX_DURATION_SECONDS + CODEC_PADDING_TOLERANCE_SECONDS) * SAMPLE_RATE
        )
        if len(samples) > tolerance_samples:
            raise AudioPreprocessError("preview_too_long")
        if len(samples) > max_samples:
            del samples[max_samples:]
        if not samples:
            raise AudioPreprocessError("preview_decode_empty")
        if any(not math.isfinite(value) for value in samples):
            raise AudioPreprocessError("preview_samples_invalid")

        return DecodedAudio(tuple(float(value) for value in samples))


def _round(value: float) -> float:
    rounded = round(value, 8)
    return 0.0 if rounded == -0.0 else rounded


def summarize_signal(samples: tuple[float, ...]) -> SignalSummary:
    if not samples:
        raise AudioPreprocessError("preview_decode_empty")

    sample_count = len(samples)
    rms_energy = math.sqrt(math.fsum(value * value for value in samples) / sample_count)
    peak_level = max(abs(value) for value in samples)
    dc_offset = math.fsum(samples) / sample_count
    clipping_ratio = sum(abs(value) >= 0.999 for value in samples) / sample_count

    crossings = 0
    previous_sign = 0
    for value in samples:
        current_sign = 1 if value > 0 else -1 if value < 0 else 0
        if current_sign == 0:
            continue
        if previous_sign and current_sign != previous_sign:
            crossings += 1
        previous_sign = current_sign

    zero_crossing_rate = crossings / max(sample_count - 1, 1)
    return SignalSummary(
        rmsEnergy=_round(rms_energy),
        peakLevel=_round(peak_level),
        dcOffset=_round(dc_offset),
        zeroCrossingRate=_round(zero_crossing_rate),
        clippingRatio=_round(clipping_ratio),
    )


def build_features(decoded: DecodedAudio) -> PreprocessFeatures:
    segment_samples = int(SEGMENT_SECONDS * decoded.sample_rate)
    segments: list[SegmentSummary] = []
    for index, start in enumerate(range(0, len(decoded.samples), segment_samples)):
        chunk = decoded.samples[start : start + segment_samples]
        start_seconds = start / decoded.sample_rate
        end_seconds = min((start + len(chunk)) / decoded.sample_rate, MAX_DURATION_SECONDS)
        segments.append(
            SegmentSummary(
                index=index,
                startSeconds=_round(start_seconds),
                endSeconds=_round(end_seconds),
                sampleCount=len(chunk),
                signal=summarize_signal(chunk),
            )
        )

    return PreprocessFeatures(
        whole=summarize_signal(decoded.samples),
        segments=segments,
        summary=FeatureSummary(
            segmentCount=len(segments),
            coverageRatio=_round(decoded.duration_seconds / MAX_DURATION_SECONDS),
        ),
    )
