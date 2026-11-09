FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models/huggingface \
    TOKENIZERS_PARALLELISM=false \
    NER_MODEL=urchade/gliner_multi_pii-v1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Скачиваем NER-модель на этапе сборки, чтобы production-контейнер
# мог запускаться в изолированной сети без доступа к Hugging Face.
RUN python -c "from gliner import GLiNER; GLiNER.from_pretrained('urchade/gliner_multi_pii-v1')"

RUN addgroup --system scanner \
    && adduser --system --ingroup scanner scanner \
    && mkdir -p /models/huggingface \
    && chown -R scanner:scanner /models

USER scanner

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--workers", "1"]
