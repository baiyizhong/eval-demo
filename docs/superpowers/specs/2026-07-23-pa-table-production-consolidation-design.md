# PA 扩展表生产级整合设计

## 1. 目标

在不改变现有前端页面、路由、PA API 请求与响应 DTO、权限语义和用户可见行为的前提下，将 20 张 PA 扩展表收敛为职责清晰的生产数据模型，并优先让 Langfuse 原生资源成为事实源。

整合采用 expand-migrate-contract，不在首次发布中删除旧表。所有数据库变更必须由 Alembic 完成并可 downgrade；读写切换必须能通过环境变量回退。

## 2. 不可变兼容边界

- `pa-eval-frontend/src/api/registry.ts` 中现有路径和 HTTP 方法不变。
- API 响应继续使用 `{code, message, data, txId}`，分页继续使用 `{total, datas}`。
- 自动评测、定时任务、报告、回流、Dataset 导出、Annotation 导出、Trace 批处理的用户可见状态和历史记录不丢失。
- `langfuse/` 和 `dify/` 不修改。
- Langfuse 原生表不修改结构；新增、修改、删除优先走公开 API。
- PA 新表以 `pa_` 开头，审计字段位于字段定义首位并包含完整注释。
- 密钥不得新增明文副本。现有 API Key 重复查看行为在本阶段保持兼容，但旧明文列不得迁入通用扩展表。

## 3. 目标数据模型

### 3.1 `pa_resource_extensions`

保存 Langfuse 资源缺失的强类型 PA 扩展：

- `PROJECT/DEFAULT_EVALUATION_MODEL`
- `ANNOTATION_QUEUE/ITEM_ASSIGNMENT_POLICY`
- 必要时保存 API Key 的可编辑展示备注，但不保存 Secret

唯一键为 `(project_id, resource_type, resource_id, extension_type)`。`payload` 必须由 extension type 对应的 Pydantic Schema 校验，并带 `schema_version`。

### 3.2 `pa_evaluation_jobs`

统一自动评测定义和定时任务定义。共享评估器、数据源、评分映射、报告模板和 Badcase 配置；用 `trigger_type` 区分 `MANUAL`、`SCHEDULED`、`ONLINE`。调度频率、时区、启停状态只在 scheduled 类型生效。

### 3.3 `pa_job_executions`

统一以下执行记录：

- 自动评测运行
- 定时评测触发记录
- Dataset 导出
- Annotation 导出
- Trace 到 Dataset/Annotation 的批处理
- 评测报告回流

表内提供统一状态、进度、租约、尝试次数、幂等键、请求快照、可恢复游标、结果、错误、产物引用和过期时间。业务 payload 使用 `job_type + schema_version` 校验，禁止无约束写入 JSON。

### 3.4 报告模型

`pa_evaluation_reports` 和 `pa_evaluation_report_items` 保留。报告是生成时不可漂移的业务快照，不能完全依赖 Langfuse 实时 Trace/Score 重建。

`pa_evaluation_report_badcases` 合并到 items：增加 `is_badcase`、规则快照、主评分、原因、评论和来源类型。现有 Badcase API 仍由 Adapter 返回原 DTO。

### 3.5 独立保留

- `pa_evaluators`：仅承载 Dify、HiAgent、n8n、OpenJudge 自定义评估器。
- `pa_evaluation_report_templates`：独立版本和默认模板生命周期。
- `pa_annotation_queue_item_assignments`：Langfuse 不具备的 Item 级处理人。
- `pa_audit_logs`：PA Adapter 独立、追加式审计证据。
- `pa_project_api_keys`：仅作为兼容遗留表存在，直到产品允许 Secret 只展示一次；不得把明文 Secret 迁到新表。

### 3.6 现有 20 张 PA 表逐表结论

| 现有表 | Langfuse 对齐与现有职责 | 本次整合去向 | Contract 条件 |
| --- | --- | --- | --- |
| `pa_evaluators` | Langfuse 原生 LLM-as-Judge/Code Evaluator 走 Public API；Dify、HiAgent、n8n、OpenJudge 无原生等价物 | 保留自定义 Provider；原生类型启用开关后由 Langfuse 事实源承载 | 只清理已确认迁入 Langfuse 的原生类型兼容行 |
| `pa_evaluation_report_templates` | Langfuse 无 PA 报告模板生命周期 | 独立保留 | 不合并 |
| `pa_project_api_keys` | 对齐 Langfuse Project API Keys；组织级 Bearer API 负责创建/删除 | 兼容 shadow 保留，Saga 保存外部 ID，不复制 Secret 到通用表 | 产品改为 Secret 仅展示一次且恢复演练通过后停用 shadow |
| `pa_auto_evaluation_tasks` | Langfuse Evaluator、Dataset、Trace、Score 为基础资源，PA 负责任务编排 | 定义回填/双写到 `pa_evaluation_jobs`，现有 API 保持 legacy DTO | 新表持续一致且旧表无新增写入后移除 |
| `pa_auto_evaluation_runs` | 对齐评测执行历史、外部 run ID 和进度 | 回填/双写到 `pa_job_executions` | 同上 |
| `pa_evaluation_reports` | Langfuse 无等价的不可漂移 PA 报告快照 | 独立保留 | 不合并 |
| `pa_evaluation_report_items` | 关联 Langfuse Trace/Observation/Score，保存报告生成时快照 | 保留，并扩展 Badcase 字段 | 不合并 |
| `pa_evaluation_report_badcases` | 可由 report item 的评分快照表达 | 回填并合并到 `pa_evaluation_report_items.is_badcase` 等字段；兼容读保留 | Badcase 与回流对账持续为零差异后移除 |
| `pa_evaluation_report_flowbacks` | Dataset/Dataset Item 写入由 Langfuse 资源路径承载，PA 保存业务回流批次 | 执行状态双写到 `pa_job_executions`，legacy 表保持 DTO | 执行历史完全切读后移除 |
| `pa_project_llm_connections` | 对齐 Langfuse LLM Connections Public API | API 为原生事实源，PA 表作为现有 DTO/Secret 兼容 shadow；失败走补偿 Saga | 产品允许取消 shadow 且凭据迁移方案获批后移除 |
| `pa_project_model_definitions` | 对齐 Langfuse Models Public API；更新创建新版本 | API 为原生事实源，PA 表作为兼容 shadow；本地失败删除新原生版本 | 新版本语义与历史计价验证后移除 shadow |
| `pa_project_model_settings` | Langfuse 无“项目默认评测模型”完整业务语义 | 回填/双写到 `pa_resource_extensions/DEFAULT_EVALUATION_MODEL` | extension 切读稳定后移除 |
| `pa_audit_logs` | Langfuse 审计不能替代 PA Adapter 的 txId 与业务操作证据 | 追加式独立保留 | 不合并 |
| `pa_dataset_export_jobs` | Dataset 为 Langfuse 事实源，导出编排为 PA 能力 | 回填/双写/切读到 `pa_job_executions/DATASET_EXPORT` | 产物与状态对账通过后移除 |
| `pa_scheduled_jobs` | Langfuse 无 PA 定时评测定义与调度租约 | 定义回填/双写/切读到 `pa_evaluation_jobs` | 调度定义对账与恢复演练通过后移除 |
| `pa_scheduled_job_execution_logs` | 对齐统一评测执行历史 | 回填/双写/切读到 `pa_job_executions/SCHEDULED_EVALUATION` | 执行日志对账通过后移除 |
| `pa_annotation_queue_settings` | Queue 为 Langfuse 事实源，PA 策略是缺失扩展 | 回填/双写/切读到 `pa_resource_extensions/ITEM_ASSIGNMENT_POLICY` | extension 切读稳定后移除 |
| `pa_annotation_queue_item_assignments` | Langfuse 无等价的 PA item 级处理人状态 | 独立保留，并继续按 project/queue/item 隔离 | 不合并 |
| `pa_annotation_export_jobs` | Annotation Queue 为 Langfuse 事实源，导出编排为 PA 能力 | 回填/双写/切读到 `pa_job_executions/ANNOTATION_EXPORT` | 产物、metadata 与状态对账通过后移除 |
| `pa_trace_bulk_jobs` | Trace 为 Langfuse 事实源，批量导入 Dataset/Annotation 为 PA 编排 | 回填/双写/切读到 `pa_job_executions`；兼容期 legacy 仍为唯一 claim 源 | 统一 claim 迁移另行设计并完成重复消费演练后移除 |

结论：20 张表不是直接压成单表。6 张长期独立保留，2 张资源设置收敛到 `pa_resource_extensions`，2 张定义表收敛到 `pa_evaluation_jobs`，6 张执行表收敛到 `pa_job_executions`，Badcase 合并到 report items，3 张 Langfuse 原生资源表先转为 Public API 事实源加兼容 shadow。首次发布不删除任何 legacy 表。

## 4. Langfuse 对齐

- LLM Connections 通过 Langfuse LLM Connections API 管理。
- Model Definitions 通过 Langfuse Models API 管理；更新由 Adapter 使用创建新版本、验证、切换别名、删除旧版本的补偿流程实现。
- LLM-as-Judge 和 Code Evaluator 通过 Langfuse Evaluators API 管理；PA 自定义 Provider 仍走 `pa_evaluators`。
- Dataset、Dataset Item、Dataset Run、Run Item 和 Score 以 Langfuse 为事实源。
- Annotation Queue、Queue Item 和 Queue 级 Assignment 以 Langfuse 为事实源；Item Assignment Policy 和 Item assignee 仍由 PA 保存。
- Evaluation Rules 当前为 Unstable API，生产阶段只做可选同步，不把 PA 评测定义唯一托管于该 API。

## 5. 数据流与兼容策略

### 5.1 发布阶段

1. Expand：创建新表、新索引和新增报告明细字段，不删除旧对象。
2. Backfill：按确定性 ID 将旧数据回填到新表；重复运行不得产生重复记录。
3. Dual write：旧写入成功后在同一 PostgreSQL 事务内写新表；异步执行更新统一记录。
4. Verify：提供只读一致性检查，比较记录数、状态、关联 ID、进度和业务摘要。
5. Switch read：环境变量按域切换新读路径；异常时即时回到 legacy。
6. Contract：至少一个完整数据保留周期后，单独迁移删除已停写旧表。

### 5.2 功能开关

- `PA_CONSOLIDATED_WRITES_ENABLED`
- `PA_CONSOLIDATED_READS_ENABLED`
- `PA_LANGFUSE_NATIVE_RESOURCE_WRITES_ENABLED`

默认发布策略为三个开关均关闭；完成 expand 和回填校验后，先开启新表写，再逐域开启新表读和 Langfuse API 写。

### 5.3 事务与幂等

- 同数据库旧表和新表写入必须共用一个事务。
- 外部 Langfuse API 与本地事务不能假设分布式原子性，使用 operation key、状态机和补偿重试。
- `pa_job_executions` 对 `(job_type, definition_id, idempotency_key)` 建条件唯一索引。
- Worker 通过租约字段抢占，续租和完成更新都校验 `lock_owner`。

## 6. 错误处理与安全

- 上游 Langfuse 错误转换为稳定 PA 业务错误码，不暴露响应体中的内部信息。
- Secret、Token、Authorization、连接凭据不得进入 payload、result、audit metadata 或日志。
- 导出产物最终使用对象存储引用；兼容期允许读取 legacy file path，但新记录不能依赖本机绝对路径作为唯一位置。
- 审计日志只追加，并记录 txId、actor、resource、operation key 和最终状态。

## 7. 测试与验收

- Alembic upgrade/downgrade 和幂等回填测试。
- 新旧 repository 契约测试，验证同一输入产生相同 API DTO。
- 双写失败回滚测试、重复执行幂等测试、租约恢复测试。
- 20 张旧表到新模型的逐表数据一致性测试。
- 自动评测、定时评测、报告、Badcase、回流、导出、批处理和 Annotation Assignment API 回归。
- 后端全量 pytest、静态编译和前端 build/typecheck。
- 扫描改动，确认没有新增 Secret、内网 Token、绝对文件路径或 Langfuse 结构变更。

## 8. 不在本次首次发布中执行

- 删除旧表。
- 修改前端 API 合同。
- 修改 Langfuse 原生表结构。
- 强制取消 API Key Secret 重复查看。
- 将所有 payload 迁入单个无类型 Artifact JSON 表。
