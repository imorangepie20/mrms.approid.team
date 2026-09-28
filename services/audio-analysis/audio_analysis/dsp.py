from __future__ import annotations

import math

from .contracts import (
    DspFeatures,
    MfccFeatures,
    RhythmFeatures,
    SpectralFeatures,
    Statistics,
    TonalFeatures,
)
from .preprocess import DecodedAudio


def _finite(value: float) -> float:
    converted = float(value)
    if not math.isfinite(converted):
        raise ValueError("dsp_non_finite")
    return converted


def _statistics(values: list[float]) -> Statistics:
    if not values:
        raise ValueError("dsp_empty_statistics")
    finite = [_finite(value) for value in values]
    mean = math.fsum(finite) / len(finite)
    variance = math.fsum((value - mean) ** 2 for value in finite) / len(finite)
    return Statistics(
        mean=mean,
        standardDeviation=math.sqrt(variance),
        minimum=min(finite),
        maximum=max(finite),
    )


def analyze_dsp(decoded: DecodedAudio, essentia_standard) -> DspFeatures:
    import numpy as np

    audio = np.asarray(decoded.samples, dtype=np.float32)
    errors: list[str] = []
    has_signal = bool(audio.size and float(np.max(np.abs(audio))) > 1e-7)

    bpm: float | None = None
    confidence: float | None = None
    beat_count = 0
    if has_signal and decoded.duration_seconds >= 2.0:
        try:
            bpm_value, beats, confidence_value, _estimates, _intervals = (
                essentia_standard.RhythmExtractor2013(method="multifeature")(audio)
            )
            bpm = _finite(bpm_value)
            confidence = _finite(confidence_value)
            beat_count = len(beats)
        except Exception:
            errors.append("rhythm_analysis_failed")
    else:
        errors.append("rhythm_insufficient_signal")

    key: str | None = None
    mode: str | None = None
    strength: float | None = None
    if has_signal and decoded.duration_seconds >= 1.0:
        try:
            key_value, scale_value, strength_value = essentia_standard.KeyExtractor(
                sampleRate=decoded.sample_rate
            )(audio)
            key = str(key_value)
            mode = str(scale_value)
            strength = _finite(strength_value)
        except Exception:
            errors.append("tonal_analysis_failed")
    else:
        errors.append("tonal_insufficient_signal")

    window = essentia_standard.Windowing(type="hann")
    spectrum = essentia_standard.Spectrum()
    centroid = essentia_standard.Centroid(range=decoded.sample_rate / 2)
    rolloff = essentia_standard.RollOff(sampleRate=decoded.sample_rate)
    flatness = essentia_standard.FlatnessDB()
    mfcc = essentia_standard.MFCC(
        inputSize=1025,
        sampleRate=decoded.sample_rate,
        highFrequencyBound=decoded.sample_rate / 2,
        numberBands=40,
        numberCoefficients=13,
    )

    centroids: list[float] = []
    rolloffs: list[float] = []
    flatness_values: list[float] = []
    coefficients: list[list[float]] = []
    for frame in essentia_standard.FrameGenerator(
        audio,
        frameSize=2048,
        hopSize=1024,
        startFromZero=True,
    ):
        frame_spectrum = spectrum(window(frame))
        centroids.append(_finite(centroid(frame_spectrum)))
        rolloffs.append(_finite(rolloff(frame_spectrum)))
        flatness_values.append(_finite(flatness(frame_spectrum)))
        _bands, frame_coefficients = mfcc(frame_spectrum)
        coefficients.append([_finite(value) for value in frame_coefficients])

    if not coefficients:
        raise ValueError("dsp_no_frames")
    coefficient_columns = list(zip(*coefficients, strict=True))

    return DspFeatures(
        rhythm=RhythmFeatures(bpm=bpm, confidence=confidence, beatCount=beat_count),
        tonal=TonalFeatures(key=key, mode=mode, strength=strength),
        spectral=SpectralFeatures(
            centroidHz=_statistics(centroids),
            rolloffHz=_statistics(rolloffs),
            flatnessDb=_statistics(flatness_values),
        ),
        mfcc=MfccFeatures(
            coefficientMeans=[_statistics(list(column)).mean for column in coefficient_columns],
            coefficientStandardDeviations=[
                _statistics(list(column)).standard_deviation
                for column in coefficient_columns
            ],
        ),
        errors=errors,
    )
