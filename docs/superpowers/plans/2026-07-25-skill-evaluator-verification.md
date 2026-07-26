# Skill 评估器联调验证步骤

## 1. 环境准备

### 1.1 创建 `.env` 文件

在项目根目录创建 `.env`（如已有则补充）：

```env
# Langfuse 连接（参考 langfuse/docker-compose.yml 中的值）
LANGFUSE_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/langfuse
LANGFUSE_BASE_URL=http://localhost:3000
LANGFUSE_CLICKHOUSE_URL=http://localhost:8123

# Langfuse 认证
LANGFUSE_SALT=<langfuse docker-compose 中的 NEXTAUTH_SECRET>
LANGFUSE_ADMIN_API_KEY=<langfuse admin api key>
PA_EVAL_AUTH_COOKIE_NAME=<cookie name>
PA_EVAL_AUTH_SECRET=<auth secret>

# pi-mono 配置
PA_EVAL_SKILL_ROOT=/var/lib/pa-eval/skills
PA_EVAL_PI_BINARY=pi
PA_EVAL_PI_MODEL=anthropic/claude-sonnet-4-20250514
PA_EVAL_PI_RPC_TIMEOUT=300

# 模型 API Key（pi-mono 子进程会读取）
ANTHROPIC_API_KEY=<your key>
```

### 1.2 启动服务

```bash
# 启动 Langfuse（如果还没启动）
cd langfuse
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
cd ..

# 启动 pa-eval-backend（带 pi-mono）
docker compose -f docker-compose.pa-eval.yml up -d --build

# 验证后端健康
curl http://localhost:8000/health

# 验证 pi CLI 在容器中可用
docker compose -f docker-compose.pa-eval.yml exec pa-eval-backend pi --version
```

## 2. 验证 Skill 管理

### 2.1 查看 Skill 列表（含预置）

```bash
# 替换 <token> 和 <projectId>
TOKEN=<你的登录 token>
PROJECT_ID=<项目 ID>

curl http://localhost:8000/api/projects/$PROJECT_ID/skills \
  -H "Cookie: <PA_EVAL_AUTH_COOKIE_NAME>=$TOKEN"
```

预期返回：
```json
{
  "code": 0,
  "data": {
    "total": 1,
    "datas": [{
      "name": "single-turn-quality",
      "description": "评估单轮问答的回答质量...",
      "source": "BUILTIN"
    }]
  }
}
```

### 2.2 上传自定义 Skill

创建一个测试 Skill 压缩包：

```bash
mkdir -p /tmp/test-skill
cat > /tmp/test-skill/SKILL.md << 'EOF'
---
name: test-accuracy
description: 测试用评估 Skill，从准确性维度评分。
---
# 测试评估
## 输入
JSON 数组，每元素含 input、output、expectedOutput。
## 输出
JSON 数组，每元素：
{"sampleId":"...","scores":[{"name":"accuracy","value":0.0}],"passed":true,"reason":"..."}
EOF
cd /tmp && zip -r test-skill.zip test-skill/
```

上传：

```bash
curl -X POST http://localhost:8000/api/projects/$PROJECT_ID/skills \
  -H "Cookie: <PA_EVAL_AUTH_COOKIE_NAME>=$TOKEN" \
  -F "name=test-accuracy" \
  -F "overwrite=false" \
  -F "file=@/tmp/test-skill.zip"
```

### 2.3 前端验证

1. 访问 `http://localhost:5173`
2. 进入项目 → 应用评测 → Skill 管理
3. 确认能看到预置 Skill 和上传的自定义 Skill
4. 点击"查看详情"查看 SKILL.md 内容
5. 删除自定义 Skill 验证删除功能

## 3. 创建 SKILL 评估器

### 3.1 通过前端创建

1. 进入 应用评测 → 评估器
2. 点击"新建评估器"
3. 类型选择"Skill"
4. 选择上传的 Skill
5. 配置输入变量（如 `input, output, expectedOutput`）
6. 配置输出变量映射
7. 保存

### 3.2 通过 API 创建

```bash
curl -X POST http://localhost:8000/api/evaluators \
  -H "Cookie: <PA_EVAL_AUTH_COOKIE_NAME>=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试 Skill 评估器",
    "type": "SKILL",
    "provider": "PI",
    "projectId": "'$PROJECT_ID'",
    "description": "测试",
    "endpointUrl": "test-accuracy",
    "evaluationScenario": "SINGLE_TURN",
    "inputVariables": ["input", "output", "expectedOutput"],
    "outputVariableMappings": [{
      "variableName": "accuracy",
      "scoreConfigName": "accuracy_score"
    }]
  }'
```

## 4. 执行评测任务

### 4.1 创建自动评测任务

通过前端：
1. 进入 应用评测 → 自动评测
2. 新建任务
3. 选择刚创建的 SKILL 评估器
4. 选择数据集
5. 运行

### 4.2 验证执行

```bash
# 查看任务状态
curl http://localhost:8000/api/projects/$PROJECT_ID/auto-evaluations \
  -H "Cookie: <PA_EVAL_AUTH_COOKIE_NAME>=$TOKEN"

# 查看后端日志，确认 pi rpc 子进程启动
docker compose -f docker-compose.pa-eval.yml logs -f pa-eval-backend | grep "pi rpc"
```

预期日志：
```
INFO:app.evaluation_runtime.skill_runner:starting pi rpc: pi --mode rpc --no-session ...
```

### 4.3 验证 Score 写入

任务完成后，在 Langfuse 的 Scores 页面或通过 API 查看：

```bash
curl http://localhost:8000/api/projects/$PROJECT_ID/evaluation-reports \
  -H "Cookie: <PA_EVAL_AUTH_COOKIE_NAME>=$TOKEN"
```

## 5. 常见问题排查

### pi CLI 未找到

```bash
docker compose exec pa-eval-backend which pi
# 应输出 /usr/local/bin/pi
```

### pi 启动失败

检查模型 API Key 是否注入：
```bash
docker compose exec pa-eval-backend env | grep ANTHROPIC_API_KEY
```

### Skill 不存在

确认 skill 目录挂载正确：
```bash
docker compose exec pa-eval-backend ls /var/lib/pa-eval/skills/
docker compose exec pa-eval-backend ls /var/lib/pa-eval/skills/_builtin/
```

### 评估超时

调整 `.env` 中 `PA_EVAL_PI_RPC_TIMEOUT`（默认 300 秒），或检查模型响应速度。
