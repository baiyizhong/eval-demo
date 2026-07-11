# PA Eval Workspace

## 本地长驻服务

后续启动前后端开发服务统一使用根目录脚本，服务会运行在 detached
`screen` session 中，终端关闭后不会退出：

```bash
scripts/dev-services.sh start
```

常用命令：

```bash
scripts/dev-services.sh status
scripts/dev-services.sh restart frontend
scripts/dev-services.sh restart backend
scripts/dev-services.sh stop
scripts/dev-services.sh logs frontend
scripts/dev-services.sh logs backend
```

默认端口：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8000`

默认日志：

- `pa-eval-frontend/.pae-frontend.log`
- `pa-eval-backend/.pae-backend.log`
