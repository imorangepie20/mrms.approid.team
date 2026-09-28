from pydantic import BaseModel, Field


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


class PreprocessFeatures(BaseModel):
    whole: SignalSummary
    segments: list[SegmentSummary]
    summary: FeatureSummary


class AudioAnalysisResponse(BaseModel):
    preview_hash: str = Field(alias="previewHash")
    duration_seconds: float = Field(alias="durationSeconds")
    sample_rate: int = Field(alias="sampleRate")
    channel_count: int = Field(alias="channelCount")
    feature_version: str = Field(alias="featureVersion")
    analysis_stage: str = Field(alias="analysisStage")
    features: PreprocessFeatures
    embedding: None = None
    predictions: list[object] = Field(default_factory=list)

    model_config = {"populate_by_name": True}
