from eval_platform_worker.evaluators.base import EvaluationInput, EvaluationResult, Evaluator


class OpenJudgeEvaluator(Evaluator):
    def __init__(self, config: dict):
        self.config = config

    async def evaluate(self, input: EvaluationInput) -> EvaluationResult:
        raise NotImplementedError("OpenJudgeEvaluator requires grader mapping in the next task")
