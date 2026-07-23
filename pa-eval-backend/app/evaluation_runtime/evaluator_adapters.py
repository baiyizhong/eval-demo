from collections.abc import Mapping, Sequence
from typing import Any, Protocol


class EvaluationCheckpoint(Protocol):
    async def checkpoint(self) -> None: ...


class EvaluatorAdapter(Protocol):
    async def evaluate(
        self,
        config_snapshot: Mapping[str, Any],
        samples: Sequence[Mapping[str, Any]],
        checkpoint: EvaluationCheckpoint,
    ) -> Sequence[Mapping[str, Any]]: ...
