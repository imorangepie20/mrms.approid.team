FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /service

COPY pyproject.toml ./
COPY audio_analysis ./audio_analysis
RUN pip install --no-cache-dir .

RUN useradd --create-home --uid 10002 appuser \
    && chown -R appuser:appuser /service
USER appuser

EXPOSE 8000
CMD ["uvicorn", "audio_analysis.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
