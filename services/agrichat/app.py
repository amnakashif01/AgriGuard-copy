"""Single resident GPU worker, authenticated API and bounded input. No image storage."""
import hmac
import json
import logging
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from contract import DiagnosisRequest, MAX_BODY_BYTES, decode_image, provenance

logger = logging.getLogger("agrichat")


def create_app(engine_factory=None):
    lock = threading.Lock()
    if engine_factory is None:
        from engine import AgriChatEngine
        engine_factory = AgriChatEngine

    @asynccontextmanager
    async def lifespan(app):
        key = os.environ.get("AGRICHAT_API_KEY", "")
        if len(key) < 32:
            raise RuntimeError("AGRICHAT_API_KEY must contain at least 32 characters")
        app.state.api_key = key
        # A failed model load prevents readiness; no blank or Gemini substitute.
        app.state.engine = await run_in_threadpool(engine_factory)
        await run_in_threadpool(app.state.engine.warmup)
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def authenticate(request):
        expected = f"Bearer {request.app.state.api_key}".encode()
        supplied = request.headers.get("authorization", "").encode()
        if not hmac.compare_digest(supplied, expected):
            raise HTTPException(401, "Unauthorized")

    @app.get("/health/ready")
    async def ready(request: Request):
        authenticate(request)
        return {"ready": True, "inference": provenance()}

    @app.post("/v1/diagnose")
    async def diagnose(request: Request):
        authenticate(request)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_BODY_BYTES:
                raise HTTPException(413, "Photo request is too large")
        try:
            parsed = DiagnosisRequest.model_validate_json(body)
            image = await run_in_threadpool(decode_image, parsed.photoDataUri)
        except (ValueError, ValidationError):
            raise HTTPException(422, "Use a valid JPEG, PNG or WebP crop photo") from None
        # Do not let slow requests form a several-minute GPU queue.
        if not lock.acquire(blocking=False):
            raise HTTPException(503, "GPU is busy; retry shortly", headers={"Retry-After": "3"})
        try:
            findings = await run_in_threadpool(request.app.state.engine.diagnose, parsed, image)
            return {"diagnosis": findings.model_dump(), "inference": provenance()}
        except (ValueError, ValidationError, json.JSONDecodeError):
            raise HTTPException(422, "The model did not return a valid structured diagnosis") from None
        except Exception as error:
            # Do not log patient images, symptoms, raw generation, tokens or exception strings.
            logger.error("AgriChat inference failed: %s", type(error).__name__)
            raise HTTPException(503, "Model temporarily unavailable; retry shortly") from None
        finally:
            lock.release()

    return app


app = create_app()
