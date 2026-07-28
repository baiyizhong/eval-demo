# PA 旧表 Contract 删除设计

## 1. 已批准目标

在 `20260723_0015` expand、backfill 和一致性校验完成后，删除 11 张已被整合模型完全替代的旧表，同时保持现有页面、路由、DTO、权限、状态机、任务恢复和审计行为不变。最终数据库保留 12 张 PA 表。

删除表：

- `pa_project_model_settings`
- `pa_annotation_queue_settings`
- `pa_auto_evaluation_tasks`
- `pa_scheduled_jobs`
- `pa_auto_evaluation_runs`
- `pa_scheduled_job_execution_logs`
- `pa_dataset_export_jobs`
- `pa_annotation_export_jobs`
- `pa_trace_bulk_jobs`
- `pa_evaluation_report_flowbacks`
- `pa_evaluation_report_badcases`

保留表：

- 整合表：`pa_resource_extensions`、`pa_evaluation_jobs`、`pa_job_executions`
- 独立业务表：`pa_evaluators`、`pa_evaluation_report_templates`、`pa_evaluation_reports`、`pa_evaluation_report_items`、`pa_audit_logs`、`pa_annotation_queue_item_assignments`
- Langfuse 兼容表：`pa_project_api_keys`、`pa_project_llm_connections`、`pa_project_model_definitions`

## 2. 方案选择

采用直接运行时切换，不创建同名兼容视图或触发器。应用的在线读写只使用 12 张保留表；历史 backfill 代码只允许在 Contract 前运行。这样数据库对象和应用事实源一致，不会出现“表已删但运行时仍依赖旧名字”的伪整合。

## 3. 运行时映射

- 项目默认模型与 Annotation assignment policy：只读写 `pa_resource_extensions`。
- 自动评测与定时任务定义：只读写 `pa_evaluation_jobs`。
- 自动评测 run、定时执行日志、Dataset/Annotation Export、Trace Bulk、Report Flowback：只读写 `pa_job_executions`。
- Badcase：只读写 `pa_evaluation_report_items` 的 `is_badcase`、规则、评分、原因、评论和来源字段。
- Langfuse 原生资源继续使用 Public API 加现有三张兼容 shadow，不纳入本次删除。

API Adapter 继续把整合字段转换为原有 DTO；前端无需改动。

## 4. 发布与回滚

发布顺序固定为：

1. 停止 API、Worker、Scheduler 和所有 PA 表写入，旧表保持存在。
2. 在停写窗口执行最终 backfill 和只读 verify，要求 legacy 全部被整合表覆盖、无字段差异且无运行中旧任务。
3. 保持停写，部署 consolidated-only 应用版本并立即执行 `20260723_0016` Contract 迁移；final backfill 与 Contract 之间禁止恢复业务写入。
4. 验证最终 12 张表、API 回归、Worker claim、任务终态和产物下载后再恢复服务。

迁移 upgrade 在删除前检查整合表存在、覆盖差异为零、没有旧表独有行和运行中任务；任一条件失败即终止。downgrade 重建 11 张兼容表及索引/注释，并从整合表恢复可供旧应用读取的记录，然后才能回滚应用版本。

若整合表记录的 `update_date` 晚于对应 legacy 记录，则该整合记录是事实源：final backfill 不覆盖其可变业务字段，Contract 校验也不要求其回退成旧值；但 legacy 审计字段和 downgrade 所需无损快照仍必须完整。consolidated-only 新记录允许多于 legacy 记录，legacy 记录不得缺少对应整合记录。

六类统一执行的完整 legacy 行保存在 `result_payload.paLegacy`。final backfill 无条件刷新该回退快照但不改变整合行的事实源时间；运行时只合并业务结果，不能覆盖 `paLegacy`。Contract 无论两侧 `update_date` 新旧都校验快照，downgrade 再从快照恢复 legacy-only 字段。

## 5. 安全与停止条件

- 不修改 Langfuse 原生表和 `langfuse/`、`dify/`。
- 不在 migration 中自动猜测或修复差异。
- 不复制 API Key Secret。
- 生产 migration、开关和部署需要单独环境授权。
- 数据差异、运行中任务、未知状态、恢复记录不足均中止 Contract。

## 6. 验收

- 静态测试确认 upgrade 删除且 downgrade 重建全部 11 张表。
- 运行时源码除 pre-contract backfill/verification 和历史迁移外，不引用被删除表。
- 所有现有后端测试迁移为整合表事实源并通过。
- 前端 typecheck/build 通过，API 路径和 DTO 不变。
- `git diff --check`、Ruff、compileall 和敏感信息扫描通过。
