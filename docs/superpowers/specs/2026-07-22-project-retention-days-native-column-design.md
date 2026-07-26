# 项目数据保留天数原生列修复设计

## 背景

当前 PA Eval 后端将项目数据保留天数写入并读取
`projects.metadata.paEval.retentionDays`。Langfuse 的数据保留清理任务实际读取
`projects.retention_days`，导致项目设置页面保存成功后，自动清理配置并未生效。

## 目标

- 项目创建、更新和查询统一使用 Langfuse 原生 `projects.retention_days` 列。
- 新建项目未传 `retentionDays` 时，向原生列写入 14。
- 不再向 metadata 写入或从 metadata 读取 `retentionDays`。
- 不迁移、不删除已有 `metadata.paEval.retentionDays` 数据。

## 非目标

- 不修改 Langfuse 原生表结构。
- 不新增数据库迁移。
- 不修改 `langfuse/` 参考代码。
- 不调整 Langfuse Worker 的调度或清理实现。
- 不处理已有 metadata 配置向原生列的迁移。

## 方案

### 创建项目

`INSERT INTO projects` 增加 `retention_days`。请求传入 `retentionDays` 时写入请求值，
未传时写入 14。创建时生成的 `metadata.paEval` 不包含 `retentionDays`。

### 更新项目

更新 SQL 直接更新 `retention_days`。请求传入 `retentionDays` 时写入该值；未传时保持
数据库现值，不将其覆盖为 `NULL` 或 14。更新 metadata 时不新增或覆盖
`metadata.paEval.retentionDays`；已有旧值保持原样，但不再参与任何业务逻辑。

### 查询项目

所有生成项目 API 响应的查询补充选择 `projects.retention_days`。响应中的
`retentionDays` 只读取 `row.retention_days`；若历史项目原生列为 `NULL`，API 返回默认
14。即使 metadata 中存在其他值，也必须忽略。

这里的 14 仅是历史空值的响应兜底，不会反向写入数据库，也不会使 Langfuse 清理任务
自动处理这些历史项目；本次已明确不做迁移。

## 校验和错误处理

沿用现有 Pydantic 校验：`retentionDays` 必须为 1 到 30 的整数。此次修复不改变接口
响应结构和业务错误码。

## 测试策略

采用测试先行方式补充回归测试：

1. 创建项目传入指定天数时，SQL 向 `retention_days` 写入指定值，metadata 不含该键。
2. 创建项目未传天数时，SQL 向 `retention_days` 写入 14。
3. 更新项目传入天数时，SQL 更新 `retention_days`，metadata 不新增或覆盖该键。
4. 更新项目未传天数时，保留原生列现值。
5. 项目响应只读取 `retention_days`；原生列为空时返回 14，并忽略 metadata 中的旧值。

完成后运行相关后端测试，再运行完整后端测试或项目现有的等价验证命令。
