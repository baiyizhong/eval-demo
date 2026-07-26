# Trace 批量加入人工标注 P0 性能优化设计

## 目标与边界

优化 Trace 批量加入人工标注任务的历史评分预填和异步执行可靠性，保持现有公开 API、500 条批次、进度字段、跳过重复 Trace 和评分初值语义兼容。

本次仅调整批量创建人工标注任务链路，不改变人工标注员主动提交评分的接口。不修改 Langfuse 原生表结构，不再从 PostgreSQL `scores` 查询或复制历史评分。

## 数据流

历史评分以 ClickHouse `scores` 为事实来源：批量读取 Trace 当前评分，结合 PostgreSQL 中的队列项和 Score Config 配置生成新队列评分，使用一次 JSONEachRow 请求批量插入 ClickHouse。该链路不调用 Langfuse逐条 Score API，也不直接写 PostgreSQL `scores`。

普通队列项、Score Config、分配配置仍由 PostgreSQL 管理，不属于“Score结果不落PG”的范围。

## 异步执行

- 启用专用 bulk worker 时，创建 Job 的 Web 请求只入队，不再同时启动 FastAPI `BackgroundTasks` 长任务。
- worker 关闭时保留 `BackgroundTasks` 作为兼容兜底。
- worker 处理 Job 期间使用独立心跳定时续租；批次耗时超过默认租约时不会被其他 worker 重复领取。
- Score 批量写入失败按批次返回失败明细，保持 Job 失败统计与现有响应兼容。

## 测试

- 历史评分预填只调用 ClickHouse 批量写，不调用 Langfuse Score API和项目 API Key查询。
- Trace批量创建不执行 PostgreSQL历史Score复制。
- Score writer使用单次 JSONEachRow请求写入多条记录。
- worker启用/关闭时分别验证只入队和BackgroundTasks兜底。
- 长任务执行期间验证租约心跳启动并停止。

