# 项目规约

## 架构

三层架构方案：

1. Web 层（pa-eval-frontend）：实现评测管理的UI交互
2. Plus 层（pa-eval-backend）：中间代理层，调用 langfuse API 服务或实现接口直接访问数据库（ck/pg）
3. Base 层（langfuse 服务）：基础评测服务（可通过langfuse API 访问）、数据库（ck、pg）、langfuse web

## 基本规则

- **禁止自动提交代码**：除非用户明确要求，否则不要执行 `git commit`、`git push` 或创建 PR。
- **禁止硬编码**：所有配置（API 地址、密钥、数据库连接等）必须放在 `.env` 文件或环境变量中，禁止直接写入代码。
- **数据库调整需支持回退**：所有数据库表结构变更必须使用 Alembic 迁移脚本，确保可回滚；禁止直接修改数据库。
- **禁止修改参考代码**：`langfuse/` 目录中的内容仅作为参考代码，不允许修改。
- **禁止修改 Langfuse 既有表结构**：不得修改、删除或重命名 Langfuse 原生表结构；确需扩展时优先复用已有表，无法满足时新增 PA 自定义表。
- **PA 扩展表命名**：所有 PA 自定义扩展表必须以 `pa_` 开头。
- **PA 扩展表审计字段**：所有 PA 自定义扩展表必须包含 `create_by`、`update_by`、`create_date` 和 `update_date` 这 4 个审计字段，其中 `create_date` 和 `update_date` 必须设置为当前时间默认值。
- **Python 包管理**：Python 项目统一使用 `uv` 管理依赖、虚拟环境和命令运行；禁止手动维护 `requirements.txt` 作为主依赖来源。
- **开发原则**：优先查询和使用规范文档（比如langfuse），如果文档中没有定义，再去搜索源码。
- **增删查改**：`query` 优先通过自建接口（已有接口直接复用）查询数据库，`update/insert/delete` 则优先通过 langfuse API 访问数据，如果没有相应 API 定义，则需要与用户确认是否需要自建接口。

## API 设计

- RESTful 风格，资源命名使用复数名词，例如 `/projects`、`/datasets`。
- HTTP 方法语义明确：`GET` 查询、`POST` 创建、`PATCH` 部分更新、`DELETE` 删除。
- 分页参数统一使用 `page` 和 `pageSize`。
- API 响应格式统一为 `{ code: number, message: string, data: any, txId: string }`。
- txId 是 traceID，用于日志问题追踪。
- 成功响应 `code` 必须为 `0`，`message` 默认为 `success`，例如 `{ code: 0, message: "success", data: {}, txId: "123" }`。
- 错误响应 `code` 必须为非 `0`，根据业务不同返回不同的 code 码（ 1 <= code <= 9999），`message` 返回可展示的错误信息，例如 `{ code: 1, message: "xxx 错误", data: {}, txId: "123" }`。
- 分页列表响应的 `data` 统一为 `{ total: number, datas: any[] }`，例如 `{ code: 0, message: "success", data: { total: 0, datas: [] }, txId: "123" }`。

### API 错误处理

- 业务异常使用自定义 Error 类，继承 `HTTPException`。
- 错误码统一管理，避免 magic number。
- 不暴露内部实现细节到错误信息。
- 关键操作记录审计日志。

## 安全

- 密钥、Token 不写入日志。
- 外部输入必须校验，例如 Pydantic schema 或 Zod。
- SQL 使用参数绑定，防止注入。
- 内部 API 需要鉴权校验。

## 哪里找

| 任务          | 位置                                          | 说明                                           |
| ------------- | --------------------------------------------- | ---------------------------------------------- |
| 后端入口      | `pa-eval-backend/`                            | 后端代码（plus 层）                            |
| 前端入口      | `pa-eval-frontend/`                           | 前端页面（ web 层）                            |
| 后端规范      | `pa-eval-backend/AGENTS.md`                   | 后端开发规范                                   |
| 前端规范      | `pa-eval-frontend/AGENTS.md`                  | 前端开发规范                                   |
| langfuse 源码 | `langfuse/`                                   | langfuse源码参考，在文档不清晰情况下可搜索源码 |
| 产品/技术文档 | `docs/prd/`、`docs/api/`、`docs/superpowers/` | 分别是需求、API说明、详细设计和计划            |

## 反模式

- 不要绕过 `get_db()` / SQLAlchemy session 直接 shell 到数据库。
- 不要直接修改 Langfuse 原生表结构；不要为了业务扩展给 Langfuse 原生表加字段、改字段类型或改约束。
- 不要直接用 SQL 对 Langfuse 原生表做新增、修改、删除，除非用户明确授权且没有可用接口路径；读取和分析可以使用联表查询。
- 不要把真实密钥、数据库口令或内网 token 写进文档、测试或前端代码。
