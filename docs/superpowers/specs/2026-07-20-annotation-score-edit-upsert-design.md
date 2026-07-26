# 人工标注编辑保存去重设计

## 目标

同一标注任务、同一数据项、同一评分指标重复编辑保存时，评分 ID 保持不变，接口和页面只返回最新评分；一次人工编辑保存不再同时触发 Langfuse API 和后端 ClickHouse 直写。

## 现场证据

- 指定 Trace 在 ClickHouse 原始表中有 19 条评分版本，`FINAL` 后只有 4 条逻辑评分。
- 每次保存只有一个 PA Backend HTTP 请求。
- 每个指标在一次保存中产生两条相同 ID 的版本：后端直写一条，Langfuse 异步消费后再写一条。
- PostgreSQL 当前连接中该队列和 Trace 没有 `scores` 行。

## 方案比较

### 方案 A：Langfuse 单写 + 最终态读取（采用）

人工编辑和批量评分只调用 Langfuse API；读取评分使用 ClickHouse `FINAL` 并过滤删除版本。新任务历史评分预填保留现有 ClickHouse write-through，以维持新任务创建后的立即回显。

优点：符合项目“写操作优先使用 Langfuse API”规范；编辑保存不再双写；读取稳定。缺点：Langfuse 异步落库存在短暂延迟。

### 方案 B：仅后端直写 ClickHouse

延迟最低，但绕过 Langfuse API，不符合项目规约，且会丢失 Langfuse 事件与审计语义。

### 方案 C：继续双写，仅在应用层去重

页面可避免重复，但底层仍会持续产生双份版本，不满足编辑保存只执行一次写入的目标。

## 数据流

1. 前端提交当前评分表单。
2. 后端校验指标并使用确定性评分 ID 生成 Langfuse 请求。
3. 人工编辑保存仅调用一次 Langfuse API，不执行 ClickHouse write-through。
4. Langfuse 使用相同评分 ID 写入新版本，逻辑上更新原评分。
5. 列表和详情读取使用 ClickHouse `FINAL`，同一 ID 只返回最新版本。
6. 标注项继续更新为 `COMPLETED`，首次完成时间保持不变。

## 测试

- 人工编辑保存即使提供 ClickHouse writer，也不得调用直写。
- 历史评分预填仍允许调用 ClickHouse writer。
- 队列评分和 Trace 评分查询必须使用 `FINAL` 并过滤 `is_deleted = 0`。
- 运行后端完整测试和 Ruff 检查。

## 非目标

- 不清理已有 ClickHouse 历史版本。
- 不修改 Langfuse 表结构。
- 不使用 ClickHouse `ALTER UPDATE` 或直接修改 PostgreSQL 评分表。
