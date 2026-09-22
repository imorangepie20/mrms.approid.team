FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

USER nobody
CMD ["python", "-c", "from ems_pipeline.worker import HealthGate; print(HealthGate())"]
