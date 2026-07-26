# 自动评测报告 Badcase Score 列设计

## 背景

自动评测报告的 Badcase 表格复用了 Trace 日志的动态 score 列组件。该组件会根据接口返回行中的 `scores` 字段生成列，但 Badcase 接口当前通过 `list_traces_by_ids` 获取 Trace，该查询不会聚合 score，因此页面没有可生成的 score 列。

“分析”Tab 的“查看详情”会携带 `scoreQueueId=sourceTaskId` 进入 Trace 日志，并通过 Trace 查询链路聚合 score。Badcase 列表需要采用相同的数据结构，但展示范围应严格限定为当前自动评测任务的当前运行结果。

## 目标

- Badcase 列表展示本次自动评测任务产生的动态 score 列。
- score 范围同时受报告的 `source_task_id` 和 `run_id` 限制。
- 不展示同一 Trace 上由人工标注、其他自动评测任务或其他运行产生的 score。
- 保持现有 Badcase 筛选、分页、批量操作和 Trace 详情交互不变。

## 方案

在 Badcase 接口内部复用已有的评测 score 查询结果：

1. 使用 `list_scores_by_queue(project_id, source_task_id, run_id=run_id)` 查询本次运行的 score。
2. 继续使用这些 score 计算 Badcase，并获得分页后的 Trace ID。
3. 使用 `list_traces_by_ids` 查询分页 Trace 的基础信息、输入输出和 metadata。
4. 将本次运行的 score 按 `traceId` 聚合，仅附加到当前页对应的 Trace：
   - `scores`：该 Trace 在当前 task 和 run 下的 score 列表。
   - `scoreSummary`：使用现有 `_score_summary` 生成摘要。
5. 前端继续通过 `createTraceLogColumns({ rows })` 根据 `scores[].name` 生成 score 列，无需新增专用 UI。

不修改通用 `list_traces_by_ids`，避免改变标注、数据集等其他调用方的返回内容和查询开销。

## 数据边界

- 无 `source_task_id` 时保持返回空列表。
- 无匹配 score 的 Trace 返回空 `scores`，不会生成错误列。
- 同一 Trace 有多个 score 名称时，每个名称生成一列。
- 同一名称存在多条记录时，保持当前查询的倒序结果，并采用第一条作为表格值，与现有 score 查找逻辑一致。
- 分页仍按去重后的 Badcase Trace ID 进行，score 聚合只处理当前页，返回总数不变。

## 测试

先新增失败测试，再实现代码：

- Badcase 接口返回的 Trace 包含当前 task、当前 run 的 `scores` 和 `scoreSummary`。
- 不会把其他 task 或其他 run 的 score 混入结果；该约束由 `list_scores_by_queue` 调用参数和返回数据断言覆盖。
- 前端已有动态 score 列测试继续通过。
- 运行后端相关测试，并按影响范围执行前端类型检查或相关测试。

## 非目标

- 不修改 Badcase 表格样式、列排序或批量操作。
- 不修改 Langfuse 原生表结构。
- 不新增数据库迁移。
- 不改变“分析”Tab 的 Trace 日志查询行为。
