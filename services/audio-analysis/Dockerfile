FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AUDIO_ANALYSIS_ARTIFACT_MANIFEST=/service/artifacts.json \
    AUDIO_ANALYSIS_MODEL_DIR=/opt/music-pie-audio-models

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /service

COPY artifacts.json /tmp/audio-analysis-artifacts.json
COPY scripts/download_artifacts.py /tmp/download_artifacts.py
RUN python /tmp/download_artifacts.py \
      /tmp/audio-analysis-artifacts.json \
      /opt/music-pie-audio-models \
    && pip install --no-cache-dir \
      "numpy==2.5.3" \
      /opt/music-pie-audio-models/essentia-2.1b6.dev1389-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl \
    && rm /opt/music-pie-audio-models/essentia-2.1b6.dev1389-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl \
    && rm /tmp/download_artifacts.py /tmp/audio-analysis-artifacts.json

COPY pyproject.toml ./
COPY artifacts.json ./
COPY audio_analysis ./audio_analysis
RUN pip install --no-cache-dir ".[model]"

RUN useradd --create-home --uid 10002 appuser \
    && chown -R appuser:appuser /service /opt/music-pie-audio-models
USER appuser

EXPOSE 8000
CMD ["uvicorn", "audio_analysis.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
