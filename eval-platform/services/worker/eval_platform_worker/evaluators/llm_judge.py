from eval_platform_worker.evaluators.base import EvaluationInput, EvaluationResult, Evaluator


class LLMJudgeEvaluator(Evaluator):
    def __init__(self, config: dict):
        self.config = config

    async def evaluate(self, input: EvaluationInput) -> EvaluationResult:
        raise NotImplementedError("LLMJudgeEvaluator requires provider integration in the next task")
