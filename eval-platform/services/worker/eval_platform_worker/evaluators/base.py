from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field


class EvaluationInput(BaseModel):
    input: Any | None = None
    output: Any | None = None
    expected: Any | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    trace_id: str | None = None
    observation_id: str | None = None


class EvaluationResult(BaseModel):
    score: float
    passed: bool
    reason: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    dimension_scores: dict[str, float] = Field(default_factory=dict)


class Evaluator(ABC):
    @abstractmethod
    async def evaluate(self, input: EvaluationInput) -> EvaluationResult:
        raise NotImplementedError
