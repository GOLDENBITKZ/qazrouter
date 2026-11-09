"""QazRouter PII scanner.

Сервис работает внутри закрытого контура и не пишет prompt'ы в логи.
Он объединяет проверенные regex-правила Казахстана и многоязычную GLiNER NER.
"""

from __future__ import annotations

import json
import logging
import os
import re
import secrets
import threading
import unicodedata
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from gliner import GLiNER
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("qazrouter-pii")

NER_MODEL_NAME = os.getenv("NER_MODEL", "urchade/gliner_multi_pii-v1")
NER_THRESHOLD = float(os.getenv("NER_THRESHOLD", "0.42"))
NER_ENABLED = os.getenv("NER_ENABLED", "true").lower() != "false"
SCANNER_TOKEN = os.getenv("PII_SCANNER_TOKEN", "")
MAX_TOTAL_CHARS = int(os.getenv("PII_MAX_TOTAL_CHARS", "500000"))

NER_LABELS = [
    "person",
    "full name",
    "address",
    "email",
    "phone number",
    "bank account",
    "credit card number",
    "passport number",
    "national identification number",
    "date of birth",
]

LABEL_TO_KIND = {
    "person": "person",
    "full name": "person",
    "address": "address",
    "email": "email",
    "phone number": "phone",
    "bank account": "account",
    "credit card number": "card",
    "passport number": "passport",
    "national identification number": "iin",
    "date of birth": "other",
}

COUNT_KEYS = (
    "iin",
    "phone",
    "card",
    "email",
    "person",
    "address",
    "account",
    "passport",
    "other",
)

IIN_PATTERN = re.compile(r"(?<!\d)\d{12}(?!\d)")
PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:\+?7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}"
    r"[\s\-()]*\d{2}[\s\-()]*\d{2}(?!\d)"
)
CARD_PATTERN = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
EMAIL_PATTERN = re.compile(
    r"(?<![\w.+-])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?![\w.-])",
    re.IGNORECASE,
)
IBAN_PATTERN = re.compile(r"(?<![A-Z0-9])KZ\d{2}[A-Z0-9]{16}(?![A-Z0-9])", re.I)
PASSPORT_PATTERN = re.compile(
    r"(?<![A-Z0-9])[A-Z]{1,2}\d{7,9}(?![A-Z0-9])", re.IGNORECASE
)
ACCOUNT_PATTERN = re.compile(r"(?<!\d)\d{16,20}(?!\d)")

ner_model: GLiNER | None = None
ner_ready = False
ner_lock = threading.Lock()


class RedactRequest(BaseModel):
    request_id: str = Field(min_length=1, max_length=100)
    messages: list[dict[str, Any]]
    extras: dict[str, Any] = Field(default_factory=dict)
    policy_version: str = "kz-pii-v2"


class RedactResponse(BaseModel):
    messages: list[dict[str, Any]]
    extras: dict[str, Any]
    counts: dict[str, int]
    replacements: list[dict[str, str]]
    risk_score: float
    engine: str
    policy_version: str


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    global ner_model, ner_ready

    if not SCANNER_TOKEN:
        logger.error("PII_SCANNER_TOKEN is not configured")
        raise RuntimeError("PII_SCANNER_TOKEN is required")

    if NER_ENABLED:
        logger.info("Loading local PII NER model")
        ner_model = GLiNER.from_pretrained(NER_MODEL_NAME)
        ner_ready = True
        logger.info("PII NER model is ready")

    yield


app = FastAPI(
    title="QazRouter PII Scanner",
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


def luhn_valid(value: str) -> bool:
    digits = re.sub(r"\D", "", value)
    if not 13 <= len(digits) <= 19:
        return False

    total = 0
    double = False

    for char in reversed(digits):
        digit = int(char)
        if double:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
        double = not double

    return total % 10 == 0


def regex_spans(text: str) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []

    def add(match: re.Match[str], kind: str, score: float = 1.0) -> None:
        spans.append(
            {
                "start": match.start(),
                "end": match.end(),
                "kind": kind,
                "score": score,
                "priority": 100,
            }
        )

    for match in IIN_PATTERN.finditer(text):
        add(match, "iin")
    for match in PHONE_PATTERN.finditer(text):
        add(match, "phone")
    for match in EMAIL_PATTERN.finditer(text):
        add(match, "email")
    for match in IBAN_PATTERN.finditer(text):
        add(match, "account")
    for match in PASSPORT_PATTERN.finditer(text):
        add(match, "passport")

    for match in CARD_PATTERN.finditer(text):
        if luhn_valid(match.group(0)):
            add(match, "card", 0.99)

    for match in ACCOUNT_PATTERN.finditer(text):
        if not luhn_valid(match.group(0)):
            add(match, "account", 0.92)

    return spans


def chunk_text(text: str, size: int = 1800, overlap: int = 180) -> list[tuple[int, str]]:
    if len(text) <= size:
        return [(0, text)]

    chunks: list[tuple[int, str]] = []
    start = 0

    while start < len(text):
        end = min(len(text), start + size)
        chunks.append((start, text[start:end]))
        if end == len(text):
            break
        start = max(start + 1, end - overlap)

    return chunks


def ner_spans(text: str) -> list[dict[str, Any]]:
    if not NER_ENABLED:
        return []
    if not ner_ready or ner_model is None:
        raise RuntimeError("NER model is unavailable")

    spans: list[dict[str, Any]] = []

    # Один экземпляр модели может быть не thread-safe. Горизонтальное
    # масштабирование выполняется дополнительными контейнерами.
    with ner_lock:
        for offset, chunk in chunk_text(text):
            for entity in ner_model.predict_entities(
                chunk,
                NER_LABELS,
                threshold=NER_THRESHOLD,
            ):
                label = str(entity.get("label", "")).lower()
                kind = LABEL_TO_KIND.get(label, "other")
                spans.append(
                    {
                        "start": offset + int(entity["start"]),
                        "end": offset + int(entity["end"]),
                        "kind": kind,
                        "score": float(entity.get("score", NER_THRESHOLD)),
                        "priority": 50,
                    }
                )

    return spans


def choose_non_overlapping(spans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(
        spans,
        key=lambda item: (item["start"], -(item["end"] - item["start"]), -item["priority"]),
    )
    accepted: list[dict[str, Any]] = []

    for candidate in ordered:
        overlaps = any(
            candidate["start"] < existing["end"]
            and candidate["end"] > existing["start"]
            for existing in accepted
        )
        if not overlaps:
            accepted.append(candidate)

    return accepted


class Redactor:
    def __init__(self) -> None:
        self.counts = {key: 0 for key in COUNT_KEYS}
        self.replacements: list[dict[str, str]] = []
        self.tokens: dict[tuple[str, str], str] = {}
        self.max_risk = 0.0

    def token_for(self, kind: str, original: str) -> str:
        key = (kind, original.casefold())
        if key not in self.tokens:
            token = f"__KZ_PII_{kind.upper()}_{len(self.tokens) + 1}__"
            self.tokens[key] = token
            self.replacements.append({"token": token, "original": original})
        return self.tokens[key]

    def redact_text(self, value: str) -> str:
        text = unicodedata.normalize("NFKC", value).replace("\u200b", "")
        spans = choose_non_overlapping(regex_spans(text) + ner_spans(text))
        if not spans:
            return text

        pieces: list[str] = []
        cursor = 0

        for span in spans:
            start = int(span["start"])
            end = int(span["end"])
            if start < cursor:
                continue

            kind = str(span["kind"])
            if kind not in self.counts:
                kind = "other"

            original = text[start:end]
            pieces.append(text[cursor:start])
            pieces.append(self.token_for(kind, original))
            cursor = end
            self.counts[kind] += 1
            self.max_risk = max(self.max_risk, float(span["score"]))

        pieces.append(text[cursor:])
        return "".join(pieces)

    def walk(self, value: Any) -> Any:
        if isinstance(value, str):
            return self.redact_text(value)
        if isinstance(value, list):
            return [self.walk(item) for item in value]
        if isinstance(value, dict):
            return {key: self.walk(item) for key, item in value.items()}
        return value


def verify_token(authorization: str | None) -> None:
    expected = f"Bearer {SCANNER_TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health() -> dict[str, Any]:
    if NER_ENABLED and not ner_ready:
        raise HTTPException(status_code=503, detail="NER model is unavailable")

    return {
        "status": "ok",
        "engine": "gliner+regex-v2" if NER_ENABLED else "regex-v2",
        "ner_model": NER_MODEL_NAME if NER_ENABLED else None,
    }


@app.post("/v1/redact", response_model=RedactResponse)
async def redact(
    payload: RedactRequest,
    authorization: str | None = Header(default=None),
) -> RedactResponse:
    verify_token(authorization)

    if NER_ENABLED and not ner_ready:
        raise HTTPException(status_code=503, detail="NER model is unavailable")
    if len(payload.messages) == 0 or len(payload.messages) > 200:
        raise HTTPException(status_code=400, detail="Invalid messages count")

    total_chars = sum(
        len(str(message.get("content", ""))) for message in payload.messages
    ) + len(json.dumps(payload.extras, ensure_ascii=False))
    if total_chars > MAX_TOTAL_CHARS:
        raise HTTPException(status_code=413, detail="Prompt is too large")

    redactor = Redactor()

    try:
        def redact_payload() -> tuple[list[dict[str, Any]], dict[str, Any]]:
            return (
                [redactor.walk(message) for message in payload.messages],
                redactor.walk(payload.extras),
            )

        redacted_messages, redacted_extras = await run_in_threadpool(
            redact_payload
        )
    except Exception as exc:
        logger.exception("PII scanning failed")
        raise HTTPException(status_code=503, detail="PII scanning failed") from exc

    return RedactResponse(
        messages=redacted_messages,
        extras=redacted_extras,
        counts=redactor.counts,
        replacements=redactor.replacements,
        risk_score=redactor.max_risk,
        engine="gliner+regex-v2" if NER_ENABLED else "regex-v2",
        policy_version=payload.policy_version,
    )
