import pytest

from eval_platform_worker.evaluators.base import EvaluationInput
from eval_platform_worker.evaluators.rule import RuleEvaluator


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
