FROM python:3.12-slim-bookworm

ENV HF_HOME=/opt/huggingface \
    HF_HUB_OFFLINE=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TRANSFORMERS_OFFLINE=1

WORKDIR /service

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

ENV HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-mpnet-base-v2', revision='088a2c0bb2f721158b8350700bf0f2a250df25ae')"
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1

COPY app ./app

RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /service /opt/huggingface
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
