# PA Eval 组织管理前端设计

日期：2026-07-02

## 背景

本设计基于 `docs/prd/组织管理模块需求描述.md`，目标是在 `pa-eval-frontend` 中实现组织管理模块的前端 mock 闭环。当前前端已使用 `npm run dev:mock` 启动，后端真实接口不在本次范围内。

本次只修改 `pa-eval-frontend` 与必要的项目设计文档，不修改 `langfuse/` 参考代码，不修改 Langfuse 原生表结构。

## 目标

- 在顶部导航右侧展示当前用户与当前组织切换器。
- 默认选中当前用户有权限的第一个组织。
- 用户没有组织时展示友好空状态，并提供创建组织入口。
- 将顶部“组织管理”入口落到组织设置页面。
- 组织设置页包含三块能力：组织信息、组织人员、API Key 管理。
- 使用 mock API 完整演示组织创建、编辑、成员管理、批量导入和 API Key 生命周期。

## 非目标

- 不接入真实后端接口。
- 不实现真实登录态、真实鉴权、真实文件上传解析服务。
- 不新增或修改 Langfuse 数据库表。
- 不修改 `langfuse/` 目录。
- 不实现全局系统租户列表后台。

## 推荐方案

采用方案 A：复用现有 `/settings` 入口，将它改造为组织管理设置页。

路由结构：

- `/settings` 重定向到 `/settings/info`
- `/settings/info`：组织信息
- `/settings/members`：组织人员
- `/settings/api-keys`：API Key 管理

该方案最贴合 PRD 中“基于右上角当前组织切换器的设置型页面”的模型，改动集中，也与前端现有 `settings-page-layout` 规范一致。

## 信息架构

顶部导航保留现有一级入口：

- 项目管理：`/apps`
- 组织管理：`/settings`
- 操作审计：暂保持现状
- 后台管理：暂保持现状

顶部右侧新增组织切换器，位于帮助/权限入口与用户头像之间。切换器展示当前组织名称，点击后显示：

- 当前用户可访问的组织列表
- 当前选中组织状态
- 创建组织入口

组织管理页左侧配置导航：

- 组织信息
- 组织人员
- API Key 管理

## 状态设计

新增组织上下文状态，建议放在 `src/stores/organization.store.ts` 或组织模块内部 store。由于当前组织会影响项目管理和后续项目内页面，推荐使用全局 store。

状态字段：

- `organizations`：当前用户可访问的组织列表
- `currentOrganizationId`：当前组织 ID
- `isLoaded`：组织列表是否已加载
- `setOrganizations()`：写入组织列表，默认选中第一个组织
- `setCurrentOrganizationId()`：切换组织
- `upsertOrganization()`：创建或更新组织后同步状态
- `removeOrganization()`：后续如支持删除组织时使用

无组织时：

- `organizations` 为空
- 顶部组织切换器显示“暂无组织”
- `/settings/*` 展示空状态，提供“创建组织”按钮

## API 契约

在 `src/modules/organization-management/api/index.ts` 声明模块 API alias，并在 `src/api/registry.ts` 注册。

mock 接口统一返回项目规约格式，前端 axios 拦截器会解包 `data`。

接口建议：

- `GET /api/organizations`：获取当前用户可访问组织列表
- `POST /api/organizations`：创建组织
- `GET /api/organizations/:organizationId`：获取组织详情
- `PATCH /api/organizations/:organizationId`：更新绑定子系统和描述
- `GET /api/organizations/:organizationId/members?page=&pageSize=&keyword=`：成员分页
- `POST /api/organizations/:organizationId/members`：新增成员
- `PATCH /api/organizations/:organizationId/members/:memberId`：修改成员角色
- `DELETE /api/organizations/:organizationId/members/:memberId`：移除成员
- `POST /api/organizations/:organizationId/members/import`：批量导入成员
- `GET /api/organizations/:organizationId/api-keys?page=&pageSize=`：API Key 分页
- `POST /api/organizations/:organizationId/api-keys`：创建 API Key
- `DELETE /api/organizations/:organizationId/api-keys/:keyId`：删除 API Key

分页请求统一使用 `page`、`pageSize`。分页响应的 `data` 统一为：

```json
{
  "total": 0,
  "datas": []
}
```

## 数据模型

组织：

- `id`
- `name`
- `description`
- `subsystem`
- `role`
- `createdAt`
- `createdBy`
- `publicKey`
- `secretKeyMasked`

成员：

- `id`
- `name`
- `email`
- `role`：`OWNER`、`ADMIN`、`MEMBER`、`VIEWER`
- `status`
- `joinedAt`

API Key：

- `id`
- `name`
- `publicKey`
- `secretKeyMasked`
- `secretKey`：仅创建成功响应中返回一次
- `createdAt`
- `lastUsedAt`
- `createdBy`

导入失败项：

- `row`
- `field`
- `reason`

## 页面与组件拆分

建议新增目录：

```text
src/modules/organization-management/
  api/index.ts
  data/schema.ts
  hooks/use-organizations.ts
  index.tsx
  components/organization-switcher.tsx
  components/create-organization-drawer.tsx
  views/info/index.tsx
  views/info/organization-info-form.tsx
  views/members/index.tsx
  views/members/member-form-drawer.tsx
  views/members/member-import-result-dialog.tsx
  views/api-keys/index.tsx
  views/api-keys/create-api-key-dialog.tsx
```

`Settings` 父页面可保留文件位置，但页面语义改为组织管理，或者由 `Settings` 轻量包装 `OrganizationManagement`。为避免路由迁移过大，推荐保留 `src/modules/settings/index.tsx` 作为设置布局入口，将内容切换为组织管理导航。

## 组织信息

组织信息页展示：

- 组织名称：只读，创建后不可修改
- 绑定子系统：可编辑
- 组织描述：可编辑
- 组织级 PK：只读展示，可复制
- SK：仅显示脱敏值

创建组织使用抽屉：

- 组织名称
- 绑定子系统
- 组织描述

创建成功后：

- 自动写入 mock 组织列表
- 当前组织切换到新组织
- 生成组织级 PK/SK
- SK 在创建成功结果中明文展示一次

## 组织人员

成员列表使用 `DataTable`，支持分页、关键词搜索和角色筛选。

操作规则：

- `OWNER` 可新增、导入、修改所有成员角色、删除成员。
- `ADMIN` 可新增、导入、修改非 Owner 成员、删除非 Owner 成员，不能授予 Owner。
- `MEMBER` 与 `VIEWER` 不展示管理操作。
- 禁止删除最后一个 Owner。

新增成员使用抽屉或弹窗：

- 姓名
- 邮箱
- 角色

批量导入使用现有 `ImportDialog`：

- 支持 `.csv`
- 调用方负责模拟解析和 mock 提交
- 导入失败展示行号、字段、原因

## API Key 管理

API Key 列表使用 `DataTable`，展示名称、PK、脱敏 SK、创建人、创建时间、最近使用时间和操作。

创建 API Key 使用弹窗：

- 输入 Key 名称
- 创建成功后展示 `publicKey` 和一次性 `secretKey`
- 提供复制按钮

删除 API Key 使用确认弹窗。

## 权限与错误处理

mock 层按照当前组织中的当前用户角色返回可操作能力。前端按钮和危险操作都需要双层处理：

- UI 层隐藏或禁用不允许的操作。
- mock API 层仍校验角色，返回非 0 `code` 和中文错误信息。

典型错误：

- `无权限管理组织成员`
- `Admin 不能授予 Owner 角色`
- `不能删除最后一个 Owner`
- `组织名称创建后不可修改`
- `API Key Secret 仅创建时展示一次`

## 测试与验收

实现完成后至少运行：

- `npm run typecheck`
- 按需运行 `npm run lint`

手工验收路径：

- 访问 `http://localhost:5173/apps`，顶部可看到组织切换器。
- 切换到 `/settings` 后默认进入组织信息页。
- 创建组织后自动切换当前组织。
- 编辑组织时组织名称不可修改。
- 成员页分页参数为 `page`、`pageSize`。
- Admin 无法授予 Owner，无法删除 Owner。
- 删除最后一个 Owner 被阻止。
- 批量导入失败项展示行号、字段和原因。
- 创建 API Key 后明文 SK 只展示一次，列表仅展示脱敏值。
- 无组织状态可创建第一个组织。

## 后续真实接口接入

真实后端接入时保持前端 API alias 不变，只替换 mock handler 对应的真实接口实现。

后端实现应优先复用 Langfuse 组织、成员、项目和 API Key 语义；确需新增表时使用 `pa_` 前缀。不修改 Langfuse 原生表结构。对 Langfuse 原生表数据进行新增、修改、删除时优先通过接口完成，查询类操作可以联表查询。
