# PA Eval 组织管理与项目管理设计

## 背景

PA Eval 基于 Langfuse 构建组织、项目、评测、数据集、评估器和 Trace 管理能力。当前设计目标是承接 `Enterprise Admin Dashboard DesignV3/` 中的企业后台信息架构，同时遵守项目规约：

- 不修改 Langfuse 原生表结构。
- 对 Langfuse 原生表中的新增、修改、删除优先通过接口或封装服务完成。
- 查询类操作可以使用 SQL 联表查询。
- 分页参数使用 `page`、`pageSize`。
- API 响应统一为 `{ code, message, data, txId }`。

## 目标

首版组织管理和项目管理实现一个管理闭环：

- 组织：创建、编辑、停用/启用、套餐、Trace 配额、用户上限、成员管理。
- 项目：创建、编辑、归档/恢复、删除、成员授权、项目 API Key 管理。
- 前端保持企业后台原型的两层导航：系统层和项目层。
- 组织停用只影响 PA Eval 前端和 PA Eval 业务 API，不阻断 Langfuse ingestion/API key 写入。

## 非目标

- 不新增组织主表。
- 不新增项目主表。
- 不修改 `organizations`、`projects`、`organization_memberships`、`project_memberships` 等 Langfuse 原生表结构。
- 首版不实现真实计费扣减和强一致配额流水。
- 首版不拦截 Langfuse 原生 ingestion 写入。

## 方案选择

采用“Langfuse 原生模型 + metadata 扩展 + PA 后端统一封装”。

- PA 组织等同 Langfuse `organizations`。
- PA 项目等同 Langfuse `projects`。
- PA 组织成员等同 Langfuse `organization_memberships`。
- PA 项目成员等同 Langfuse `project_memberships`。
- PA API Key 等同 Langfuse `api_keys`。
- PA 扩展字段写入 `metadata.paEval`。

这个方案的优点是升级风险低、数据事实来源清晰、无需同步两套组织项目模型。

## 数据模型

### 组织

复用 Langfuse `organizations`：

- `id`：组织 ID。
- `name`：组织名称。
- `created_at` / `updated_at`：创建与更新时间。
- `metadata.paEval`：PA Eval 扩展字段。

组织扩展字段：

```json
{
  "paEval": {
    "plan": "enterprise",
    "status": "active",
    "traceLimit": 500000,
    "userLimit": 50,
    "contactEmail": "admin@example.com",
    "description": "企业客户组织"
  }
}
```

`status` 首版支持：

- `active`
- `suspended`

`plan` 首版支持：

- `free`
- `pro`
- `enterprise`

### 项目

复用 Langfuse `projects`：

- `id`：项目 ID。
- `org_id`：所属组织。
- `name`：项目名称。
- `deleted_at`：Langfuse 删除态。
- `retention_days`：数据保留天数。
- `metadata.paEval`：PA Eval 扩展字段。

项目扩展字段：

```json
{
  "paEval": {
    "description": "客服智能机器人评测项目",
    "status": "active",
    "lastActiveAt": "2026-07-02T10:00:00Z"
  }
}
```

项目状态：

- `active`：可见且可用。
- `archived`：默认隐藏，可恢复，不设置 `deleted_at`。

项目删除：

- 删除必须走 Langfuse 删除流程。
- 删除后设置 `projects.deleted_at` 并触发 Langfuse 自身清理逻辑。
- PA 不直接硬删项目数据。

### 成员和角色

复用 Langfuse 角色：

- `OWNER`
- `ADMIN`
- `MEMBER`
- `VIEWER`
- `NONE`

组织成员复用 `organization_memberships`。

项目成员复用 `project_memberships`。

项目权限判断规则：

- 优先检查项目级角色。
- 如果没有项目级角色，则回退组织级角色。
- 显式 `NONE` 表示无权限。

## 后端 API

PA Eval 后端提供 v2 API，并统一响应格式。

### 组织接口

```text
GET    /api/v2/organizations?page&pageSize&keyword&status&plan
POST   /api/v2/organizations
GET    /api/v2/organizations/{orgId}
PATCH  /api/v2/organizations/{orgId}
PATCH  /api/v2/organizations/{orgId}/status
GET    /api/v2/organizations/{orgId}/members
PATCH  /api/v2/organizations/{orgId}/members/{userId}
DELETE /api/v2/organizations/{orgId}/members/{userId}
```

### 项目接口

```text
GET    /api/v2/organizations/{orgId}/projects?page&pageSize&keyword&status
POST   /api/v2/organizations/{orgId}/projects
GET    /api/v2/projects/{projectId}
PATCH  /api/v2/projects/{projectId}
PATCH  /api/v2/projects/{projectId}/archive
PATCH  /api/v2/projects/{projectId}/restore
DELETE /api/v2/projects/{projectId}
GET    /api/v2/projects/{projectId}/members
PATCH  /api/v2/projects/{projectId}/members/{userId}
DELETE /api/v2/projects/{projectId}/members/{userId}
GET    /api/v2/projects/{projectId}/api-keys
POST   /api/v2/projects/{projectId}/api-keys
DELETE /api/v2/projects/{projectId}/api-keys/{keyId}
```

### 响应格式

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "txId": "e123233adfasfdas"
}
```

分页响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 0,
    "datas": []
  },
  "txId": "e123233adfasfdas"
}
```

错误响应：

```json
{
  "code": 1001,
  "message": "参数错误",
  "data": {},
  "txId": "e123233adfasfdas"
}
```

## 数据流

### 组织列表

1. 前端请求 `GET /api/v2/organizations?page&pageSize&keyword&status&plan`。
2. 后端联表查询 `organizations`、`organization_memberships`、`projects`。
3. 从 `organizations.metadata.paEval` 解析套餐、状态、配额、联系人和描述。
4. 聚合用户数、项目数、Trace 用量。
5. 返回 `{ total, datas }`。

### 组织创建

1. 前端提交组织名称、联系人、套餐、配额。
2. 后端校验参数。
3. 优先调用 Langfuse 组织创建能力或项目内封装服务。
4. 将 PA 扩展字段写入 `organizations.metadata.paEval`。
5. 返回统一响应。

### 组织停用

1. 前端调用 `PATCH /api/v2/organizations/{orgId}/status`。
2. 后端更新 `organizations.metadata.paEval.status = "suspended"`。
3. PA 前端和 PA 业务 API 拒绝进入该组织或执行业务操作。
4. 不阻断 Langfuse ingestion/API key 写入。

### 项目创建

1. 前端在组织下创建项目。
2. 后端调用 Langfuse 项目创建接口或项目内封装服务。
3. 将描述和状态写入 `projects.metadata.paEval`。
4. 默认状态为 `active`。
5. 返回项目详情。

### 项目归档

1. 前端调用 `PATCH /api/v2/projects/{projectId}/archive`。
2. 后端更新 `projects.metadata.paEval.status = "archived"`。
3. 不设置 `deleted_at`。
4. 页面默认隐藏归档项目，但可以通过筛选显示。

### 项目删除

1. 前端二次确认。
2. 后端调用 Langfuse 删除项目逻辑。
3. Langfuse 设置 `deleted_at` 并触发自身清理流程。
4. PA 不直接硬删项目数据。

## 权限设计

组织权限：

- `OWNER`：管理组织、项目、成员、API Key 和高风险操作。
- `ADMIN`：管理项目和成员，不可转移组织所有权。
- `MEMBER`：进入授权项目，创建和运行评测任务。
- `VIEWER`：只读。
- `NONE`：无权限。

项目权限：

- 项目级角色优先。
- 没有项目级角色时，回退组织级角色。
- 删除项目、删除成员、停用组织要求 `OWNER` 或平台超级管理员。

平台超级管理员：

- 可访问系统层组织管理、用户管理、系统设置。
- 可跨组织查看和管理组织状态、套餐、配额。

## 前端设计

沿用 `Enterprise Admin Dashboard DesignV3` 的两层导航。

系统层：

- 项目列表。
- 租户/组织管理。
- 用户管理。
- 系统设置。

项目层：

- Trace 日志。
- 评测报告。
- LLM 评测。
- 人工标注。
- 数据集。
- 评估器管理。
- 项目设置。

组织管理页：

- 顶部统计：组织总数、企业版数量、专业版数量、停用数量。
- 表格字段：组织名称、套餐、状态、Trace 配额、用户数、创建时间、操作。
- 操作：编辑、配额、停用/启用、进入组织项目列表。

项目列表页：

- 搜索、状态过滤、是否显示归档项目。
- 卡片字段：项目名称、描述、Trace 数、最近活跃时间、状态。
- 操作：编辑、归档、恢复、删除、进入项目。

## 错误码

```text
0      success
1001   参数错误
1002   未登录或凭证无效
1003   无权限
1004   资源不存在
1005   资源冲突
1006   状态不允许
2001   Langfuse 接口调用失败
2002   Langfuse 数据不一致
5000   系统内部错误
```

所有错误响应必须带 `txId`。后端日志也必须带同一个 `txId`。

## 审计设计

首版优先复用现有日志和 Langfuse 审计能力。如果 PA 侧需要独立审计，再新增 `pa_audit_logs`。

必须审计的动作：

- 创建、编辑、停用、启用组织。
- 修改组织套餐、Trace 配额、用户上限。
- 新增、修改、删除组织成员。
- 创建、编辑、归档、恢复、删除项目。
- 新增、修改、删除项目成员。
- 创建、删除项目 API Key。

审计字段：

```text
tx_id
actor_user_id
org_id
project_id
resource_type
resource_id
action
before
after
created_at
```

## 测试设计

后端单元测试：

- metadata 读写合并：更新 `paEval` 不覆盖其他 metadata 字段。
- 组织状态过滤、套餐过滤、分页。
- 项目归档/恢复逻辑。
- 权限判断：组织角色、项目角色、平台超级管理员。
- 统一响应格式和错误码。

后端集成测试：

- 创建组织后可查询列表和详情。
- 创建项目后可进入项目列表。
- 归档项目默认隐藏，开启 `showArchived` 后可见。
- 删除项目走 Langfuse 删除逻辑，不直接硬删。
- 成员授权后项目权限生效。

前端测试：

- 组织列表筛选、分页、状态徽标。
- 项目卡片搜索、归档显示开关。
- 创建/编辑弹窗参数校验。
- 无权限按钮隐藏或禁用。
- API 错误消息展示。

## 风险和约束

- `metadata` 字段缺少数据库级约束，后端必须用 schema 严格校验。
- 复杂统计和配额流水不适合长期只放 metadata，后续可新增 PA 自定义表。
- 组织停用不阻断 Langfuse ingestion，因此运维上仍需区分 PA 业务停用和底层数据写入。
- 对 Langfuse 原生表的写操作应集中在服务层，避免散落 SQL 写入。
