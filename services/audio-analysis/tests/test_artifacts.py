from hashlib import sha256
import json

import pytest

from audio_analysis.models import AudioModelError, verify_runtime_artifacts


def manifest_for(name: str, payload: bytes) -> dict:
    return {
        "schemaVersion": 1,
        "artifacts": [
            {
                "name": name,
                "kind": "model",
                "size": len(payload),
                "sha256": sha256(payload).hexdigest(),
            }
        ],
    }


def test_runtime_artifact_verification_accepts_exact_file(tmp_path):
    payload = b"model"
    (tmp_path / "model.onnx").write_bytes(payload)
    manifest_path = tmp_path / "artifacts.json"
    manifest_path.write_text(
        json.dumps(manifest_for("model.onnx", payload)), encoding="utf-8"
    )

    verify_runtime_artifacts(manifest_path, tmp_path)


@pytest.mark.parametrize("mutation", [b"changed", b"model-extra"])
def test_runtime_artifact_verification_rejects_changed_file(tmp_path, mutation):
    payload = b"model"
    (tmp_path / "model.onnx").write_bytes(mutation)
    manifest_path = tmp_path / "artifacts.json"
    manifest_path.write_text(
        json.dumps(manifest_for("model.onnx", payload)), encoding="utf-8"
    )

    with pytest.raises(AudioModelError, match="artifact_(sha256|size)_mismatch"):
        verify_runtime_artifacts(manifest_path, tmp_path)
