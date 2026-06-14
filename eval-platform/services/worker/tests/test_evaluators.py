import pytest

from eval_platform_worker.evaluators.base import EvaluationInput
from eval_platform_worker.evaluators.rule import MAX_REGEX_OUTPUT_LENGTH, MAX_REGEX_PATTERN_LENGTH, RuleEvaluator


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


@pytest.mark.asyncio
async def test_rule_evaluator_reports_invalid_regex():
    evaluator = RuleEvaluator({"rule": "regex_match", "pattern": "("})
    result = await evaluator.evaluate(EvaluationInput(output="anything"))

    assert result.score == 0.0
    assert result.passed is False
    assert result.reason.startswith("Invalid regex:")


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
