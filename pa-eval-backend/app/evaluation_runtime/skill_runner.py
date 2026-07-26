import asyncio
import json
import logging
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.errors import BusinessError

logger = logging.getLogger(__name__)

_SKILL_OUTPUT_INSTRUCTION = (
    "请对每个样本进行评估，最终输出严格 JSON 数组（不要包含 markdown 代码块标记），"
    "每元素必须包含字段：sampleId（与输入一致）、scores（数组，每项含 name/value/comment）、"
    "passed（布尔）、reason（字符串）。"
)


@dataclass(frozen=True, slots=True)
class SkillEvaluationInput:
    sample_id: str
    trace_id: str | None = None
    input: str = ""
    output: str = ""
    expected_output: str = ""
    context: str = ""
    messages: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class SkillEvaluationResult:
    sample_id: str
    scores: list[dict[str, Any]]
    passed: bool
    reason: str
    raw: dict[str, Any]


class SkillRpcClient:
    """管理与 pi --mode rpc 子进程的通信。"""

    def __init__(
        self,
        binary: str,
        skill_dirs: list[str],
        model: str,
        workdir: str,
        timeout: int,
    ) -> None:
        self._binary = binary
        self._skill_dirs = skill_dirs
        self._model = model
        self._workdir = workdir
        self._timeout = timeout
        self._process: asyncio.subprocess.Process | None = None

    async def start(self) -> None:
        Path(self._workdir).mkdir(parents=True, exist_ok=True)
        cmd: list[str] = [
            self._binary,
            "--mode",
            "rpc",
            "--no-session",
            "--no-skills",
        ]
        for skill_dir in self._skill_dirs:
            cmd.extend(["--skill", skill_dir])
        if self._model:
            cmd.extend(["--model", self._model])

        logger.info("starting pi rpc: %s", " ".join(cmd))
        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._workdir,
        )

    async def evaluate(
        self,
        skill_name: str,
        inputs: Sequence[SkillEvaluationInput],
    ) -> list[SkillEvaluationResult]:
        if self._process is None or self._process.stdin is None:
            raise BusinessError(5001, "pi rpc 子进程未启动")
        if not inputs:
            return []

        prompt_message = self._build_prompt(skill_name, inputs)
        request = {"type": "prompt", "message": prompt_message}
        line = json.dumps(request, ensure_ascii=False) + "\n"
        self._process.stdin.write(line.encode("utf-8"))
        await self._process.stdin.drain()

        agent_messages = await self._read_until_agent_end()
        expected_ids = {item.sample_id for item in inputs}
        return _parse_skill_results(agent_messages, expected_ids)

    async def close(self) -> None:
        if self._process is None:
            return
        try:
            if self._process.stdin is not None:
                self._process.stdin.close()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5)
            except TimeoutError:
                self._process.kill()
                await self._process.wait()
        finally:
            self._process = None

    def _build_prompt(
        self,
        skill_name: str,
        inputs: Sequence[SkillEvaluationInput],
    ) -> str:
        samples_json = json.dumps(
            [_input_to_dict(item) for item in inputs],
            ensure_ascii=False,
            indent=2,
        )
        return (
            f"/skill:{skill_name}\n\n"
            f"以下是待评估的样本数组：\n\n{samples_json}\n\n"
            f"{_SKILL_OUTPUT_INSTRUCTION}"
        )

    async def _read_until_agent_end(self) -> list[dict[str, Any]]:
        assert self._process is not None
        assert self._process.stdout is not None
        assistant_texts: list[str] = []
        raw_events: list[dict[str, Any]] = []
        try:
            while True:
                raw_line = await asyncio.wait_for(
                    self._process.stdout.readline(), timeout=self._timeout
                )
                if not raw_line:
                    break
                line_text = raw_line.decode("utf-8", errors="replace").strip()
                if not line_text:
                    continue
                try:
                    event = json.loads(line_text)
                except json.JSONDecodeError:
                    logger.debug("ignoring non-json stdout line: %s", line_text[:100])
                    continue
                raw_events.append(event)
                if event.get("type") == "agent_end":
                    _extract_assistant_text(event, assistant_texts)
                    break
                if event.get("type") == "message_end":
                    _extract_assistant_text(event, assistant_texts)
        except TimeoutError as exc:
            raise BusinessError(
                5002,
                f"pi rpc 评估超时（{self._timeout}s）",
                504,
            ) from exc
        return [{"text": text} for text in assistant_texts]


def _extract_assistant_text(
    event: Mapping[str, Any], sink: list[str]
) -> None:
    message = event.get("message")
    if not isinstance(message, Mapping):
        return
    if message.get("role") != "assistant":
        return
    content = message.get("content")
    if isinstance(content, list):
        for block in content:
            if (
                isinstance(block, Mapping)
                and block.get("type") == "text"
                and isinstance(block.get("text"), str)
            ):
                sink.append(block["text"])
    elif isinstance(content, str):
        sink.append(content)


def _input_to_dict(item: SkillEvaluationInput) -> dict[str, Any]:
    return {
        "sampleId": item.sample_id,
        "traceId": item.trace_id,
        "input": item.input,
        "output": item.output,
        "expectedOutput": item.expected_output,
        "context": item.context,
        "messages": item.messages,
        "metadata": item.metadata,
    }


def _parse_skill_results(
    agent_messages: list[Mapping[str, Any]],
    expected_sample_ids: set[str],
) -> list[SkillEvaluationResult]:
    parsed: list[dict[str, Any]] = []
    last_error: str | None = None
    for message in agent_messages:
        text = message.get("text")
        if not isinstance(text, str):
            continue
        try:
            data = _json_object_from_text(text)
        except ValueError:
            continue
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    parsed.append(item)
        elif isinstance(data, dict):
            parsed.append(data)

    results: list[SkillEvaluationResult] = []
    for item in parsed:
        sample_id = str(item.get("sampleId") or "").strip()
        if not sample_id or sample_id not in expected_sample_ids:
            continue
        scores = item.get("scores")
        if not isinstance(scores, list):
            scores = []
        passed_value = item.get("passed")
        if isinstance(passed_value, bool):
            passed = passed_value
        elif isinstance(passed_value, str):
            passed = passed_value.lower() == "true"
        else:
            passed = False
        reason = str(item.get("reason") or "")
        results.append(
            SkillEvaluationResult(
                sample_id=sample_id,
                scores=scores,
                passed=passed,
                reason=reason,
                raw={"agentOutput": item},
            )
        )

    if not results:
        detail = last_error or "agent 输出未包含可解析的评分 JSON"
        raise BusinessError(5003, f"skill 评估结果解析失败: {detail}")

    return results


def _json_object_from_text(text: str) -> Any:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    for candidate_start_chars in ("[", "{"):
        start = cleaned.find(candidate_start_chars)
        if start == -1:
            continue
        for end_char in ("]", "}"):
            end = cleaned.rfind(end_char)
            if end > start:
                try:
                    return json.loads(cleaned[start : end + 1])
                except json.JSONDecodeError:
                    continue
    raise ValueError("no JSON object found")
