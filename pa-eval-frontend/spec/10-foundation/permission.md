# 前端权限使用规范

## 适用任务
本文档描述项目里的前端权限体系、Code 约定、Scope 规则、路由/菜单使用方式与前后端契约。若本文描述与当前源码存在差异，以本文作为权限体系目标设计，后续实现需向本文收敛。

## 一、权限模型

权限码使用字符串表示，统一采用 `domain:resource:action` 三段结构。页面级、菜单级与元素级共用同一套权限码。
`domain` 表示权限域，不表示具体资源 ID：

- `org`：组织级权限，控制当前组织下的平台/组织管理能力，例如项目管理、组织信息、组织成员。
- `project`：项目级权限，控制具体项目内能力，实际 scope 由 `projectId` 决定。
- `system`：系统级权限，控制不依赖组织或项目的全局能力，例如操作审计、后台管理。
- `platform`：平台级通用页面，控制弱业务页面或工作台页面。能归入 `org` 或 `system` 时优先使用明确 domain。

Scope 至少包含三类：

```ts
type PermissionScope =
  | { type: 'org'; orgId?: string }
  | { type: 'project'; projectId?: string }
  | { type: 'system' }
```

权限计算建议由 store 提供统一入口：

```ts
getPermissionsForOrg(orgId?: string): PermissionCode[]
getPermissionsForProject(projectId?: string): PermissionCode[]
getSystemPermissions(): PermissionCode[]
getPermissionsForScope(scope: PermissionScope): PermissionCode[]
```

规则：

1. `superAdmin = true` 时任意权限通过，权限方法可直接返回 `['*']`。
2. `getPermissionsForOrg(orgId)` 返回指定组织的 `org.permissions`。
3. `getPermissionsForProject(projectId)` 找到指定项目后：
   - 项目对象存在 `permissions` 字段时，使用项目权限，包括空数组。
   - 项目对象不存在 `permissions` 字段时，继承所属组织的 `org.permissions`。
4. `getSystemPermissions()` 返回顶层 `permissions`。
5. 找不到对应组织、项目或系统权限不存在时返回空数组。

如果 store 中维护当前选择的 `orgId` 和 `projectId`，上述方法允许省略参数并默认使用当前值：

```ts
getPermissionsForOrg(orgId ?? currentOrgId)
getPermissionsForProject(projectId ?? currentProjectId)
```

但路由守卫和菜单过滤仍应优先显式传入 URL 或菜单项关联的 `projectId`，避免当前选择状态与实际页面 URL 不一致。

禁止用空字符串 `''` 或假 `projectId` 兜底获取权限。组织级页面必须走 org scope，系统级页面必须走 system scope，项目级页面必须走真实 project scope。

## 二、前后端字段约定

后端返回的权限载荷至少包含：

```json
{
  "superAdmin": false,
  "permissions": ["system:audit:view"],
  "orgs": [
    {
      "id": "org-1",
      "name": "某组织",
      "permissions": ["org:project:view", "org:project:edit"],
      "projects": [
        {
          "id": "project-1",
          "name": "项目A"
        },
        {
          "id": "project-2",
          "name": "项目B",
          "permissions": ["project:dataset:view", "project:dataset:edit"]
        }
      ]
    }
  ]
}
```

规则：

- `superAdmin`：是否为超管。
- `permissions`：顶层系统级/平台级权限，主要用于 `system:*:*` 和无法归入具体组织、项目的页面。
- `orgs`：用户所属组织及组织级权限。
- `projects`：组织下项目列表，`permissions` 可选。
  - 存在时，包括空数组，表示显式配置。
  - 不存在时，表示未显式配置，继承组织级权限。

`/api/user/session` 返回当前用户会话与权限初始化所需数据，包含当前用户基础信息和权限载荷。

当前 mock 接口为 `/api/user/session`，返回形态是 `{ code, data }`，`bootstrap()` 会优先读取 `result.data`，没有 `data` 时直接使用 `result`。

## 三、权限代码规则

`src/lib/permission.ts` 的实际匹配规则如下：

- 用户有效权限包含 `*` 时，任意权限都通过。
- 请求权限码与用户权限码完全一致时通过。
- 权限码按 `:` 拆分后段数必须一致。
- 用户有效权限码的任意一段都可以写 `*` 作为通配，例如 `org:*:view`、`project:dataset:*`、`system:*:view`。

示例：

```txt
org:project:view
org:project:edit
org:member:view
project:dataset:view
project:dataset:edit
project:*:view
project:dataset:*
system:audit:view
system:backend:*
system:organization:create
*
```

业务命名必须保持统一，不要在新增模块混用二段与三段权限码。旧 mock 或旧示例中的 `user:view`、`project:list`、`project:delete` 只作为历史兼容参考，不作为新增权限码。

### action 约定

当前权限粒度分为 `view` 和 `edit` 两类：

- `view`：控制页面进入、菜单显示、列表查询、详情查询和只读信息展示。
- `edit`：控制新建、编辑、删除、归档、恢复、导入、执行、重跑、回流、生成密钥等写操作。

`edit` 不自动包含 `view`。当前匹配器只做精确匹配和同段数通配匹配，不做权限蕴含推导。

编辑角色应由后端同时下发 `view` 和 `edit`：

```txt
project:dataset:view
project:dataset:edit
```

或使用通配：

```txt
project:dataset:*
project:*:*
```

## 四、超管语义

`superAdmin = true` 时，前端视为具备全部权限。

具体实现上，权限计算方法返回 `['*']` 即可，因此路由守卫、菜单过滤与元素级控制都会通过普通权限匹配自然放行。

`superAccess` 表示仅超管可访问。普通用户即使拥有其他权限码，也不能访问 `superAccess` 内容。

## 五、前端使用方式

### 路由级

当前项目不是在 route object 上直接挂 `access` 或 `superAccess` 字段，而是在需要保护的 `element` 外层包 `RouteGuard`，并通过 `accessConfig` 传入权限配置。

```tsx
import { RouteGuard } from '@/components/common/route-guard'

{
  path: 'settings/members',
  element: (
    <RouteGuard
      accessConfig={{
        scope: { type: 'org' },
        access: 'org:member:view',
      }}
    >
      <SettingsOrganizationMembers />
    </RouteGuard>
  ),
}
```

仅超管访问：

```tsx
{
  path: 'admin',
  element: (
    <RouteGuard accessConfig={{ superAccess: true }}>
      <AdminPage />
    </RouteGuard>
  ),
}
```

项目维度权限：

```tsx
{
  path: 'projects/:projectId/evaluation/datasets',
  element: (
    <ProjectRouteGuard access="project:dataset:view">
      <ProjectDatasets />
    </ProjectRouteGuard>
  ),
}
```

`ProjectRouteGuard` 是推荐封装，内部从 URL params 读取真实 `projectId`，再调用 `RouteGuard`：

```tsx
function ProjectRouteGuard({
  access,
  children,
}: {
  access: string | string[]
  children: ReactNode
}) {
  const { projectId } = useParams()

  return (
    <RouteGuard
      accessConfig={{ scope: { type: 'project', projectId }, access }}
    >
      {children}
    </RouteGuard>
  )
}
```

`RouteAccessConfig` 字段：

- `access?: string | string[]`：允许字符串或数组，数组间为 OR 关系。
- `superAccess?: boolean`：仅允许超管访问。
- `scope?: PermissionScope`：用于指定 org/project/system 权限域。

路由守卫不满足时会 `navigate('/403', { replace: true })`，并在跳转前返回 `null`。

父级 layout 路由如 `/settings`、`/projects/:projectId/evaluation`、`/projects/:projectId/settings` 可以只负责布局和 redirect；真正页面由子路由控制权限。若父级本身有可访问页面，也必须配置对应 `view` 权限。

### 菜单级

侧边栏菜单数据来自 `useSidebarData()` 请求的 `/api/projects`，再由前端本地构造 `teams` 和 `menuGroups`。菜单项类型需支持 `access`、`superAccess`、`scope`：

```ts
{
  title: '应用评测',
  url: `/projects/${projectId}/evaluation`,
  icon: 'Database',
  access: 'project:dataset:view',
  scope: { type: 'project', projectId },
}
```

过滤规则与路由类似：

- `superAccess` 为 true 且当前用户不是超管时隐藏。
- `access` 为字符串或数组时，任意一个权限码匹配即可显示。
- 子菜单会递归过滤，过滤后没有子项的分组会被隐藏。

菜单过滤必须按菜单项自身 scope 取权限：

- 顶栏 `/apps`、`/settings`：使用 org scope。
- 顶栏 `/audit`、`/backend`：使用 system scope 或 `superAccess`。
- 项目侧边栏：使用 URL 中的真实 `projectId`。

禁止菜单过滤固定调用 `getPermissionsForProject('')`。这样会导致组织级和系统级菜单无法正确判断权限。

### 元素级

使用 `Can` 组件控制按钮、菜单项等：

```tsx
import { Can } from '@/components/common/permission/can'

<Can permission="project:dataset:edit" fallback={null}>
  <Button>新建数据集</Button>
</Can>
```

- `fallback`：无权限时渲染内容，默认 `null`。
- 当前作用域由外层 `PermissionScopeProvider` 注入。
- 如果没有外层 scope，hook 应使用当前选择的组织/项目或返回空权限。具体默认规则必须在 store 中统一定义，不能在业务组件里自行拼接。

项目作用域示例：

```tsx
import { PermissionScopeProvider } from '@/components/common/permission/permission-scope'

<PermissionScopeProvider scope={{ type: 'project', projectId: 'project-1' }}>
  <Can permission="project:dataset:edit">
    <Button>更新数据集</Button>
  </Can>
</PermissionScopeProvider>
```

组织作用域示例：

```tsx
<PermissionScopeProvider scope={{ type: 'org' }}>
  <Can permission="org:project:edit">
    <Button>创建项目</Button>
  </Can>
</PermissionScopeProvider>
```

### Hook 级

在组件内直接判断权限：

```ts
const { can, canAny, canAll } = usePermission({
  type: 'project',
  projectId: 'project-1',
})

if (can('project:dataset:view')) {
  // ...
}

if (canAny(['project:dataset:view', 'project:evaluator:view'])) {
  // ...
}

if (canAll(['project:dataset:view', 'project:dataset:edit'])) {
  // ...
}
```

推荐将 `usePermission(projectId?: string)` 升级为 `usePermission(scope?: PermissionScope)`。hook 负责组件层使用体验，底层仍复用 store 的 `getPermissionsForScope()`。

`RouteGuard` 这类需要在非 hook 函数里复用权限判断的场景，必须直接调用 store 的权限方法，不要在普通函数中调用 React hook。

## 六、页面权限分配建议

### 组织级页面

| 页面/路由 | Scope | 查看权限 | 编辑权限 |
| --- | --- | --- | --- |
| `/apps` 项目管理 | `org` | `org:project:view` | `org:project:edit` |
| `/settings/info` 组织信息 | `org` | `org:organization:view` | `org:organization:edit` |
| `/settings/members` 组织成员 | `org` | `org:member:view` | `org:member:edit` |

`/apps` 没有 `projectId`，必须按当前组织控制权限：

- 进入页面和查看项目列表：`org:project:view`
- 创建、编辑、归档、恢复项目：`org:project:edit`

### 项目级页面

| 页面/路由 | Scope | 查看权限 | 编辑权限 |
| --- | --- | --- | --- |
| `/projects/:projectId/observability/traces/dashboard` | `project` | `project:trace:view` | 暂无 |
| `/projects/:projectId/observability/traces/logs` | `project` | `project:trace:view` | `project:trace:edit` |
| `/projects/:projectId/evaluation/datasets`、详情 | `project` | `project:dataset:view` | `project:dataset:edit` |
| `/projects/:projectId/evaluation/evaluators` | `project` | `project:evaluator:view` | `project:evaluator:edit` |
| `/projects/:projectId/evaluation/annotation-queues`、详情 | `project` | `project:annotation:view` | `project:annotation:edit` |
| 标注执行页 `batch-annotate` / `annotate` | `project` | `project:annotation:view` | `project:annotation:edit` |
| `/projects/:projectId/evaluation/auto-evaluations`、详情 | `project` | `project:auto-evaluation:view` | `project:auto-evaluation:edit` |
| `/projects/:projectId/evaluation/auto-evaluations/new` | `project` | 可不单独配置 | `project:auto-evaluation:edit` |
| `/projects/:projectId/evaluation/reports`、详情 | `project` | `project:evaluation-report:view` | `project:evaluation-report:edit` |
| `/projects/:projectId/scheduled-jobs` | `project` | `project:scheduled-job:view` | `project:scheduled-job:edit` |
| `/projects/:projectId/settings/general` | `project` | `project:settings:view` | `project:settings:edit` |
| `/projects/:projectId/settings/score-configs` | `project` | `project:score-config:view` | `project:score-config:edit` |
| `/projects/:projectId/settings/members` | `project` | `project:member:view` | `project:member:edit` |
| `/projects/:projectId/settings/models` | `project` | `project:model:view` | `project:model:edit` |
| `/projects/:projectId/settings/api-keys` | `project` | `project:api-key:view` | `project:api-key:edit` |

标注执行页属于写入评分结果的工作流，页面入口建议直接要求 `project:annotation:edit`。如果产品需要允许只读查看标注对象，再单独拆只读详情页。

### 系统级页面

| 页面/路由 | Scope | 查看权限 | 编辑权限 |
| --- | --- | --- | --- |
| `/audit` 操作审计 | `system` | `system:audit:view` | 通常无 |
| `/backend` 后台管理 | `system` 或 `superAccess` | `system:backend:view` | `system:backend:edit` |
| 创建组织 | `system` 或 `superAccess` | 可不单独配置 | `system:organization:create` |

`/backend` 如果只允许超管访问，优先使用 `superAccess: true`，不要额外配置普通权限码。若后续需要非超管后台管理员，再启用 `system:backend:view/edit`。

创建组织不依赖已有组织 ID，权限码长期保留为 `system:organization:create`。当前版本仅允许超级管理员创建组织，前端入口优先使用 `superAdmin` / `superAccess` 控制；普通 Org Owner 暂不返回该权限码。

### 公共或弱权限页面

| 页面/路由 | 建议 |
| --- | --- |
| `/login`、`/environment`、错误页 | public，不配置权限 |
| `/help` 帮助文档 | 登录可见即可，通常不配置权限 |
| `/permissions` 申请权限 | 登录可见即可，通常不配置权限 |
| `/dashboard` 工作台 | 可配置 `platform:dashboard:view`，或随登录可见 |

## 七、目录与文件职责

| 文件                                                    | 职责                             |
| ------------------------------------------------------- | -------------------------------- |
| `src/types/permission.ts`                               | 权限类型定义                     |
| `src/lib/permission.ts`                                 | permission code 匹配工具         |
| `src/stores/session.store.ts`                           | 会话/权限 Zustand store 与 scope 计算 |
| `src/hooks/use-permission.ts`                           | 业务权限 hook                    |
| `src/components/common/route-guard.tsx`                 | 路由级权限守卫                   |
| `src/hooks/use-sidebar-data.ts`                         | 侧边栏数据请求与菜单权限过滤     |
| `src/components/common/permission/permission-scope.tsx` | Scope Provider                   |
| `src/components/common/permission/can.tsx`              | 元素级权限控制组件               |

## 八、初始化约定

`bootstrap()` 放在 `src/main.tsx` 中，负责：

1. 请求会话权限数据，当前地址为 `/api/user/session`。
2. 将权限写入 Zustand store。
3. 创建 router 并渲染主应用。
4. 若加载失败，写入最小默认权限：

```ts
{
  superAdmin: false,
  permissions: [],
  orgs: [],
}
```

当前失败处理只输出 `console.error`，没有 toast 提示。
