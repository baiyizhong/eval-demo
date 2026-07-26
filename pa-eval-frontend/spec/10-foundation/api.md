# API Spec

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

## 目标

统一项目中的接口声明、注册和调用方式，让业务代码通过类型一致的扁平 `$api` 调用后端资源。

## 适用范围

- `src/api/*`
- `src/config/*`
- `src/hooks/use-api.ts`
- `src/lib/query-client.ts`
- `src/modules/<module-name>/api/*`
- 任何需要请求后端接口的视图、组件、hooks 或 store

## 项目事实

- 环境变量位于 `src/config/env.ts`，统一管理所有 `VITE_*` 变量。
- 应用配置位于 `src/config/app.ts`。
- Axios 实例位于 `src/api/request.ts`。
- API client 生成逻辑位于 `src/api/create-api.ts`。
- API 类型位于 `src/api/types.ts`。
- API 相关测试位于 `tests/api/`。
- 全局 registry 位于 `src/api/registry.ts`。
- 全局 API 单例位于 `src/api/index.ts`，可直接导入用于非 React 上下文。
- 业务侧通过 `src/hooks/use-api.ts` 暴露的 `useAPI()` 获取 `$api`。
- `src/modules/organization-management/api/index.ts` 是当前 API alias 示例之一。
- `request` 的配置来自 `env`（`apiBaseURL`、`apiTimeout`、`apiWithCredentials`）。
- React Query 的 `queryClient` 实例位于 `src/lib/query-client.ts`，可在全局操作缓存。

## 必须遵守

- API alias 使用全局扁平结构，alias 名称必须唯一。
- alias 使用动词开头的 camelCase，例如 `listUsers`、`getUser`、`createUser`。
- alias 的 `url` 写相对 `VITE_API_BASE_URL` 的资源路径，例如 `/users/:id`。
- 模块 API 先放在 `src/modules/<module-name>/api/index.ts`。
- 新增模块 API 后，必须在 `src/api/registry.ts` 中展开注册。
- 业务代码必须通过 `const $api = useAPI()` 调用接口。
- 路径参数放 `path`，查询参数放 `query`，请求体放 `body`，单次 headers 放 `headers`，Axios 覆盖配置放 `config`。
- `config` 可传入单次请求的 Axios 配置，例如 `signal`、`responseType`、`onUploadProgress`、`onDownloadProgress`。
- API alias 可声明 endpoint 默认 Axios 配置，但不能覆盖 `url`、`method`、`params`、`data` 这些由 API 层统一生成的字段。
- GET 接口允许把普通对象作为 query 简写传入；非 GET 普通对象会被当作 body。
- 需要 headers、config、path 或 query 时，优先使用结构化参数对象。
- 当非 GET body 本身只包含 `headers`、`config` 这类控制字段时，必须显式传 `{ body }`。

## 禁止事项

- 不要在 alias `url` 中写 `/api/users` 这类包含 base path 的路径。
- 不要在业务视图或组件里直接 `axios.create()`。
- 不要让不同模块声明相同 alias 名称。
- 不要把接口 host 写死在业务代码中。
- 不要在 API alias 中使用不符合 REST 语义的模糊名称，例如 `doUser`、`handleData`。
- 不要用 `config.url`、`config.method`、`config.params` 或 `config.data` 试图覆盖 API 层生成的请求目标和请求数据。

## REST alias 命名

| 操作 | Method 与 path | Alias 模式 |
| -- | -- | -- |
| 列表 | `GET /resources` | `listResources` |
| 详情 | `GET /resources/:id` | `getResource` |
| 创建 | `POST /resources` | `createResource` |
| 整体更新 | `PUT /resources/:id` | `updateResource` |
| 局部更新 | `PATCH /resources/:id` | `patchResource` |
| 删除 | `DELETE /resources/:id` | `deleteResource` |

## 标准流程

1. 在模块内创建或更新 `src/modules/<module-name>/api/index.ts`。
2. 按 REST 规则定义 alias，并使用 `as const` 固定字面量类型。
3. 在 `src/api/registry.ts` import 模块 API 并展开到 `apiRegistry`。
4. 在业务代码中通过 `useAPI()` 调用。
5. 如果接口需要路径参数，调用时必须提供完整 `path`。
6. 如果接口返回类型已明确，在调用处传入泛型响应类型。
7. API 行为回归测试放在 `tests/api/`，不要放入 `src/api/`。

## 模板示例

模块 API：

```ts
export const userApi = {
  listUsers: {
    method: 'GET',
    url: '/users',
  },
  getUser: {
    method: 'GET',
    url: '/users/:id',
  },
  createUser: {
    method: 'POST',
    url: '/users',
  },
  updateUser: {
    method: 'PUT',
    url: '/users/:id',
  },
  deleteUser: {
    method: 'DELETE',
    url: '/users/:id',
  },
} as const
```

全局注册：

```ts
import { userApi } from '@/modules/user/api'

export const apiRegistry = {
  ...userApi,
} as const

export type AppApiRegistry = typeof apiRegistry
```

调用示例：

```ts
import { useAPI } from '@/hooks/use-api'
const $api = useAPI()

await $api.listUsers({
  query: { page: 1, pageSize: 20 },
})

await $api.updateUser({
  path: { id: 1 },
  body: { name: 'Tom' },
  headers: {
    'X-Trace-Id': traceId,
  },
  config: {
    signal: abortController.signal,
  },
})
```

上传示例：

```ts
await $api.uploadUserAvatar({
  path: { id: 1 },
  body: formData,
  config: {
    onUploadProgress: (event) => {
      console.log(event.loaded, event.total)
    },
  },
})
```

下载示例：

```ts
const blob = await $api.downloadUserExport<Blob>({
  query: { format: 'xlsx' },
  config: {
    responseType: 'blob',
    onDownloadProgress: (event) => {
      console.log(event.loaded, event.total)
    },
  },
})
```

简写边界示例：

```ts
const body = {
  config: '业务字段',
  headers: ['业务字段'],
  name: 'demo',
}

await $api.createUser(body)

await $api.createUser({
  body: {
    config: '业务字段',
  },
})
```

## React Query 集成

API 层基于 Axios，返回 Promise，可直接与 `@tanstack/react-query` 的 `useQuery`、`useMutation` 配合使用。

### useQuery 列表查询

```tsx
import { useAPI } from '@/hooks/use-api'
import { useQuery } from '@tanstack/react-query'

export function UserList() {
  const $api = useAPI()

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => $api.listUsers({ query: { page: 1, pageSize: 20 } }),
  })

  if (isLoading) return <div>Loading...</div>

  return (
    <ul>
      {data?.items.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}
```

### useQuery 详情查询

```tsx
import { useAPI } from '@/hooks/use-api'
import { useQuery } from '@tanstack/react-query'

export function UserDetail({ userId }: { userId: number }) {
  const $api = useAPI()

  const { data, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => $api.getUser({ path: { id: userId } }),
    enabled: !!userId,
  })

  if (isLoading) return <div>Loading...</div>

  return <div>{data?.name}</div>
}
```

### useMutation 创建

```tsx
import { useAPI } from '@/hooks/use-api'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function CreateUserForm() {
  const $api = useAPI()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (payload: { name: string }) =>
      $api.createUser({ body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate({ name: 'Tom' })
      }}
    >
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create'}
      </button>
    </form>
  )
}
```

### useMutation 更新

```tsx
import { useState } from 'react'
import { useAPI } from '@/hooks/use-api'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function EditUserForm({ userId }: { userId: number }) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const mutation = useMutation({
    mutationFn: (payload: { name: string }) =>
      $api.updateUser({ path: { id: userId }, body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user', userId] })
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate({ name })
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  )
}
```

### useMutation 删除

```tsx
import { useAPI } from '@/hooks/use-api'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function DeleteUserButton({ userId }: { userId: number }) {
  const $api = useAPI()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => $api.deleteUser({ path: { id: userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  return (
    <button
      onClick={() => {
        if (confirm('Delete this user?')) {
          mutation.mutate()
        }
      }}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Deleting...' : 'Delete'}
    </button>
  )
}
```

### 非 React 上下文中操作缓存

在 service 函数或工具函数中可直接操作 queryClient 缓存：

```ts
import { api } from '@/api'
import { queryClient } from '@/lib/query-client'

export async function refreshUserList() {
  await queryClient.invalidateQueries({ queryKey: ['users'] })
}

export async function prefetchUserDetail(userId: number) {
  await queryClient.prefetchQuery({
    queryKey: ['user', userId],
    queryFn: () => api.getUser({ path: { id: userId } }),
  })
}

export async function updateUserCache(userId: number, updates: Partial<User>) {
  queryClient.setQueryData(['user', userId], (old: User) => ({
    ...old,
    ...updates,
  }))
}
```

### 全局直接调用 API（非 React 组件）

```ts
import { api } from '@/api'

// 在任意 service 或工具函数中
export async function exportUsers() {
  const blob = await api.downloadUserExport<Blob>({
    query: { format: 'xlsx' },
    config: { responseType: 'blob' },
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'users.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}
```

## 错误处理

- `src/api/request.ts` 已将 Axios 错误转换为 `ApiErrorPayload`。
- 视图或 hooks 捕获错误时，不要假设错误一定是 `Error` 实例。
- 展示给用户的错误信息优先使用 `message`，需要调试时再读取 `status`、`code`、`details`。

## 检查清单

- alias 名称没有与其他模块重复。
- alias `url` 没有重复包含 `/api`。
- `src/api/registry.ts` 已注册新增 API。
- 业务调用使用 `useAPI()` 或直接导入 `api`。
- `path` 参数和 URL 中的 `:param` 完全匹配。
- 上传、下载或取消请求使用 `config` 传入 Axios 配置。
- body 只有控制字段名时已显式包在 `{ body }` 中。
- API 测试文件位于 `tests/api/`。
- 涉及代码变更时运行 `npm run typecheck`。
- React Query 的 `queryKey` 命名符合规范（列表用 `['users']`，详情用 `['user', id]`）。
