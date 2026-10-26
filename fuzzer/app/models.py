from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field

Strategy = Literal["INVERT_LOGIC", "AMBIGUOUS_DRIFT", "HALLUCINATE_CONSTRAINTS"]
Mode = Literal["llm", "mock"]


class PerturbRequest(BaseModel):
    payload: Dict[str, Any] = Field(
        ..., description="Original raw payload emitted by the source agent"
    )
    strategy: Strategy = Field(
        default="AMBIGUOUS_DRIFT", description="Semantic attack vector to apply"
    )
    contractHint: Optional[str] = Field(
        default=None, description="Plain-language description of the target contract"
    )
    temperature: float = Field(default=0.7, ge=0.0, le=1.5)


class PerturbResponse(BaseModel):
    perturbed: Dict[str, Any]
    strategy: Strategy
    mode: Mode


class HealthResponse(BaseModel):
    status: Literal["healthy"]
    mode: Mode
