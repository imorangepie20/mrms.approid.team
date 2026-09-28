from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import math
import os
from pathlib import Path
from typing import Protocol

from .contracts import DspFeatures, EmbeddingResult, PredictionResult
from .dsp import analyze_dsp
from .preprocess import DecodedAudio, MAX_DURATION_SECONDS, SAMPLE_RATE


MODEL_FEATURE_VERSION = "essentia-dsp-v1"
MAEST_MODEL_ID = "essentia/discogs-maest-30s-pw-519l"
MAEST_MODEL_REVISION = "2"
MUSICNN_MODEL_ID = "essentia/msd-musicnn"
MUSICNN_MODEL_REVISION = "1"
MAEST_DIMENSIONS = 2304
MAEST_FRAME_COUNT = 1876
MAEST_BAND_COUNT = 96
MAEST_MEAN = 2.06755686098554
MAEST_STANDARD_DEVIATION = 1.268292820667291
MUSICNN_PATCH_SIZE = 187
MUSICNN_PATCH_HOP = 93

HEAD_NAMES = (
    "danceability",
    "voice_instrumental",
    "mood_acoustic",
    "mood_electronic",
    "mood_aggressive",
    "mood_happy",
    "mood_relaxed",
    "mood_sad",
    "mood_party",
)


class AudioModelError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class AnalysisResult:
    dsp: DspFeatures
    embedding: EmbeddingResult
    predictions: list[PredictionResult]


class AudioAnalyzer(Protocol):
    def load(self) -> None: ...

    def available(self) -> bool: ...

    def analyze(self, decoded: DecodedAudio) -> AnalysisResult: ...


def _file_digest(path: Path) -> tuple[int, str]:
    digest = sha256()
    size = 0
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def verify_runtime_artifacts(manifest_path: Path, model_dir: Path) -> None:
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AudioModelError("artifact_manifest_invalid") from error
    if manifest.get("schemaVersion") != 1:
        raise AudioModelError("artifact_manifest_schema_unsupported")

    for artifact in manifest.get("artifacts", []):
        if artifact.get("kind") == "python-wheel":
            continue
        path = model_dir / artifact["name"]
        try:
            size, digest = _file_digest(path)
        except OSError as error:
            raise AudioModelError("artifact_missing") from error
        if size != artifact["size"]:
            raise AudioModelError("artifact_size_mismatch")
        if digest != artifact["sha256"]:
            raise AudioModelError("artifact_sha256_mismatch")


def _session_options(onnxruntime):
    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = int(os.getenv("AUDIO_ANALYSIS_ONNX_THREADS", "1"))
    options.inter_op_num_threads = 1
    options.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL
    options.graph_optimization_level = onnxruntime.GraphOptimizationLevel.ORT_ENABLE_ALL
    return options


def _metadata(path: Path, expected_classes: int) -> tuple[list[str], str]:
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
        classes = [str(label) for label in content["classes"]]
        version = str(content["version"])
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise AudioModelError("model_metadata_invalid") from error
    if len(classes) != expected_classes or len(set(classes)) != len(classes):
        raise AudioModelError("model_vocabulary_invalid")
    return classes, version


def _probability(value: float) -> float:
    converted = float(value)
    if not math.isfinite(converted) or converted < -1e-6 or converted > 1.000001:
        raise AudioModelError("model_probability_invalid")
    return min(1.0, max(0.0, converted))


class EssentiaOnnxAnalyzer:
    def __init__(self, model_dir: Path, manifest_path: Path) -> None:
        self.model_dir = model_dir
        self.manifest_path = manifest_path
        self._ready = False
        self._np = None
        self._essentia = None
        self._maest = None
        self._musicnn = None
        self._heads: dict[str, object] = {}
        self._maest_classes: list[str] = []
        self._maest_vocabulary_version = ""
        self._head_classes: dict[str, list[str]] = {}
        self._head_vocabulary_versions: dict[str, str] = {}

    @classmethod
    def from_environment(cls) -> "EssentiaOnnxAnalyzer":
        return cls(
            Path(os.getenv("AUDIO_ANALYSIS_MODEL_DIR", "/opt/music-pie-audio-models")),
            Path(
                os.getenv(
                    "AUDIO_ANALYSIS_ARTIFACT_MANIFEST",
                    "/service/artifacts.json",
                )
            ),
        )

    def available(self) -> bool:
        return self._ready

    def load(self) -> None:
        if self._ready:
            return
        verify_runtime_artifacts(self.manifest_path, self.model_dir)
        try:
            import essentia.standard as essentia_standard
            import numpy as np
            import onnxruntime
        except ImportError as error:
            raise AudioModelError("model_runtime_unavailable") from error

        options = _session_options(onnxruntime)
        providers = ["CPUExecutionProvider"]
        try:
            self._maest = onnxruntime.InferenceSession(
                self.model_dir / "discogs-maest-30s-pw-519l-2.onnx",
                sess_options=options,
                providers=providers,
            )
            self._musicnn = onnxruntime.InferenceSession(
                self.model_dir / "msd-musicnn-1.onnx",
                sess_options=options,
                providers=providers,
            )
            self._heads = {
                name: onnxruntime.InferenceSession(
                    self.model_dir / f"{name}-msd-musicnn-1.onnx",
                    sess_options=options,
                    providers=providers,
                )
                for name in HEAD_NAMES
            }
        except Exception as error:
            raise AudioModelError("model_load_failed") from error

        self._maest_classes, self._maest_vocabulary_version = _metadata(
            self.model_dir / "discogs-maest-30s-pw-519l-2.json", 519
        )
        for name in HEAD_NAMES:
            classes, version = _metadata(
                self.model_dir / f"{name}-msd-musicnn-1.json", 2
            )
            self._head_classes[name] = classes
            self._head_vocabulary_versions[name] = version

        self._np = np
        self._essentia = essentia_standard
        self._ready = True

    def _mel_spectrogram(self, decoded: DecodedAudio):
        assert self._np is not None
        assert self._essentia is not None
        audio = self._np.asarray(decoded.samples, dtype=self._np.float32)
        target_samples = round(MAX_DURATION_SECONDS * SAMPLE_RATE)
        if audio.shape[0] > target_samples:
            raise AudioModelError("preview_too_long")
        if audio.shape[0] < target_samples:
            audio = self._np.pad(audio, (0, target_samples - audio.shape[0]))

        mel_extractor = self._essentia.TensorflowInputMusiCNN()
        bands = [
            mel_extractor(frame)
            for frame in self._essentia.FrameGenerator(
                audio,
                frameSize=512,
                hopSize=256,
                startFromZero=False,
            )
        ]
        mel = self._np.asarray(bands, dtype=self._np.float32)
        if mel.shape != (MAEST_FRAME_COUNT, MAEST_BAND_COUNT):
            raise AudioModelError("model_input_shape_invalid")
        if not self._np.isfinite(mel).all():
            raise AudioModelError("model_input_values_invalid")
        return mel

    def _maest_results(self, mel) -> tuple[EmbeddingResult, list[PredictionResult]]:
        assert self._np is not None
        assert self._maest is not None
        normalized = (mel - MAEST_MEAN) / (MAEST_STANDARD_DEVIATION * 2.0)
        try:
            activations, token_embeddings = self._maest.run(
                ["activations", "layer_07_embeddings"],
                {"melspectrogram": normalized[self._np.newaxis, :, :]},
            )
        except Exception as error:
            raise AudioModelError("maest_inference_failed") from error

        if token_embeddings.ndim != 3 or token_embeddings.shape[0] != 1:
            raise AudioModelError("maest_embedding_shape_invalid")
        tokens = token_embeddings[0]
        if tokens.shape[0] < 3 or tokens.shape[1] != 768:
            raise AudioModelError("maest_embedding_shape_invalid")
        vector = self._np.concatenate((tokens[0], tokens[1], tokens[2:].mean(axis=0)))
        norm = float(self._np.linalg.norm(vector))
        if not math.isfinite(norm) or norm <= 0:
            raise AudioModelError("maest_embedding_norm_invalid")
        vector = vector / norm
        embedding = EmbeddingResult(
            modelId=MAEST_MODEL_ID,
            modelRevision=MAEST_MODEL_REVISION,
            dimensions=MAEST_DIMENSIONS,
            normalization="l2",
            values=[float(value) for value in vector],
        )

        probabilities = self._np.asarray(activations).reshape(-1)
        if probabilities.shape != (len(self._maest_classes),):
            raise AudioModelError("maest_prediction_shape_invalid")
        top_indices = self._np.argsort(probabilities)[-10:][::-1]
        predictions = [
            PredictionResult(
                modelId=MAEST_MODEL_ID,
                modelRevision=MAEST_MODEL_REVISION,
                vocabularyVersion=self._maest_vocabulary_version,
                label=self._maest_classes[int(index)],
                probability=_probability(probabilities[int(index)]),
            )
            for index in top_indices
        ]
        return embedding, predictions

    def _musicnn_predictions(self, mel) -> list[PredictionResult]:
        assert self._np is not None
        assert self._musicnn is not None
        patches = self._np.asarray(
            [
                mel[start : start + MUSICNN_PATCH_SIZE]
                for start in range(
                    0,
                    mel.shape[0] - MUSICNN_PATCH_SIZE + 1,
                    MUSICNN_PATCH_HOP,
                )
            ],
            dtype=self._np.float32,
        )
        try:
            (embeddings,) = self._musicnn.run(
                ["embeddings"], {"melspectrogram": patches}
            )
        except Exception as error:
            raise AudioModelError("musicnn_inference_failed") from error
        if embeddings.ndim != 2 or embeddings.shape[1] != 200:
            raise AudioModelError("musicnn_embedding_shape_invalid")

        predictions: list[PredictionResult] = []
        for name, session in self._heads.items():
            try:
                (activations,) = session.run(
                    ["activations"], {"embeddings": embeddings}
                )
            except Exception as error:
                raise AudioModelError("musicnn_head_inference_failed") from error
            if activations.ndim != 2 or activations.shape[1] != 2:
                raise AudioModelError("musicnn_prediction_shape_invalid")
            mean_probabilities = activations.mean(axis=0)
            for label, probability in zip(
                self._head_classes[name], mean_probabilities, strict=True
            ):
                predictions.append(
                    PredictionResult(
                        modelId=f"{MUSICNN_MODEL_ID}/{name}",
                        modelRevision=MUSICNN_MODEL_REVISION,
                        vocabularyVersion=self._head_vocabulary_versions[name],
                        label=label,
                        probability=_probability(probability),
                    )
                )
        return predictions

    def analyze(self, decoded: DecodedAudio) -> AnalysisResult:
        if not self._ready:
            raise AudioModelError("models_not_ready")
        try:
            dsp = analyze_dsp(decoded, self._essentia)
            mel = self._mel_spectrogram(decoded)
            embedding, maest_predictions = self._maest_results(mel)
            predictions = maest_predictions + self._musicnn_predictions(mel)
        except AudioModelError:
            raise
        except Exception as error:
            raise AudioModelError("audio_analysis_failed") from error
        return AnalysisResult(dsp=dsp, embedding=embedding, predictions=predictions)
