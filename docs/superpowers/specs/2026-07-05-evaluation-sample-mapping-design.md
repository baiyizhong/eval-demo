# 评测样本与字段映射设计

## 背景

当前自动评测同时需要支持 Langfuse 数据集和 Trace，但实现上仍把数据集样本硬编码为 `input/output/expected_output/context` 四个字段。前端虽然展示了变量映射选择，但创建任务时没有把 `variableMapping` 传给后端，后端也没有使用评估器 `config.inputMapping`。

## 目标

- 不修改 `langfuse/` 源码和 Langfuse 原生表结构。
- 复用 Langfuse `datasets`、`dataset_items`、Trace/Observation 数据。
- 让 Dify、n8n、HiAgent、OpenJudge、Skill Runner 后续都能使用同一套样本与映射协议。
- 数据集和 Trace 都先归一化为 PA Eval 内部 `EvaluationSample`，再映射到评估器入参。

## 内部样本模型

后端新增内部样本结构，先用 `dict[str, Any]` 落地，避免引入额外表：

```json
{
  "sourceType": "DATASET_ITEM",
  "sourceId": "item_xxx",
  "input": "用户问题",
  "output": "候选回答",
  "expectedOutput": "期望答案",
  "context": "上下文",
  "metadata": {},
  "trace": {},
  "observation": {},
  "datasetItem": {}
}
```

数据集来源：

- `dataset_items.input.input` 映射到 `sample.input`。
- `dataset_items.input.output` 映射到 `sample.output`。
- `dataset_items.expected_output` 映射到 `sample.expectedOutput`。
- `dataset_items.input.context` 或 `dataset_items.metadata.context` 映射到 `sample.context`。
- 原始 `dataset_items` 放入 `sample.datasetItem`。

Trace 来源第一阶段支持 `LAST_GENERATION` 策略：

- 从符合过滤条件的 Trace 中选最后一个 generation observation。
- observation input 映射到 `sample.input`。
- observation output 映射到 `sample.output`。
- expectedOutput 默认为空，允许通过映射从 metadata 或 trace 字段取值。
- trace/observation 原始摘要分别放入 `sample.trace`、`sample.observation`。

## 映射协议

评估器配置保留 `config.inputMapping` 和 `config.outputMapping`。

`inputMapping` 示例：

```json
{
  "input": "{{ sample.input }}",
  "output": "{{ sample.output }}",
  "expected_output": "{{ sample.expectedOutput }}",
  "context": "{{ sample.context }}"
}
```

创建自动评测任务时允许任务级覆盖：

```json
{
  "variableMapping": {
    "input": "{{ sample.input }}",
    "output": "{{ sample.output }}",
    "expected_output": "{{ sample.expectedOutput }}",
    "context": "{{ sample.context }}"
  }
}
```

解析规则第一阶段只支持简单模板：

- `{{ sample.input }}`
- `{{ sample.output }}`
- `{{ sample.expectedOutput }}`
- `{{ sample.context }}`
- `{{ sample.metadata.xxx }}`
- `{{ sample.trace.xxx }}`
- `{{ sample.observation.xxx }}`
- `{{ sample.datasetItem.xxx }}`

找不到字段时返回空字符串，不抛内部异常。

## 前端交互

新建自动评测第二步显示评估器变量映射，字段选项统一从 `sample.*` 出发：

- `sample.input`
- `sample.output`
- `sample.expectedOutput`
- `sample.context`
- `sample.metadata`
- `sample.trace.id`
- `sample.observation.id`
- `sample.datasetItem.id`

第三步选择数据源后展示样本预览。第一阶段可以先展示静态预览结构，后续再接真实“预览一条样本”接口。

## 错误处理

- 数据集无可用样本：返回业务错误 `4006`。
- Trace 过滤命中为 0：返回业务错误。
- 映射结果为空不直接失败，由评估器结果决定得分；但报告 reproduction 中记录 `inputMapping` 快照。
- 工作流返回非 JSON 或缺少 `score` 时，后台任务标记为 `FAILED`。

## 测试

- 后端单测覆盖数据集样本归一化。
- 后端单测覆盖模板映射。
- 后端单测覆盖任务级 `variableMapping` 优先于评估器默认 `inputMapping`。
- 前端单测覆盖创建任务 payload 包含 `variableMapping`。

## 不做

- 不新增数据库表。
- 不修改 Langfuse 原生表结构。
- 不在第一阶段实现完整 Trace 查询 UI 和复杂表达式语言。
- 不自动提交代码。
