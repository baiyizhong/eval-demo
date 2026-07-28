# PA 模型设置原生资源切换设计

## 目标

删除 `pa_project_llm_connections` 与 `pa_project_model_definitions`，保持现有 PA 模型设置 API、DTO、权限和前端交互不变，并让 Langfuse LLM Connections 与 Models 成为唯一业务事实源。

## 架构

- 查询通过项目 Public API Key 调用 `GET /api/public/llm-connections` 与 `GET /api/public/models`。
- 连接创建、更新、删除通过 Langfuse LLM Connections Public API；返回和默认模型引用统一使用原生连接 ID。
- 模型创建、删除通过 Langfuse Models Public API。模型更新使用可补偿替换 Saga，因为官方 API 没有更新接口。
- 默认评测模型继续保存在 `pa_resource_extensions`，但 `llmConnectionId` 改为原生连接 ID。
- 空 Secret 更新时，只读 Langfuse 原生 `llm_api_keys.secret_key` 并使用部署共享的 `ENCRYPTION_KEY` 解密；写入仍只走 Public API。PA 不再保存凭据副本。
- `pa_job_executions` 记录原生资源迁移和写操作结果，不新增映射表。

## 数据迁移与上线顺序

1. 运行预迁移同步工具，将两张 PA 表中的 ACTIVE 资源写入 Langfuse Public API。
2. 将默认模型扩展中的旧连接 ID 原子更新为原生连接 ID，并记录同步执行结果。
3. 验证每条 ACTIVE 旧资源都有成功映射，默认模型引用均能在原生连接中解析。
4. 部署原生资源读写代码。
5. 执行 Alembic 迁移，预检通过后删除两张旧表。

## 失败与回滚

- 连接迁移失败不更新默认模型引用；重跑使用 Provider upsert，具备幂等性。
- 同名模型更新先保存旧快照、删除旧模型、创建新模型；创建失败时按旧快照恢复。
- 异名模型更新先创建新模型，再删除旧模型；删除失败时删除新模型补偿。
- Alembic upgrade 在映射覆盖不完整、存在无效默认连接引用或运行中同步任务时拒绝删表。
- downgrade 重建两张兼容表；在线代码仍以 Langfuse 为事实源，不发生双写回退。

## 验收

- 在线模块不再包含两张表名。
- 模型设置八个现有 API 路径与响应字段不变。
- 空 Secret 编辑、默认模型选择、连接 Provider 变更、模型同名/异名更新均有测试。
- Alembic upgrade/downgrade 可执行，迁移预检可阻止数据未同步时删表。
