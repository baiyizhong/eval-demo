from eval_platform_worker.evaluators.base import EvaluationInput
from eval_platform_worker.evaluators.rule import RuleEvaluator


async def evaluate_task_item(
    evaluator_type: str,
    evaluator_config: dict,
    evaluation_input: dict,
) -> dict:
    if evaluator_type != "rule":
        raise ValueError(f"Unsupported evaluator type for first worker job: {evaluator_type}")

    evaluator = RuleEvaluator(evaluator_config)
    result = await evaluator.evaluate(EvaluationInput(**evaluation_input))
    return result.model_dump()
