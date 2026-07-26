# Skill 评估器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 pa-eval-backend 引入 `SKILL` 类型评估器，支持以 Skill 形式定义完全自定义的评估流程；Skill 是项目级动态隔离的，由 pi-mono 作为 Agent 执行器承载，支持调用工具和多步推理；评估结果写入 Langfuse `scores`。

**Architecture:** SKILL 评估器作为现有 `_run_auto_evaluation_background` 的新增分支接入，与 OpenJudge 分支并列。新增 `SkillStore` 管理 Skill 目录和上传，新增 `SkillRpcClient` 通过子进程调用 `pi --mode rpc` 与 pi-mono 通信。Skill 配置存储在 `pa_evaluators.config` JSONB，不新增数据库表。容器镜像内置 pi-mono 运行时。

**Tech Stack:** Python 3.11+、FastAPI、asyncio subprocess、pi-mono（Node.js CLI）、Docker multi-stage build、uv、pytest。

---

## 文件结构

- Create: `pa-eval-backend/app/skill_store.py`：Skill 目录管理、上传校验、列表查询。
- Create: `pa-eval-backend/app/evaluation_runtime/skill_runner.py`：`SkillRpcClient` 与 `_run_skill_batch_evaluator`。
- Create: `pa-eval-backend/app/skills.py`：Skill 管理 API 路由。
- Create: `pa-eval-backend/Dockerfile`：多阶段构建，内置 pi-mono。
- Create: `docker-compose.pa-eval.yml`：pa-eval-backend 服务编排。
- Create: `skills/builtin/single-turn-quality/SKILL.md`：预置 Skill 示例。
- Modify: `pa-eval-backend/app/evaluators.py`：新增 `SKILL`/`PI` 类型、校验、`to_storage_payload`。
- Modify: `pa-eval-backend/app/auto_evaluations.py`：新增 `_is_skill_evaluator`、SKILL 分支接入。
- Modify: `pa-eval-backend/app/config.py`：新增 Skill 相关配置项。
- Modify: `pa-eval-backend/app/main.py`：注册 Skill 管理路由。
- Modify: `pa-eval-backend/app/langfuse_db.py`：`_to_pa_evaluator_payload` 支持 SKILL 类型序列化。
- Modify: `pa-eval-frontend`：评估器表单和 Skill 管理页面（另见前端计划）。

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│ pa-eval-frontend                                            │
│   评估器管理（SKILL 类型）│ Skill 上传 │ 触发评测            │
└──────────┬──────────────────────────────────┬──────────────┘
           │ REST                              │
┌──────────▼──────────────────────────────────▼──────────────┐
│ pa-eval-backend                                             │
│                                                             │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────────┐   │
│  │ Evaluators │  │ SkillStore  │  │ SkillRpcClient     │   │
│  │ (SKILL)    │  │ (目录管理)  │  │ (pi subprocess)    │   │
│  └─────┬──────┘  └──────┬──────┘  └─────────┬──────────┘   │
│        └────────┬───────┴────────────────────┘             │
│                 │                                          │
│       ┌─────────▼────────────┐    ┌─────────────────────┐  │
│       │_run_auto_eval_bg     │───▶│ Langfuse scores     │  │
│       │ (SKILL 分支)         │    │ (ClickHouse 写入)   │  │
│       └──────────────────────┘    └─────────────────────┘  │
└──────────────────┬────────────────────────────────────────┘
                   │ asyncio.create_subprocess_exec
┌──────────────────▼────────────────────────────────────────┐
│ pi-mono (Node.js 子进程，容器内)                           │
│   加载 Skill → 读取样本 → 调工具评估 → 输出 JSON 评分      │
└───────────────────────────────────────────────────────────┘
```

---

## Task 1: 配置项与 Skill 根目录

**Files:**
- Modify: `pa-eval-backend/app/config.py`
- Modify: `pa-eval-backend/.env.example`

- [ ] **Step 1: 新增 Skill 相关配置项**

在 `Settings` 类中新增：

```python
pa_eval_skill_root: str = "/var/lib/pa-eval/skills"
pa_eval_skill_builtin_dir: str = ""              # 留空则用 <root>/_builtin
pa_eval_pi_binary: str = "pi"
pa_eval_pi_model: str = ""                        # 默认模型，空则用项目默认评估模型
pa_eval_pi_rpc_timeout: int = 300                 # 单次 Skill 调用超时（秒）
pa_eval_pi_max_concurrency: int = 4               # 并发 pi 进程上限
pa_eval_pi_workdir: str = "/tmp/pa-eval-skill"    # pi 子进程工作目录
```

- [ ] **Step 2: 更新 `.env.example`**

```env
PA_EVAL_SKILL_ROOT=/var/lib/pa-eval/skills
PA_EVAL_PI_BINARY=pi
PA_EVAL_PI_MODEL=
PA_EVAL_PI_RPC_TIMEOUT=300
PA_EVAL_PI_MAX_CONCURRENCY=4
PA_EVAL_PI_WORKDIR=/tmp/pa-eval-skill
```

---

## Task 2: 评估器类型扩展

**Files:**
- Modify: `pa-eval-backend/app/evaluators.py`

- [ ] **Step 1: 扩展类型枚举**

```python
EvaluatorType = Literal["LLM_AS_JUDGE", "CODE", "WORKFLOW", "SDK", "SKILL"]
EvaluatorProvider = Literal["LANGFUSE", "DIFY", "HIAGENT", "N8N", "OPENJUDGE", "PI"]
```

- [ ] **Step 2: 新增 SKILL 校验分支**

在 `CreateEvaluatorPayload.validate_by_type` 中增加：

```python
if self.type == "SKILL":
    if self.provider != "PI":
        raise ValueError("Skill 评估器 provider 必须为 PI")
    if not self.endpoint_url:
        raise ValueError("Skill 评估器必须选择 skill")
```

- [ ] **Step 3: 新增 SKILL `to_storage_payload` 分支**

```python
if self.type == "SKILL":
    return {
        **base,
        "config": {
            "evaluationScenario": self.evaluation_scenario,
            "skillName": self.endpoint_url,
            "modelConfig": self.model_config_payload.model_dump() if self.model_config_payload else None,
            "inputMapping": normalize_sample_mapping(self.input_mapping, self.input_variables),
            "outputMapping": self.output_mapping or {},
            "outputVariableMappings": self._output_variable_mappings(),
        },
    }
```

- [ ] **Step 4: 更新列表查询的 type 过滤正则**

```python
evaluator_type: str | None = Query(
    default=None,
    alias="type",
    pattern="^(LLM_AS_JUDGE|CODE|WORKFLOW|SDK|SKILL)$",
),
```

---

## Task 3: Skill 目录管理

**Files:**
- Create: `pa-eval-backend/app/skill_store.py`

- [ ] **Step 1: 实现 `SkillStore` 类**

```python
class SkillStore:
    def __init__(self, skill_root: str, builtin_dir: str | None = None):
        self._root = Path(skill_root)
        self._builtin_dir = Path(builtin_dir) if builtin_dir else self._root / "_builtin"

    def _project_dir(self, project_id: str) -> Path:
        return self._root / project_id

    def _validate_skill_name(self, name: str) -> None:
        if not re.match(r"^[a-z0-9-]+$", name) or len(name) > 64:
            raise BusinessError(4001, f"无效的 skill 名称: {name}")
        if ".." in name or "/" in name:
            raise BusinessError(4001, "skill 名称包含非法字符")

    def list_skills(self, project_id: str) -> list[dict[str, Any]]:
        """列出项目可用 Skill，合并预置和项目自定义。"""

    def get_skill_detail(self, project_id: str, name: str) -> dict[str, Any]:
        """返回 SKILL.md 内容和 frontmatter 元信息。"""

    async def upload_skill(
        self, project_id: str, name: str, file_bytes: bytes, filename: str, overwrite: bool
    ) -> dict[str, Any]:
        """校验压缩包、解压、校验 SKILL.md、部署到项目目录。"""

    def delete_skill(self, project_id: str, name: str) -> None:
        """删除项目自定义 Skill；预置 Skill 返回错误。"""

    def skill_path(self, project_id: str, name: str) -> Path:
        """返回 Skill 目录绝对路径，供 SkillRpcClient 使用。"""

    def skill_dirs_for_project(self, project_id: str) -> list[Path]:
        """返回项目可用的所有 Skill 目录（项目 + 预置），供 pi 加载。"""
```

- [ ] **Step 2: 实现压缩包校验逻辑**

```python
def _extract_and_validate_skill(archive_bytes: bytes, filename: str, expected_name: str) -> tuple[bytes, dict]:
    """
    1. 识别 zip/tar.gz
    2. 解压到临时目录
    3. 校验顶层必须包含 SKILL.md
    4. 解析 frontmatter，校验 name 与 expected_name 一致
    5. 返回重新打包的目录字节和元信息
    """
```

- [ ] **Step 3: 实现 frontmatter 解析**

```python
def _parse_skill_frontmatter(skill_md_content: str) -> dict[str, Any]:
    """解析 SKILL.md 的 YAML frontmatter，返回 name/description/variables 等。"""
```

---

## Task 4: Skill 管理 API

**Files:**
- Create: `pa-eval-backend/app/skills.py`
- Modify: `pa-eval-backend/app/main.py`

- [ ] **Step 1: 实现 API 路由**

```python
router = APIRouter(prefix="/api/projects/{project_id}/skills", tags=["skills"])

@router.get("")
async def list_skills(project_id: str, ...) -> dict[str, Any]:
    """列出项目可用 Skill。"""

@router.get("/{skill_name}")
async def get_skill(project_id: str, skill_name: str, ...) -> dict[str, Any]:
    """Skill 详情。"""

@router.post("")
async def upload_skill(
    project_id: str,
    name: str = Form(...),
    overwrite: bool = Form(default=False),
    file: UploadFile = File(...),
    ...
) -> dict[str, Any]:
    """上传 Skill。"""

@router.delete("/{skill_name}")
async def delete_skill(project_id: str, skill_name: str, ...) -> dict[str, Any]:
    """删除项目自定义 Skill。"""
```

- [ ] **Step 2: 在 main.py 注册路由**

```python
from app.skills import router as skills_router
app.include_router(skills_router)
```

---

## Task 5: SkillRpcClient（pi-mono 子进程通信）

**Files:**
- Create: `pa-eval-backend/app/evaluation_runtime/skill_runner.py`

- [ ] **Step 1: 定义数据结构**

```python
@dataclass
class SkillEvaluationInput:
    sample_id: str
    trace_id: str | None
    input: str
    output: str
    expected_output: str
    context: str
    messages: list[dict] | None
    metadata: dict

@dataclass
class SkillEvaluationResult:
    sample_id: str
    scores: list[dict]
    passed: bool
    reason: str
    raw: dict
```

- [ ] **Step 2: 实现 `SkillRpcClient`**

```python
class SkillRpcClient:
    def __init__(
        self,
        binary: str,
        skill_dirs: list[str],
        model: str,
        workdir: str,
        timeout: int,
    ): ...

    async def start(self) -> None:
        """asyncio.create_subprocess_exec 启动 pi --mode rpc"""
        cmd = [
            self._binary, "--mode", "rpc",
            "--no-session",
            "--no-skills",
        ]
        for d in self._skill_dirs:
            cmd.extend(["--skill", d])
        if self._model:
            cmd.extend(["--model", self._model])
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
        inputs: list[SkillEvaluationInput],
        output_schema: dict | None = None,
    ) -> list[SkillEvaluationResult]:
        """
        1. 构造 prompt: /skill:<skill_name> + 样本 JSON + 输出格式约定
        2. 发送 {"type":"prompt", "message": ...}
        3. 逐行读 stdout JSON，收集事件直到 agent_end
        4. 从最终 assistant message 文本中解析 JSON 数组
        """

    async def close(self) -> None:
        """关闭 stdin，等待进程退出，超时则 kill。"""
```

- [ ] **Step 3: 实现 RPC 事件解析**

```python
async def _read_until_agent_end(
    stdout: asyncio.StreamReader, timeout: int
) -> list[dict[str, Any]]:
    """
    逐行读取 stdout JSON 事件，直到收到 agent_end。
    收集所有 assistant message 的文本内容。
    超时则抛出 TimeoutError。
    """
```

- [ ] **Step 4: 实现结果 JSON 解析**

```python
def _parse_skill_results(
    agent_messages: list[dict[str, Any]],
    expected_sample_ids: set[str],
) -> list[SkillEvaluationResult]:
    """
    从 assistant message 文本中提取 JSON 数组，解析为 SkillEvaluationResult。
    复用 _json_object_from_text 解析逻辑。
    校验 sampleId 与输入一致。
    """
```

---

## Task 6: 批量评估接入

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluations.py`

- [ ] **Step 1: 新增 `_is_skill_evaluator`**

```python
def _is_skill_evaluator(evaluator: dict[str, Any]) -> bool:
    return evaluator.get("type") == "SKILL" and evaluator.get("provider") == "PI"
```

- [ ] **Step 2: 实现 `_run_skill_batch_evaluator`**

```python
async def _run_skill_batch_evaluator(
    evaluator: dict[str, Any],
    samples: list[dict[str, Any]],
    payload: CreateAutoEvaluationPayload,
    settings: Settings,
    project_id: str,
) -> tuple[list[dict[str, Any]], int, list[str]]:
    """
    1. 从 evaluator.config 读 skillName / modelConfig
    2. 构造 SkillEvaluationInput 列表（复用 _normalize_dataset_item_sample）
    3. 解析 Skill 路径
    4. 启动 SkillRpcClient
    5. 批量评估
    6. 解析输出 -> _parse_workflow_result
    7. 返回 results, failed_count, error_messages
    """
```

- [ ] **Step 3: 在 `_run_auto_evaluation_background` 中接入分支**

在 `_run_auto_evaluation_background` 的 OpenJudge 分支后、else 分支前插入：

```python
elif _is_skill_evaluator(evaluator):
    results, failed_count, error_messages = await _run_skill_batch_evaluator(
        evaluator, samples, payload, settings, project_id,
    )
    completed_count = len(results)
    await _persist_auto_evaluation_progress(
        settings,
        project_id=project_id,
        task_id=task_id,
        run_id=run_id,
        sample_count=sample_count,
        completed_count=completed_count,
        failed_count=failed_count,
        running_count=0,
        updated_by=updated_by,
    )
```

- [ ] **Step 4: 实现样本归一化适配**

```python
def _normalize_sample_for_skill(
    sample: dict[str, Any], source_type: str
) -> SkillEvaluationInput:
    """
    source_type: "TRACE" | "DATASET"
    DATASET 来源：复用 _normalize_dataset_item_sample
    TRACE 来源：从完整 trace 构造，包含 observations、span 树、工具调用记录
    """
```

---

## Task 7: 容器化

**Files:**
- Create: `pa-eval-backend/Dockerfile`
- Create: `docker-compose.pa-eval.yml`
- Create: `skills/builtin/single-turn-quality/SKILL.md`

- [ ] **Step 1: 编写 Dockerfile（多阶段构建）**

```dockerfile
FROM node:24-bookworm-slim AS pi-base
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

FROM python:3.12-slim
COPY --from=pi-base /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=pi-base /usr/local/bin/pi /usr/local/bin/pi
COPY --from=pi-base /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
  && apt-get install -y --no-install-recommends ripgrep git \
  && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen --no-dev
COPY app ./app
COPY migrations ./migrations
VOLUME ["/var/lib/pa-eval/skills"]
ENV PA_EVAL_SKILL_ROOT=/var/lib/pa-eval/skills
ENV PA_EVAL_PI_BINARY=pi
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: 编写 docker-compose 配置**

```yaml
# docker-compose.pa-eval.yml
services:
  pa-eval-backend:
    build:
      context: ./pa-eval-backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - skill-store:/var/lib/pa-eval/skills
      - ./skills/builtin:/var/lib/pa-eval/skills/_builtin:ro
    environment:
      - PA_EVAL_SKILL_ROOT=/var/lib/pa-eval/skills
      - PA_EVAL_PI_BINARY=pi
      - PA_EVAL_PI_MODEL=${PA_EVAL_PI_MODEL}
    depends_on:
      - langfuse-web
      - redis

volumes:
  skill-store:
```

启动命令：

```bash
docker compose \
  -f docker-compose.langfuse.yml \
  -f docker-compose.langfuse.override.yml \
  -f docker-compose.pa-eval.yml up -d
```

- [ ] **Step 3: 编写预置 Skill 示例**

```markdown
---
name: single-turn-quality
description: 评估单轮问答的回答质量，从准确性、完整性、相关性三个维度评分。适用于单轮 QA 场景。
---

# 单轮问答质量评估

## 输入
你会收到一个 JSON 数组，每个元素包含：
- input: 用户问题
- output: 待评估回答
- expectedOutput: 参考答案（可选）
- context: 上下文（可选）

## 评估要求
对每个样本从以下维度评分（0-1）：
- accuracy: 事实准确性
- completeness: 回答完整性
- relevance: 与问题相关性

## 输出格式
输出严格 JSON 数组，每元素：
```json
{
  "sampleId": "与输入一致",
  "scores": [
    {"name": "accuracy", "value": 0.0, "comment": "说明"},
    {"name": "completeness", "value": 0.0, "comment": "说明"},
    {"name": "relevance", "value": 0.0, "comment": "说明"}
  ],
  "passed": true,
  "reason": "总体评价"
}
```
```

---

## Task 8: 测试

**Files:**
- Create: `pa-eval-backend/tests/test_skill_store.py`
- Create: `pa-eval-backend/tests/evaluation_runtime/test_skill_runner.py`

- [ ] **Step 1: SkillStore 单元测试**

测试点：
- 名称校验（合法/非法字符/路径穿越）
- 列表查询（合并预置和项目）
- 上传（zip/tar.gz 解压、frontmatter 校验、覆盖逻辑）
- 删除（预置不可删、项目可删）

- [ ] **Step 2: SkillRpcClient 单元测试**

测试点（mock subprocess）：
- 启动命令构造（`--skill` 参数）
- RPC 事件流解析（模拟 stdout JSON 行）
- 结果 JSON 解析（合法/缺失字段/格式错误）
- 超时处理
- 进程清理

---

## 验收标准

- [ ] SKILL 评估器可在评估器列表中创建、查看。
- [ ] Skill 可上传、列表、查看详情、删除。
- [ ] 预置 Skill 只读，项目 Skill 可增删。
- [ ] SKILL 评估器接入自动评测任务，能执行批量评估。
- [ ] 评分写入 Langfuse `scores`，报告正常生成。
- [ ] 容器镜像内置 pi-mono，`docker compose up` 可拉起完整服务。
- [ ] Skill 路径校验防止目录穿越。
- [ ] 单次评估超时和并发数受配置控制。

---

## 风险与注意点

- **pi-mono 依赖 Node.js 运行时**：镜像体积增大约 200MB，可接受；后续可考虑精简 node_modules。
- **Skill 执行成本高**：每批样本要跑 Agent 循环，延迟和 token 成本远高于 LLM_AS_JUDGE；适合复杂场景，简单场景用现有评估器。
- **Skill 确定性**：Agent 行为不完全确定，同一样本可能得到不同评分；`raw` 字段记录 session_id 便于回溯。
- **容器安全**：Skill 可执行任意代码，由容器限制爆炸半径，内容由部署方人工保证。
- **pi-mono 版本锁定**：`npm install -g` 固定版本，避免上游 breaking change。
