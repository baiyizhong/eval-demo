import json
import re
from typing import Any

from eval_platform_worker.evaluators.base import EvaluationInput, EvaluationResult, Evaluator


MAX_REGEX_PATTERN_LENGTH = 256
MAX_REGEX_OUTPUT_LENGTH = 10000


class RuleEvaluator(Evaluator):
    def __init__(self, config: dict[str, Any]):
        self.config = config

    async def evaluate(self, input: EvaluationInput) -> EvaluationResult:
        rule = self.config.get("rule")
        output = "" if input.output is None else str(input.output)

        if rule == "json_valid":
            return self._json_valid(output)
        if rule == "contains_keyword":
            keyword = str(self.config.get("keyword", ""))
            passed = keyword in output if keyword else False
            return EvaluationResult(
                score=1.0 if passed else 0.0,
                passed=passed,
                reason="Keyword found" if passed else "Keyword not found",
            )
        if rule == "regex_match":
            pattern = str(self.config.get("pattern", ""))
            if len(pattern) > MAX_REGEX_PATTERN_LENGTH:
                return EvaluationResult(
                    score=0.0,
                    passed=False,
                    reason="Regex pattern is too long",
                )
            if len(output) > MAX_REGEX_OUTPUT_LENGTH:
                return EvaluationResult(
                    score=0.0,
                    passed=False,
                    reason="Regex input is too long",
                )
            try:
                passed = bool(pattern and re.search(pattern, output))
            except re.error as exc:
                return EvaluationResult(score=0.0, passed=False, reason=f"Invalid regex: {exc}")
            return EvaluationResult(
                score=1.0 if passed else 0.0,
                passed=passed,
                reason="Pattern matched" if passed else "Pattern not matched",
            )
        return EvaluationResult(score=0.0, passed=False, reason=f"Unsupported rule: {rule}")

    def _json_valid(self, output: str) -> EvaluationResult:
        try:
            json.loads(output)
        except json.JSONDecodeError as exc:
            return EvaluationResult(score=0.0, passed=False, reason=f"Invalid JSON: {exc.msg}")
        return EvaluationResult(score=1.0, passed=True, reason="Output is valid JSON")
