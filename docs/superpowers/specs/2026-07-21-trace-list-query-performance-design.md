# Trace 日志查询性能优化设计

## 目标

在保持 Trace 日志现有筛选、分页、返回字段及完整 input/output 能力的前提下，避免大数据量下重复扫描项目全部 Observation 和 Score，降低列表接口延迟。

## 查询架构

查询分为两条路径：

- 基础筛选路径：时间、环境、Trace/Session/User/Business ID、标签、metadata 等条件直接作用于 `traces`。总数直接统计 Trace；当前页 Trace 确定后，仅聚合这些 Trace 的 Observation，再补充 Score 和完整 input/output。
- 聚合筛选路径：状态、延迟、评分队列和 Score 条件需要 Observation/Score 参与。先从有时间边界的 `traces` 产生候选 Trace，再只为候选集聚合 Observation 和 Score。

所有列表请求必须有时间边界。显式 `createdAtRange` 或 `timeRange` 优先；未显式指定时统一使用最近 1 天，其他筛选条件不再取消该默认范围。

## 分页与总数

- 保留 `page/pageSize/total` 和现有 OFFSET 行为，保证旧客户端及随机页跳转兼容。
- 新增可选 `cursorCreatedAt/cursorTraceId`。传入游标时使用 `(createdAt, traceId)` keyset 条件，返回 `nextCursor` 和 `hasMore`。
- 精确总数按项目和规范化筛选条件缓存 30 秒。缓存有容量上限，过期及超量条目自动清理；多进程实例允许短时间内缓存不一致。

## 返回数据

列表仍默认读取并返回完整 input/output 和 metadata。当前页 Score、Evaluator Score 和 IO 查询保持批量方式，不产生逐行 N+1 查询。

## 正确性与异常

- 状态和延迟计算口径保持不变。
- Score 来源及优先级保持不变。
- 原有 API 参数和响应字段不删除；新增字段向后兼容。
- 本次不修改 Langfuse 原生表，不新增数据库对象，不执行提交。

## 验证

- 单元测试覆盖默认时间、显式时间、基础/聚合路径、候选集约束、游标、缓存和 IO。
- 运行后端完整相关测试及 Ruff。
- 使用确定性合成大数据执行修改前后查询算法基准；若本地 ClickHouse 服务和数据可用，再执行真实 HTTP 接口基准，并明确区分冷查询与缓存命中查询。
