# Trace 人工标注历史评分回显设计

## 背景

从 Trace 日志创建新的人工标注任务时，新任务已选择的评分指标没有回显该 Trace 之前对应的评分值。前端评分表单已经支持根据 `item.scores` 初始化表单，因此缺陷位于后端创建任务时的历史评分复制链路。

## 根因

创建任务的批量优化将 Trace 查询从逐条 `get_trace()` 改为 `list_traces_by_ids()`。后者当前只返回 Trace 基础字段，不会加载 `scores`，导致 `_prefill_annotation_scores_from_trace_rows()` 收到空评分数组，无法将 ClickHouse 中的最新评分复制到新标注队列。

## 方案

为 `LangfuseClickHouseReader.list_traces_by_ids()` 增加按需加载评分的能力：

- 当 `fields` 包含 `scores` 时，批量查询这些 Trace 的评分并写入返回行。
- 其他调用不指定 `scores` 时保持现有行为，避免数据集导入等场景产生额外查询。
- Trace 人工标注预填逻辑调用 `list_traces_by_ids(..., fields="scores")`。
- 评分复制仍只处理新标注队列已配置的评分指标，并沿用现有的去重、写入和失败处理逻辑。

## 数据流

1. 用户从 Trace 日志创建人工标注任务。
2. 后端创建队列数据项并取得新队列的评分指标 ID。
3. 后端按 Trace ID 批量读取基础数据和评分数据。
4. 预填逻辑筛选与新队列评分指标匹配的最新评分。
5. 匹配评分写入新队列，标注详情接口返回 `item.scores`。
6. 前端现有 `buildAnnotationScoreDefaultValues()` 将评分值回显到对应控件。

## 错误处理

- 没有历史评分或没有匹配指标时不写入评分，任务仍正常创建。
- 单个评分复制失败沿用现有失败收集和日志逻辑，不扩大接口错误信息暴露范围。
- 不修改 Langfuse 表结构，不新增数据库迁移。

## 测试

- 新增回归测试，证明 `list_traces_by_ids(..., fields="scores")` 会加载评分。
- 调整任务创建测试，使测试替身只有在显式请求 `scores` 时才返回评分；修改前测试必须失败。
- 运行相关后端测试、格式检查和静态检查，确认未影响不请求评分的批量 Trace 查询。

## 范围

本次只修复 Trace 创建人工标注任务的评分初值链路，不调整前端布局、组件样式或人工评分保存语义。
