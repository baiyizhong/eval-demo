# Implementation Decisions

## 2026-07-23：Langfuse 作为评测业务唯一事实源

- 保留现有 PA API 外观，但 Direct/Adapter 路由的底层数据必须来自或写入 Langfuse Public API/官方 SDK。
- PA 仅持有 OAuth/session、超级管理员、审计、导出/异步任务、报告模板/快照、Dify 回流、scheduler 等控制面状态。
- PA 控制面只引用 Langfuse 原生 ID，不复制 trace、observation、dataset、queue、score、score config、evaluator、project 或 membership 业务实体。
- 禁止通过 SQL 对 Langfuse 原生表 insert/update/delete；缺少官方写接口时不得 fallback。
- 历史自动评测保留 PA 编排，执行使用 Langfuse experiment workflow，结果写入 Langfuse scores；实时评测使用 evaluation rules。
- 14 个当前无法无损对齐的路由标记为 Blocked，产品契约调整前不实施破坏性替代。
- 详细决策矩阵见 `docs/api/2026-07-23-langfuse-public-api-alignment.md`。

## 2026-07-23：删除 PA 模型设置影子表

- Langfuse LLM Connections 与 Models 是唯一业务事实源。
- 不新增 PA 映射表；原生 ID 直接穿透 PA DTO，并存入默认模型扩展。
- 不在 PA 数据库复制 LLM Provider Secret。
- 空 Secret 更新读取并解密 Langfuse 已保存凭据，所有变更仍调用 Public API。
- Models 更新采用可补偿替换，不直接更新 Langfuse 原生表。
- 旧数据同步完成且通过覆盖预检后，Alembic 才允许删除两张旧表。

## 2026-07-24：Public API 切换完成与原生表写守护

- 所有评测业务写路由已切换至 `LangfusePublicClient` 适配层：datasets（13）、annotations score configs/queues/items（15）、organizations members 含 import（4）、projects members 及 archive/restore 阻断（5）、evaluators create/delete LANGFUSE（2）。
- 新增静态守护测试 `pa-eval-backend/tests/test_no_langfuse_native_writes.py`：扫描 adapter 目录禁止原生表 INSERT/UPDATE/DELETE；参数化扫描 6 个路由文件禁止调用 denylist 中的 reader 原生写方法。当前 7 passed。
- PA 控制面写（`pa_*` 表、异步导出/批处理任务表）保留 reader 路径，不计入守护范围；底层评测数据仍走 Langfuse Public API。
- 验收：`uv run pytest -q` → 585 passed；`uv run python -m compileall app` 无错误；密钥扫描无命中。
- 12 个 Blocked 接口未回退到 SQL，返回稳定业务错误。
- 详细证据见 `docs/api/2026-07-23-langfuse-public-api-alignment.md` 第 9 节。

## 2026-07-27：报告回流写入补齐

- 报告 flowback 创建目标 Dataset / Dataset Item 不再直接 SQL 写 Langfuse 原生表，统一调用 `LangfuseDatasetsAdapter`，再由 `LangfusePublicClient` 写 Langfuse Public API。
- Flowback 本身、执行记录、报告项回流状态和报告计数继续作为 PA 控制面数据写 `pa_*` 表。
- 原生写守护测试扩展到 `auto_evaluations.py`，并新增路由级 adapter 注入测试，避免自动评测/报告路由绕过 Langfuse Public API。

## 2026-07-28：Public API 缺口改为 PA Overlay 闭环

- dataset update/delete、annotation queue update/delete、project archive/restore 不再返回 501；这些页面动作改为 PA 产品层 overlay，避免前端功能断链。
- 继续禁止 SQL 写 Langfuse 原生 `datasets`、`annotation_queues`、`projects.deleted_at` 等业务表；底层 Langfuse 对象保留为事实源。
- `RESOURCE_DISPLAY_OVERRIDE` 保存名称、描述、类型等 PA 展示覆盖；`RESOURCE_SOFT_DELETE` 保存 PA 软删除状态；`PROJECT_ARCHIVE_STATE` 保存 PA 项目归档状态。
- 创建 Dataset、Dataset Item、Annotation Queue、Queue Item、Score Config、成员等仍走 Langfuse Public API；overlay 仅用于 Public API 无等价能力的产品语义。
- 软删除只影响 PA API 读写视图：列表隐藏、详情和下游 item 操作返回 404；不物理删除 Langfuse 原生资源。

## 2026-07-28：接口与表库存口径

- 以静态源码扫描为准，当前 PA Backend 定义 129 个接口（含 `/health`）。
- 新增接口/表清单 `docs/api/2026-07-28-api-table-inventory.md`，按模块列出接口、数据路径和主要表/资源。
- 当前运行时代码直接使用 10 张 PA 现役表，最终迁移契约保留 12 张 PA 表；旧 PA 表已归类为 legacy/contracted。
- 清单明确标出当前未完全对齐点：项目和组织本体写、trace patch、ClickHouse score 写 fallback。
