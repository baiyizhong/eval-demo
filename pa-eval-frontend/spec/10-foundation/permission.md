# 前端权限使用规范

## 适用任务

- 处理与本文标题相关的开发、重构或评审任务。

## 相关源码

- 以本文后续“适用范围”“项目事实”“组件定位”“文件职责”列出的路径为准。

## 必读前置

- `spec/README.md`

## 核心规则

- 先阅读本文后续的目标、必须遵守、规则和使用约定，再修改代码。

## 推荐示例

- 优先采用本文后续推荐用法和模板示例。

## 禁止事项

- 以本文后续“禁止事项”“约束”“大模型修改约束”为准。

## 检查清单

- 按本文后续检查清单和 `spec/README.md` 验证命令完成自检。

本文档描述当前 `src` 项目里的前端权限体系、Code 约定、Scope 规则、路由/菜单使用方式与前后端契约。内容以当前源码实现为准。

## 一、权限模型

权限码使用字符串表示，推荐业务上保持 `domain:resource:action` 或 `resource:action` 一类稳定结构。页面级、菜单级与元素级共用同一套权限码。

Scope 当前由组织与项目两层组成：

- `org`：组织级权限，保存在 `org.permissions`。
- `project`：项目级权限，保存在 `project.permissions`。

权限计算入口是 `usePermissionStore.getState().getPermissionsForProject(projectId)`：

1. `superAdmin = true` 时直接返回 `['*']`。
2. 找到指定 `projectId` 对应的项目后：
   - 项目对象存在 `permissions` 字段时，使用项目权限，包括空数组。
   - 项目对象不存在 `permissions` 字段时，继承所属组织的 `org.permissions`。
3. 找不到指定项目时返回空数组。

注意：当前路由和侧边栏默认都会以空字符串 `''` 作为项目 ID 取权限。若普通用户需要命中组织权限，必须存在对应项目并触发继承，或在使用处显式传入真实 `projectId`。

## 二、前后端字段约定

后端返回的权限载荷至少包含：

```json
{
  "user": {
    "id": 1001,
    "name": "张三"
  },
  "superAdmin": false,
  "orgs": [
    {
      "id": "org-1",
      "name": "某组织",
      "permissions": ["user:view", "project:list"],
      "projects": [
        {
          "id": "project-1",
          "name": "项目A"
        },
        {
          "id": "project-2",
          "name": "项目B",
          "permissions": ["project:delete"]
        }
      ]
    }
  ]
}
```

规则：

- `user`：当前登录用户。
- `superAdmin`：是否为超管。
- `orgs`：用户所属组织及组织级权限。
- `projects`：组织下项目列表，`permissions` 可选。
  - 存在时，包括空数组，表示显式配置。
  - 不存在时，表示未显式配置，继承组织级权限。

当前 mock 接口为 `/api/permissions`，返回形态是 `{ code, data }`，`bootstrap()` 会优先读取 `result.data`，没有 `data` 时直接使用 `result`。

## 三、权限代码规则

`src/lib/permission.ts` 的实际匹配规则如下：

- 用户有效权限包含 `*` 时，任意权限都通过。
- 请求权限码与用户权限码完全一致时通过。
- 权限码按 `:` 拆分后段数必须一致。
- 用户有效权限码的任意一段都可以写 `*` 作为通配，例如 `user:*`、`system:*:view`。

示例：

```txt
user:view
user:write
project:list
project:delete
system:user:view
system:user:*
*
```

业务命名建议保持统一，不要在同一模块混用二段与三段权限码。当前源码示例里路由使用的是 `user:view`，mock 权限里有 `user:read`、`user:write`。

## 四、超管语义

`superAdmin = true` 时，前端视为具备全部权限。

具体实现是 `getPermissionsForProject()` 返回 `['*']`，因此路由守卫、菜单过滤与元素级控制都会通过普通权限匹配自然放行。

`superAccess` 表示仅超管可访问。普通用户即使拥有其他权限码，也不能访问 `superAccess` 内容。

## 五、前端使用方式

### 路由级

当前项目不是在 route object 上直接挂 `access` 或 `superAccess` 字段，而是在需要保护的 `element` 外层包 `RouteGuard`，并通过 `accessConfig` 传入权限配置。

```tsx
import { RouteGuard } from '@/components/common/route-guard'

{
  path: 'users',
  element: (
    <RouteGuard accessConfig={{ access: ['user:view'] }}>
      <Users />
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
  path: 'projects/:projectId/tasks',
  element: (
    <RouteGuard accessConfig={{ projectId: 'project-1', access: 'task:view' }}>
      <Tasks />
    </RouteGuard>
  ),
}
```

`RouteAccessConfig` 字段：

- `access?: string | string[]`：允许字符串或数组，数组间为 OR 关系。
- `superAccess?: boolean`：仅允许超管访问。
- `projectId?: string`：用于项目维度权限检查；未传时当前实现使用 `''`。

路由守卫不满足时会 `navigate('/403', { replace: true })`，并在跳转前返回 `null`。

### 菜单级

侧边栏菜单数据来自 `useSidebarData()` 请求的 `/api/sidebar`。菜单项类型支持 `access`、`superAccess`、`projectId`：

```ts
{
  title: 'Users',
  url: '/users',
  icon: 'Users',
  access: 'user:view',
}
```

过滤规则与路由类似：

- `superAccess` 为 true 且当前用户不是超管时隐藏。
- `access` 为字符串或数组时，任意一个权限码匹配即可显示。
- 子菜单会递归过滤，过滤后没有子项的分组会被隐藏。

注意：虽然类型里有 `projectId`，但当前 `useSidebarData()` 实现固定调用 `getPermissionsForProject('')`，尚未按菜单项自身的 `projectId` 分别取权限。

### 元素级

使用 `Can` 组件控制按钮、菜单项等：

```tsx
import { Can } from '@/components/common/permission/can'

<Can permission="user:delete" fallback={null}>
  <Button>删除用户</Button>
</Can>
```

- `fallback`：无权限时渲染内容，默认 `null`。
- 当前作用域由外层 `PermissionScopeProvider` 注入。
- 如果没有外层 scope，`usePermission(projectId)` 会收到 `undefined`，当前有效权限为空数组。

项目作用域示例：

```tsx
import { PermissionScopeProvider } from '@/components/common/permission/permission-scope'

<PermissionScopeProvider projectId="project-1">
  <Can permission="task:update">
    <Button>更新任务</Button>
  </Can>
</PermissionScopeProvider>
```

### Hook 级

在组件内直接判断权限：

```ts
const { can, canAny, canAll } = usePermission('project-1')

if (can('user:view')) {
  // ...
}

if (canAny(['user:view', 'user:list'])) {
  // ...
}

if (canAll(['user:view', 'project:list'])) {
  // ...
}
```

注意：当前 `usePermission()` 不传 `projectId` 时不会默认使用组织权限，而是返回空权限集合。

## 六、目录与文件职责

| 文件                                                    | 职责                             |
| ------------------------------------------------------- | -------------------------------- |
| `src/types/permission.ts`                               | 权限类型定义                     |
| `src/lib/permission.ts`                                 | permission code 匹配工具         |
| `src/stores/permission.store.ts`                        | 权限 Zustand store 与 scope 计算 |
| `src/hooks/use-permission.ts`                           | 业务权限 hook                    |
| `src/components/common/route-guard.tsx`                 | 路由级权限守卫                   |
| `src/hooks/use-sidebar-data.ts`                         | 侧边栏数据请求与菜单权限过滤     |
| `src/components/common/permission/permission-scope.tsx` | Scope Provider                   |
| `src/components/common/permission/can.tsx`              | 元素级权限控制组件               |

## 七、初始化约定

`bootstrap()` 放在 `src/main.tsx` 中，负责：

1. 请求权限数据，当前地址为 `/api/permissions`。
2. 将权限写入 Zustand store。
3. 创建 router 并渲染主应用。
4. 若加载失败，写入最小默认权限：

```ts
{
  user: { id: 0, name: 'Guest' },
  superAdmin: false,
  orgs: [],
}
```

当前失败处理只输出 `console.error`，没有 toast 提示。
