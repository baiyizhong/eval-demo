# Langfuse Organization Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `pa-eval-backend` 最小 FastAPI 适配层，让 PA 前端通过 `/api/organizations` 查询和创建 Langfuse 原生组织。

**Architecture:** `pa-eval-frontend` 继续请求 `/api`，Vite 代理到 `pa-eval-backend`；后端调用 Langfuse Admin API `/api/admin/organizations` 并转换为 PA 统一响应格式。创建和更新组织通过 Langfuse API 完成，PA 扩展字段写入 `metadata.paEval`，不修改 `langfuse/` 源码和 Langfuse 表结构。

**Tech Stack:** FastAPI、Pydantic Settings、httpx、pytest、uv。

## Global Constraints

- 始终使用简体中文响应。
- 不修改 `langfuse/` 目录。
- 不修改 Langfuse 原生表结构。
- 新增、修改、删除 Langfuse 原生数据优先通过 Langfuse API。
- Python 项目统一使用 `uv` 管理依赖、虚拟环境和命令运行。
- API 响应统一为 `{ code: number, message: string, data: any, txId: string }`。
- 分页参数统一使用 `page` 和 `pageSize`，分页数据为 `{ total, datas }`。
- 不自动执行 `git commit`。

---

### Task 1: 后端项目骨架和组织适配接口

**Files:**
- Create: `pa-eval-backend/pyproject.toml`
- Create: `pa-eval-backend/.env.example`
- Create: `pa-eval-backend/app/main.py`
- Create: `pa-eval-backend/app/config.py`
- Create: `pa-eval-backend/app/response.py`
- Create: `pa-eval-backend/app/errors.py`
- Create: `pa-eval-backend/app/schemas.py`
- Create: `pa-eval-backend/app/langfuse_client.py`
- Create: `pa-eval-backend/app/organizations.py`
- Create: `pa-eval-backend/tests/test_organizations.py`

**Interfaces:**
- Produces: `GET /api/organizations`、`POST /api/organizations`、`GET /api/organizations/{organization_id}`、`PATCH /api/organizations/{organization_id}`。
- Produces: `GET /api/organizations/{organization_id}/api-keys`、`POST /api/organizations/{organization_id}/api-keys`、`DELETE /api/organizations/{organization_id}/api-keys/{api_key_id}`。
- Consumes: Langfuse Admin API `GET/POST /api/admin/organizations`、`GET/PUT /api/admin/organizations/{id}`、组织 API Key 子资源。

- [ ] 写组织映射和 API 行为测试，先验证失败。
- [ ] 实现 FastAPI 配置、统一响应、错误处理、Langfuse client 和组织路由。
- [ ] 用 `uv run pytest` 验证测试通过。

### Task 2: 本地运行说明和前端联调

**Files:**
- Modify: `pa-eval-backend/README.md`

**Interfaces:**
- Consumes: Task 1 的 FastAPI app。
- Produces: 本地启动命令和环境变量说明。

- [ ] 补充 `uv sync`、`uv run uvicorn app.main:app --reload --port 8000` 说明。
- [ ] 说明前端真实模式使用 `VITE_ENABLE_MOCK=false` 和 `VITE_API_PROXY_TARGET=http://localhost:8000`。
- [ ] 启动后端并用 curl 冒烟 `/health` 和 `/api/organizations`。
