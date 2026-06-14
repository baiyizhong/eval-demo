import asyncio
import multiprocessing
import queue

import pytest

from eval_platform_worker.evaluators.base import EvaluationInput
from eval_platform_worker.evaluators import rule as rule_module
from eval_platform_worker.evaluators.rule import MAX_REGEX_OUTPUT_LENGTH, MAX_REGEX_PATTERN_LENGTH, RuleEvaluator


def _evaluate_rule_in_process(
    config: dict[str, str],
    output: str,
    result_queue: multiprocessing.Queue,
) -> None:
    try:
        result = asyncio.run(RuleEvaluator(config).evaluate(EvaluationInput(output=output)))
    except BaseException as exc:
        result_queue.put({"error": repr(exc)})
        return
    result_queue.put({"score": result.score, "passed": result.passed, "reason": result.reason})


@pytest.mark.asyncio
async def test_rule_evaluator_checks_json_validity():
    evaluator = RuleEvaluator({"rule": "json_valid"})
    result = await evaluator.evaluate(EvaluationInput(output='{"ok": true}'))

    assert result.score == 1.0
    assert result.passed is True
    assert result.reason == "Output is valid JSON"


@pytest.mark.asyncio
async def test_rule_evaluator_checks_contains_keyword():
    evaluator = RuleEvaluator({"rule": "contains_keyword", "keyword": "安全"})
    result = await evaluator.evaluate(EvaluationInput(output="这是安全的回答"))

    assert result.score == 1.0
    assert result.passed is True
    assert result.reason == "Keyword found"


@pytest.mark.asyncio
async def test_rule_evaluator_rejects_invalid_json():
    evaluator = RuleEvaluator({"rule": "json_valid"})
    result = await evaluator.evaluate(EvaluationInput(output="{not json}"))

    assert result.score == 0.0
    assert result.passed is False
    assert result.reason.startswith("Invalid JSON:")


@pytest.mark.asyncio
async def test_rule_evaluator_reports_missing_keyword():
    evaluator = RuleEvaluator({"rule": "contains_keyword", "keyword": ""})
    result = await evaluator.evaluate(EvaluationInput(output="anything"))

    assert result.score == 0.0
    assert result.passed is False
    assert result.reason == "Keyword not found"


@pytest.mark.asyncio
async def test_rule_evaluator_reports_non_empty_keyword_not_found():
    evaluator = RuleEvaluator({"rule": "contains_keyword", "keyword": "安全"})
    result = await evaluator.evaluate(EvaluationInput(output="这是普通回答"))

    assert result.score == 0.0
    assert result.passed is False
    assert result.reason == "Keyword not found"


@pytest.mark.asyncio
async def test_rule_evaluator_matches_regex():
    evaluator = RuleEvaluator({"rule": "regex_match", "pattern": r"answer-\d+"})
    result = await evaluator.evaluate(EvaluationInput(output="final answer-42"))

    assert result.score == 1.0
    assert result.passed is True
    assert result.reason == "Pattern matched"


@pytest.mark.asyncio
async def test_rule_evaluator_reports_regex_no_match():
    evaluator = RuleEvaluator({"rule": "regex_match", "pattern": r"answer-\d+"})
    result = await evaluator.evaluate(EvaluationInput(output="final answer"))

    assert result.score == 0.0
    assert result.passed is False
    assert result.reason == "Pattern not matched"


def test_bounded_regex_search_uses_spawn_context(monkeypatch):
    original_get_context = multiprocessing.get_context
    requested_contexts: list[str | None] = []

    def tracking_get_context(method: str | None = None):
        requested_contexts.append(method)
        return original_get_context(method)

    monkeypatch.setattr(rule_module.multiprocessing, "get_context", tracking_get_context)

    result = rule_module._bounded_regex_search("answer", "final answer")

    assert requested_contexts == ["spawn"]
    assert result.status == "matched"
    assert result.error is None


@pytest.mark.asyncio
async def test_rule_evaluator_reports_invalid_regex():
    evaluator = RuleEvaluator({"rule": "regex_match", "pattern": "("})
    result = await evaluator.evaluate(EvaluationInput(output="anything"))

    assert result.score == 0.0
    assert result.passed is False
    assert result.reason.startswith("Invalid regex:")


@pytest.mark.asyncio
async def test_rule_evaluator_times_out_pathological_regex():
    ctx = multiprocessing.get_context("spawn")
    result_queue = ctx.Queue()
    process = ctx.Process(
        target=_evaluate_rule_in_process,
        args=({"rule": "regex_match", "pattern": r"(a+)+$"}, "a" * 30 + "!", result_queue),
    )
    process.start()

    try:
        await asyncio.wait_for(asyncio.to_thread(process.join), timeout=1.0)
    except TimeoutError:
        process.terminate()
        process.join()
        pytest.fail("Evaluator did not return before test timeout")

    assert process.exitcode == 0
    try:
        result = result_queue.get_nowait()
    except queue.Empty:
        pytest.fail("Evaluator process exited without returning a result")
    assert "error" not in result
    assert result["score"] == 0.0
    assert result["passed"] is False
    assert result["reason"] == "Regex evaluation timed out"


@pytest.mark.asyncio
async def test_rule_evaluator_rejects_too_long_regex_pattern():
    evaluator = RuleEvaluator({"rule": "regex_match", "pattern": "a" * (MAX_REGEX_PATTERN_LENGTH + 1)})
    result = await evaluator.evaluate(EvaluationInput(output="anything"))

    assert result.score == 0.0
    assert result.passed is False
    assert result.reason == "Regex pattern is too long"


@pytest.mark.asyncio
async def test_rule_evaluator_rejects_too_long_regex_input():
    evaluator = RuleEvaluator({"rule": "regex_match", "pattern": "a"})
    result = await evaluator.evaluate(EvaluationInput(output="a" * (MAX_REGEX_OUTPUT_LENGTH + 1)))

    assert result.score == 0.0
    assert result.passed is False
    assert result.reason == "Regex input is too long"


@pytest.mark.asyncio
async def test_rule_evaluator_reports_unsupported_rule():
    evaluator = RuleEvaluator({"rule": "unknown"})
    result = await evaluator.evaluate(EvaluationInput(output="anything"))

    assert result.score == 0.0
    assert result.passed is False
    assert result.reason == "Unsupported rule: unknown"
