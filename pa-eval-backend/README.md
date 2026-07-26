# PA Eval Backend

PA Eval 后端适配层用于代理 PA 前端请求，并通过 Langfuse Admin API 维护 Langfuse 原生组织。

## 本地启动

推荐使用仓库根目录的长驻启动脚本，前后端会分别运行在 detached
`screen` session 中，并写入 `.pae-backend.log` / `.pae-frontend.log`：

```bash
cd ..
scripts/dev-services.sh start
scripts/dev-services.sh status
```

常用操作：

```bash
scripts/dev-services.sh restart frontend
scripts/dev-services.sh restart backend
scripts/dev-services.sh stop
scripts/dev-services.sh logs frontend
```

后端手动前台启动命令仅用于临时调试：

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
LANGFUSE_SALT=replace-with-langfuse-salt
PA_EVAL_CORS_ORIGINS=http://localhost:5173
```

`LANGFUSE_ADMIN_API_KEY` 应与 Langfuse 服务的 `ADMIN_API_KEY` 保持一致。
如果运行环境已注入 `ADMIN_API_KEY`，PA 后端也会自动兼容该变量名。

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
