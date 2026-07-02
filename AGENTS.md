# 项目规约

## 基本规则

- **禁止自动提交代码**：除非用户明确要求，否则不要执行 `git commit`、`git push` 或创建 PR。
- **禁止硬编码**：所有配置（API 地址、密钥、数据库连接等）必须放在 `.env` 文件或环境变量中，禁止直接写入代码。
- **数据库调整需支持回退**：所有数据库表结构变更必须使用 Alembic 迁移脚本，确保可回滚；禁止直接修改数据库。
- **禁止修改参考代码**：`langfuse/` 目录中的内容仅作为参考代码，不允许修改。
- **禁止修改 Langfuse 既有表结构**：不得修改、删除或重命名 Langfuse 原生表结构；确需扩展时优先复用已有表，无法满足时新增 PA 自定义表。
- **PA 扩展表命名**：所有 PA 自定义扩展表必须以 `pa_` 开头。

## API 设计

- RESTful 风格，资源命名使用复数名词，例如 `/projects`、`/datasets`。
- HTTP 方法语义明确：`GET` 查询、`POST` 创建、`PATCH` 部分更新、`DELETE` 删除。
- 分页参数统一使用 `page` 和 `pageSize`。
- API 响应格式统一为 `{ code: number, message: string, data: any, txId: string }`。
- 成功响应 `code` 必须为 `0`，`message` 默认为 `success`，例如 `{ code: 0, message: "success", data: {}, txId: "e123233adfasfdas" }`。
- 错误响应 `code` 必须为非 `0`，`message` 返回可展示的错误信息，例如 `{ code: 1, message: "xxx 错误", data: {}, txId: "e123233adfasfdas" }`。
- 分页列表响应的 `data` 统一为 `{ total: number, datas: any[] }`，例如 `{ code: 0, message: "success", data: { total: 0, datas: [] }, txId: "e123233adfasfdas" }`。

## 错误处理

- 业务异常使用自定义 Error 类，继承 `HTTPException`。
- 错误码统一管理，避免 magic number。
- 不暴露内部实现细节到错误信息。
- 关键操作记录审计日志。

## 日志

- 使用结构化日志（JSON 格式）。
- 包含 `trace_id`，方便链路追踪。
- 敏感信息脱敏，包括密钥、Token、密码。
- 区分日志级别：`ERROR` 异常、`WARN` 警告、`INFO` 正常、`DEBUG` 调试。
- **日志写入文件**，按天归档，例如 `app.log.2024-01-01`。
- 日志写入路径可配置，通过 `.env` 或环境变量 `LOG_PATH` 设置。

## 安全

- 密钥、Token 不写入日志。
- 外部输入必须校验，例如 Pydantic schema 或 Zod。
- SQL 使用参数绑定，防止注入。
- 内部 API 需要鉴权校验。

## 测试

- 新功能必须有单元测试。
- API 必须有集成测试。
- 测试数据使用 fixture 管理，不 hardcode。

## 代码风格

- 提交前本地运行 lint check。
- Python 使用 Black、isort、ruff。
- TypeScript 使用 ESLint、Prettier。

## 命名

- 文件名使用 kebab-case；Python 文件使用 snake_case。
- API 路由使用复数形式，例如 `/resources/{id}`。
- 数据库表和字段使用小写加下划线。
- 常量使用 `UPPER_SNAKE_CASE`。

## 哪里找

| 任务 | 位置 | 说明 |
|------|------|------|
| 后端入口 | `pa-eval-backend/app/main.py` | FastAPI app、CORS、v1/v2 router |
| v2 API 路由 | `pa-eval-backend/app/api/v2/` | projects、datasets、evaluators、eval-tasks、annotation-tasks、annotation-queues、project-setting |
| v1 API 路由 | `pa-eval-backend/app/api/` | health、orgs、pipeline、trace、dataset、Langfuse 兼容 API |
| 后端业务服务 | `pa-eval-backend/app/services/` | 项目、API key、评估运行、评分、标注、Label Studio、OpenJudge、平安智能体 |
| 后端模型和数据库连接 | `pa-eval-backend/app/models*.py`、`pa-eval-backend/app/database.py`、`pa-eval-backend/app/config.py` | SQLAlchemy 模型、engine/session、配置 |
| 后端 schema | `pa-eval-backend/app/schemas*.py` | Langfuse 兼容模型与 PA 扩展模型 |
| 后端测试 | `pa-eval-backend/tests/` | API、服务、评估器、eval runner、project settings 测试 |
| 前端页面 | `pa-eval-frontend/app/` | 布局、侧边栏、弹窗、状态、任务向导、系统管理页面 |
| 前端通用组件 | `pa-eval-frontend/components/` | 通用 UI 组件 |
| 前端 API 客户端 | `pa-eval-frontend/lib/api-client.ts`、`pa-eval-frontend/lib/api-v2.ts` | v1/v2 fetch 封装 |
| 企业管理原型 | `Enterprise Admin Dashboard DesignV3/` | 企业后台信息架构和交互参考，不作为生产代码直接复制 |
| 产品/技术文档 | `docs/prd/`、`docs/api/`、`docs/superpowers/` | 需求、API 说明、实现设计与计划 |

## 项目约定

- 前端项目名称为 `pa-eval-frontend`，后端项目名称为 `pa-eval-backend`。
- 前端企业后台信息架构参考 `Enterprise Admin Dashboard DesignV3`：保留“系统管理（租户、用户、系统设置）”和“项目内管理（traces、evaluations、datasets、evaluators、settings）”两级导航模型。
- 后端要求 Python `>=3.11`，依赖使用 `uv` 管理。
- 后端配置集中在 `pa-eval-backend/app/config.py`，本地覆盖写入 `pa-eval-backend/.env`。
- v2 API 统一挂载在 `/api/v2`，路由模块内部再声明资源前缀。
- 自定义持久化表使用 `pa_` 前缀，模型主要在 `models_pa.py`。
- 连接 Langfuse PostgreSQL 时优先使用 SQLAlchemy session 和 `text()` 原生 SQL。
- 扩展 Langfuse 数据时，优先复用 Langfuse 已有表结构和字段语义；确需新增持久化能力时新增 PA 自定义表，不改 Langfuse 原生表结构。
- 对 Langfuse 原生表中的数据执行新增、修改、删除时，优先通过 Langfuse 官方接口、项目内封装接口或兼容 API 完成；仅查询类操作可以使用 SQL 联表查询。
- 前端 API 调用统一走 `fetchApi` 或 `fetchV2`，按现有规则携带 `X-Org-Id`。
- 前端图标使用 `lucide-react`，图表使用 `recharts`，样式使用 TailwindCSS。
- 新增跨端功能时，同步检查后端 schema、前端类型、API 客户端和相关测试。
- **平安智能体评估器**：生产环境 `PA_AGENT_GATEWAY` 通过环境变量配置，配置存储在 `pa_external_evaluator_configs`。

## 反模式

- 不要绕过 `get_db()` / SQLAlchemy session 直接 shell 到数据库。
- 不要直接修改 Langfuse 原生表结构；不要为了业务扩展给 Langfuse 原生表加字段、改字段类型或改约束。
- 不要直接用 SQL 对 Langfuse 原生表做新增、修改、删除，除非用户明确授权且没有可用接口路径；读取和分析可以使用联表查询。
- 不要在页面文件继续堆叠复杂交互；`pa-eval-frontend/app/project/[id]/traces/page.tsx` 已接近 1500 行，新增逻辑应优先拆到组件、hooks 或 lib。
- 不要复制 v1/v2 API 客户端逻辑；先扩展 `lib/api-client.ts` 或 `lib/api-v2.ts`。
- 不要把真实密钥、数据库口令或内网 token 写进文档、测试或前端代码。
