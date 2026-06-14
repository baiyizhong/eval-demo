import pytest

from eval_platform_worker.jobs.evaluate_task import evaluate_task_item


@pytest.mark.asyncio
async def test_evaluate_task_item_with_rule_evaluator():
    result = await evaluate_task_item(
        evaluator_type="rule",
        evaluator_config={"rule": "contains_keyword", "keyword": "安全"},
        evaluation_input={"output": "安全回答"},
    )

    assert result["score"] == 1.0
    assert result["passed"] is True
