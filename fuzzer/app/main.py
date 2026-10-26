import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .llm import LlmEngine, LlmError
from .models import HealthResponse, PerturbRequest, PerturbResponse
from .strategies import mock_perturb

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fuzzer-engine")

engine = LlmEngine()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    engine.load()
    yield
    engine.unload()


app = FastAPI(
    title="Multi-Agent Semantic Red-Teamer", version="1.0.0", lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("CORS_ORIGIN", "").split(",") if o],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="healthy", mode=engine.mode)


# Sync endpoint: FastAPI runs it in a worker thread so model inference does not block the event loop.
@app.post("/v1/perturb", response_model=PerturbResponse)
def perturb(req: PerturbRequest) -> PerturbResponse:
    if engine.mode == "llm":
        try:
            mutated = engine.perturb(
                req.strategy, req.payload, req.contractHint, req.temperature
            )
            return PerturbResponse(perturbed=mutated, strategy=req.strategy, mode="llm")
        except LlmError as err:
            logger.error("LLM perturbation failed, using mock engine: %s", err)

    return PerturbResponse(
        perturbed=mock_perturb(req.strategy, req.payload),
        strategy=req.strategy,
        mode="mock",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8001")),
        reload=False,
    )
