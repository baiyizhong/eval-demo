# PA Eval Backend

PA Eval 后端适配层用于代理 PA 前端请求，并通过 Langfuse Admin API 维护 Langfuse 原生组织。

## 本地启动

```bash
cd pa-eval-backend
uv sync
cp .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

`.env` 中需要配置：

```bash
LANGFUSE_BASE_URL=http://localhost:3000
LANGFUSE_ADMIN_API_KEY=replace-with-langfuse-admin-api-key
PA_EVAL_CORS_ORIGINS=http://localhost:5173
```

前端真实接口模式：

```bash
cd pa-eval-frontend
VITE_ENABLE_MOCK=false VITE_API_PROXY_TARGET=http://localhost:8000 npm run dev
```

## 已接入接口

- `GET /api/organizations`
- `POST /api/organizations`
- `GET /api/organizations/{organization_id}`
- `PATCH /api/organizations/{organization_id}`
- `GET /api/organizations/{organization_id}/api-keys`
- `POST /api/organizations/{organization_id}/api-keys`
- `DELETE /api/organizations/{organization_id}/api-keys/{api_key_id}`

组织成员接口暂未接入 Langfuse Admin API，会返回统一错误响应。
