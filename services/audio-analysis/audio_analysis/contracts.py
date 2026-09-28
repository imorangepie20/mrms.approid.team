import math

from pydantic import BaseModel, Field, model_validator


class SignalSummary(BaseModel):
    rms_energy: float = Field(alias="rmsEnergy")
    peak_level: float = Field(alias="peakLevel")
    dc_offset: float = Field(alias="dcOffset")
    zero_crossing_rate: float = Field(alias="zeroCrossingRate")
    clipping_ratio: float = Field(alias="clippingRatio")

    model_config = {"populate_by_name": True}


class SegmentSummary(BaseModel):
    index: int
    start_seconds: float = Field(alias="startSeconds")
    end_seconds: float = Field(alias="endSeconds")
    sample_count: int = Field(alias="sampleCount")
    signal: SignalSummary

    model_config = {"populate_by_name": True}


class FeatureSummary(BaseModel):
    segment_count: int = Field(alias="segmentCount")
    coverage_ratio: float = Field(alias="coverageRatio")

    model_config = {"populate_by_name": True}


class Statistics(BaseModel):
    mean: float
    standard_deviation: float = Field(alias="standardDeviation")
    minimum: float
    maximum: float

    model_config = {"populate_by_name": True}


class RhythmFeatures(BaseModel):
    bpm: float | None = None
    confidence: float | None = None
    beat_count: int = Field(alias="beatCount")

    model_config = {"populate_by_name": True}


class TonalFeatures(BaseModel):
    key: str | None = None
    mode: str | None = None
    strength: float | None = None


class SpectralFeatures(BaseModel):
    centroid_hz: Statistics = Field(alias="centroidHz")
    rolloff_hz: Statistics = Field(alias="rolloffHz")
    flatness_db: Statistics = Field(alias="flatnessDb")

    model_config = {"populate_by_name": True}


class MfccFeatures(BaseModel):
    coefficient_means: list[float] = Field(alias="coefficientMeans")
    coefficient_standard_deviations: list[float] = Field(
        alias="coefficientStandardDeviations"
    )

    model_config = {"populate_by_name": True}


class DspFeatures(BaseModel):
    rhythm: RhythmFeatures
    tonal: TonalFeatures
    spectral: SpectralFeatures
    mfcc: MfccFeatures
    errors: list[str] = Field(default_factory=list)


class PreprocessFeatures(BaseModel):
    whole: SignalSummary
    segments: list[SegmentSummary]
    summary: FeatureSummary
    dsp: DspFeatures | None = None


class EmbeddingResult(BaseModel):
    model_id: str = Field(alias="modelId")
    model_revision: str = Field(alias="modelRevision")
    dimensions: int
    normalization: str
    values: list[float]

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def validate_vector(self) -> "EmbeddingResult":
        if self.dimensions != len(self.values):
            raise ValueError("embedding_dimensions_mismatch")
        if self.dimensions <= 0 or any(not math.isfinite(value) for value in self.values):
            raise ValueError("embedding_values_invalid")
        if self.normalization != "l2":
            raise ValueError("embedding_normalization_unsupported")
        norm = math.sqrt(math.fsum(value * value for value in self.values))
        if not math.isclose(norm, 1.0, rel_tol=0.0, abs_tol=1e-4):
            raise ValueError("embedding_norm_invalid")
        return self


class PredictionResult(BaseModel):
    model_id: str = Field(alias="modelId")
    model_revision: str = Field(alias="modelRevision")
    vocabulary_version: str = Field(alias="vocabularyVersion")
    label: str
    probability: float = Field(ge=0.0, le=1.0)

    model_config = {"populate_by_name": True}


class AudioAnalysisResponse(BaseModel):
    preview_hash: str = Field(alias="previewHash")
    duration_seconds: float = Field(alias="durationSeconds")
    sample_rate: int = Field(alias="sampleRate")
    channel_count: int = Field(alias="channelCount")
    feature_version: str = Field(alias="featureVersion")
    analysis_stage: str = Field(alias="analysisStage")
    features: PreprocessFeatures
    embedding: EmbeddingResult | None = None
    predictions: list[PredictionResult] = Field(default_factory=list)

    model_config = {"populate_by_name": True}
