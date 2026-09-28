import math

import pytest

from audio_analysis.preprocess import AudioPreprocessError, FfmpegDecoder, build_features
from helpers import wav_bytes


def test_tone_silence_and_seeded_noise_have_deterministic_summaries():
    decoder = FfmpegDecoder()

    tone = build_features(decoder.decode(wav_bytes(1, "tone"))).whole
    assert tone.rms_energy == pytest.approx(math.sqrt(0.125), abs=0.0001)
    assert tone.peak_level == pytest.approx(0.5, abs=0.0001)
    assert tone.zero_crossing_rate == pytest.approx(880 / 16_000, abs=0.001)

    silence = build_features(decoder.decode(wav_bytes(1, "silence"))).whole
    assert silence.model_dump(by_alias=True) == {
        "rmsEnergy": 0.0,
        "peakLevel": 0.0,
        "dcOffset": 0.0,
        "zeroCrossingRate": 0.0,
        "clippingRatio": 0.0,
    }

    noise_payload = wav_bytes(1, "noise")
    first = build_features(decoder.decode(noise_payload))
    second = build_features(decoder.decode(noise_payload))
    assert first == second
    assert first.whole.peak_level <= 0.25
    assert first.whole.rms_energy > 0


@pytest.mark.parametrize(
    ("duration", "segments", "coverage"),
    [(5, 1, 1 / 6), (30, 3, 1.0)],
)
def test_duration_boundaries(duration: float, segments: int, coverage: float):
    features = build_features(FfmpegDecoder().decode(wav_bytes(duration)))

    assert features.summary.segment_count == segments
    assert features.summary.coverage_ratio == pytest.approx(coverage, abs=0.00000001)


def test_rejects_over_30_seconds_and_corrupt_input():
    decoder = FfmpegDecoder()

    with pytest.raises(AudioPreprocessError, match="preview_too_long"):
        decoder.decode(wav_bytes(30.1))
    with pytest.raises(AudioPreprocessError, match="preview_decode_failed"):
        decoder.decode(b"not audio")
