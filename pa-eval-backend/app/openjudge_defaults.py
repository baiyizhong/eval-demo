from datetime import datetime, timezone
from typing import Any


DEFAULT_OPENJUDGE_EVALUATOR_ID = "paeval_default_openjudge"

_DEFAULT_VARIABLES = ["input", "output", "expected_output", "context"]
_DEFAULT_OUTPUT_VARIABLE_MAPPINGS = [
    {
        "variableName": "score",
        "scoreConfigName": "openjudge_score",
    }
]
_DEFAULT_INPUT_MAPPING = {
    "input": "{{ sample.input }}",
    "output": "{{ sample.output }}",
    "expected_output": "{{ sample.expectedOutput }}",
    "context": "{{ sample.context }}",
}
_MULTITURN_VARIABLES = ["history", "output", "input", "context"]
_MULTITURN_INPUT_MAPPING = {
    "history": "{{ sample.datasetItem.input.history }}",
    "output": "{{ sample.output }}",
    "input": "{{ sample.input }}",
    "context": "{{ sample.context }}",
}
_TRAJECTORY_VARIABLES = ["messages", "input", "output", "context"]
_TRAJECTORY_INPUT_MAPPING = {
    "messages": "{{ sample.datasetItem.input.messages }}",
    "input": "{{ sample.input }}",
    "output": "{{ sample.output }}",
    "context": "{{ sample.context }}",
}

OPENJUDGE_DEFAULT_GRADERS = [
    {
        "suffix": "",
        "name": "OpenJudge 正确性评估器",
        "grader": "correctness",
        "evaluationScenario": "SINGLE_TURN",
        "description": "内置 CorrectnessGrader，对比参考答案评估回答事实和关键点是否正确。",
    },
    {
        "suffix": "relevance",
        "name": "OpenJudge 相关性评估器",
        "grader": "relevance",
        "evaluationScenario": "SINGLE_TURN",
        "description": "内置 RelevanceGrader，评估回答是否切中用户问题并保持主题相关。",
    },
    {
        "suffix": "instruction_following",
        "name": "OpenJudge 指令遵循评估器",
        "grader": "instruction_following",
        "evaluationScenario": "SINGLE_TURN",
        "description": "内置 InstructionFollowingGrader，评估回答是否遵循输入指令。",
    },
    {
        "suffix": "hallucination",
        "name": "OpenJudge 幻觉评估器",
        "grader": "hallucination",
        "evaluationScenario": "RAG_FACTUALITY",
        "description": "内置 HallucinationGrader，结合上下文和参考答案评估幻觉风险。",
    },
    {
        "suffix": "harmfulness",
        "name": "OpenJudge 安全性评估器",
        "grader": "harmfulness",
        "evaluationScenario": "SAFETY",
        "description": "内置 HarmfulnessGrader，评估回答是否包含有害或不安全内容。",
    },
    {
        "suffix": "helpfulness",
        "name": "OpenJudge 有用性评估器",
        "grader": "helpfulness",
        "evaluationScenario": "SINGLE_TURN",
        "description": "内置 ResponseHelpfulnessGrader，评估回答对用户问题的帮助程度。",
    },
    {
        "suffix": "completeness",
        "name": "OpenJudge 完整性评估器",
        "grader": "completeness",
        "evaluationScenario": "SINGLE_TURN",
        "description": "内置 ResponseCompletenessGrader，评估回答是否覆盖必要信息。",
    },
    {
        "suffix": "context_memory",
        "name": "OpenJudge 多轮上下文记忆评估器",
        "grader": "context_memory",
        "evaluationScenario": "MULTI_TURN",
        "variables": _MULTITURN_VARIABLES,
        "inputMapping": _MULTITURN_INPUT_MAPPING,
        "description": "内置 ContextMemoryGrader，评估多轮对话中是否准确记住并使用早期上下文。",
    },
    {
        "suffix": "trajectory_accuracy",
        "name": "OpenJudge 工具调用轨迹评估器",
        "grader": "trajectory_accuracy",
        "evaluationScenario": "TOOL_CALLING",
        "variables": _TRAJECTORY_VARIABLES,
        "inputMapping": _TRAJECTORY_INPUT_MAPPING,
        "threshold": 2,
        "scoreScaleMax": 3,
        "description": "内置 TrajectoryAccuracyGrader，评估包含工具调用的 Agent 轨迹是否完成任务目标。",
    },
]


def default_openjudge_evaluator_id(suffix: str) -> str:
    return (
        DEFAULT_OPENJUDGE_EVALUATOR_ID
        if not suffix
        else f"{DEFAULT_OPENJUDGE_EVALUATOR_ID}_{suffix}"
    )


def is_default_openjudge_evaluator_id(evaluator_id: str) -> bool:
    return any(
        evaluator_id == default_openjudge_evaluator_id(str(item["suffix"]))
        for item in OPENJUDGE_DEFAULT_GRADERS
    )


def default_openjudge_evaluator_payloads(
    project_id: str,
    project_name: str = "当前项目",
) -> list[dict[str, Any]]:
    return [
        _default_openjudge_evaluator_payload(item, project_id, project_name)
        for item in OPENJUDGE_DEFAULT_GRADERS
    ]


def default_openjudge_evaluator_payload(
    project_id: str,
    project_name: str = "当前项目",
    evaluator_id: str = DEFAULT_OPENJUDGE_EVALUATOR_ID,
) -> dict[str, Any]:
    for item in OPENJUDGE_DEFAULT_GRADERS:
        if evaluator_id == default_openjudge_evaluator_id(str(item["suffix"])):
            return _default_openjudge_evaluator_payload(
                item,
                project_id,
                project_name,
            )
    raise KeyError(evaluator_id)


def default_openjudge_evaluator_config(
    grader: str = "correctness",
    *,
    evaluation_scenario: str = "SINGLE_TURN",
    input_mapping: dict[str, str] | None = None,
    threshold: int | float = 3,
    score_scale_max: int | float = 5,
) -> dict[str, Any]:
    config = {
        "sdkPackage": "openjudge",
        "grader": grader,
        "evaluationScenario": evaluation_scenario,
        "threshold": threshold,
        "scoreScaleMax": score_scale_max,
        "inputMapping": dict(input_mapping or _DEFAULT_INPUT_MAPPING),
        "outputMapping": {},
        "outputVariableMappings": list(_DEFAULT_OUTPUT_VARIABLE_MAPPINGS),
    }
    return config


def default_openjudge_evaluator_for_run(
    project_id: str,
    evaluator_id: str = DEFAULT_OPENJUDGE_EVALUATOR_ID,
) -> dict[str, Any]:
    payload = default_openjudge_evaluator_payload(project_id, evaluator_id=evaluator_id)
    return {
        "id": payload["id"],
        "name": payload["name"],
        "type": payload["type"],
        "provider": payload["provider"],
        "version": 1,
        "variables": payload["variables"],
        "output_variables": payload["outputVariables"],
        "config": payload["config"],
    }


def _default_openjudge_evaluator_payload(
    item: dict[str, Any],
    project_id: str,
    project_name: str,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00",
        "Z",
    )
    suffix = str(item["suffix"])
    grader = str(item["grader"])
    variables = list(item.get("variables", _DEFAULT_VARIABLES))
    return {
        "id": default_openjudge_evaluator_id(suffix),
        "name": item["name"],
        "type": "SDK",
        "version": "v1",
        "variables": variables,
        "inputVariables": variables,
        "outputVariables": ["score"],
        "outputVariableMappings": list(_DEFAULT_OUTPUT_VARIABLE_MAPPINGS),
        "description": item["description"],
        "provider": "OPENJUDGE",
        "evaluationScenario": item.get("evaluationScenario", "SINGLE_TURN"),
        "projectId": project_id,
        "projectName": project_name,
        "usageCount": 0,
        "updatedAt": now,
        "isBuiltin": True,
        "config": default_openjudge_evaluator_config(
            grader,
            evaluation_scenario=str(item.get("evaluationScenario", "SINGLE_TURN")),
            input_mapping=item.get("inputMapping"),
            threshold=item.get("threshold", 3),
            score_scale_max=item.get("scoreScaleMax", 5),
        ),
    }
