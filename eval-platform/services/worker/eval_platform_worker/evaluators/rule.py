import asyncio
import json
import multiprocessing
import queue
import re
from dataclasses import dataclass
from typing import Any, Literal

from eval_platform_worker.evaluators.base import EvaluationInput, EvaluationResult, Evaluator


MAX_REGEX_PATTERN_LENGTH = 256
MAX_REGEX_OUTPUT_LENGTH = 10000
REGEX_TIMEOUT_SECONDS = 0.2

RegexSearchStatus = Literal["matched", "no_match", "invalid", "timeout"]


@dataclass(frozen=True)
class RegexSearchResult:
    status: RegexSearchStatus
    error: str | None = None


def _regex_search_worker(pattern: str, output: str, result_queue: multiprocessing.Queue) -> None:
    try:
        status: RegexSearchStatus = "matched" if re.search(pattern, output) else "no_match"
    except re.error as exc:
        result_queue.put(("invalid", str(exc)))
        return
    result_queue.put((status, None))


def _bounded_regex_search(pattern: str, output: str) -> RegexSearchResult:
    result_queue = multiprocessing.Queue(maxsize=1)
    process = multiprocessing.Process(target=_regex_search_worker, args=(pattern, output, result_queue))
    process.start()
    process.join(REGEX_TIMEOUT_SECONDS)

    if process.is_alive():
        process.terminate()
        process.join(0.05)
        if process.is_alive():
            process.kill()
            process.join()
        return RegexSearchResult(status="timeout")

    try:
        status, error = result_queue.get(timeout=0.05)
    except queue.Empty:
        return RegexSearchResult(status="invalid", error=f"worker exited with code {process.exitcode}")

    return RegexSearchResult(status=status, error=error)


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
            if not pattern:
                regex_result = RegexSearchResult(status="no_match")
            else:
                regex_result = await asyncio.to_thread(_bounded_regex_search, pattern, output)
            if regex_result.status == "invalid":
                return EvaluationResult(score=0.0, passed=False, reason=f"Invalid regex: {regex_result.error}")
            if regex_result.status == "timeout":
                return EvaluationResult(score=0.0, passed=False, reason="Regex evaluation timed out")
            passed = regex_result.status == "matched"
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
