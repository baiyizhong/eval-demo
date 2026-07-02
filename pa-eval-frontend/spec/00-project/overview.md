# 前端工程规范

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

本文档定义 React + Vite 中后台前端项目结构与工程总规则。

## 技术栈

- Node.js >= 22.22.0
- React 19
- Vite 8
- TypeScript 6
- Tailwind CSS v4
- shadcn/ui 源码型组件体系
- Lucide React
- React Router 8
- Zustand
- Axios
- Sonner
- Recharts
- ESLint 10
- Prettier 3

## 目录结构

```txt
public/
src/
  api/
  assets/
  components/
    common/
    layout/
    business/
    ui/
  config/
  hooks/
  lib/
  modules/
  routes/
  stores/
  styles/
  types/
  utils/
  views/
  App.tsx
  main.tsx
tests/
  api/
```

## 目录职责

| 目录                      | 职责                                                                |
| ------------------------- | ------------------------------------------------------------------- |
| `public`                  | 不经代码导入、dev/build 时以应用根路径访问的静态资源                |
| `src/api`                 | Axios 实例、拦截器、API alias 生成、API 注册表、请求类型            |
| `src/assets`              | 由代码导入的静态资源                                                |
| `src/components/common` | 全局通用组合组件，例如 `Page`、`SidebarNav`、`ContentSection`、`Can`、`PermissionScopeProvider` |
| `src/components/layout`   | App shell、侧边栏、顶部栏、布局容器                                 |
| `src/components/business` | 跨模块业务组件                                                      |
| `src/components/ui`       | shadcn/ui 生成的 Radix/Base UI + Tailwind 底层组件源码              |
| `src/config`              | 环境配置与应用配置适配层                                            |
| `src/hooks`               | 全局可复用 hooks                                                    |
| `src/lib`                 | 第三方库适配与工程基础 helper，例如 `cn`、`message`                 |
| `src/modules`             | 业务域或页面域模块                                                  |
| `src/routes`              | 全局路由聚合与 routes 创建                                          |
| `src/stores`               | 全局 Zustand stores                                                 |
| `src/styles`              | 全局 CSS、reset、主题变量与 Tailwind 入口                           |
| `src/types`               | 共享 TypeScript 类型                                                |
| `src/utils`               | 纯工具函数                                                          |
| `tests`                   | 单元测试、集成测试和专项回归测试                                    |

## 模块规则

每个模块应遵循以下结构：

```txt
src/modules/<module-name>/
  components/
  views/
  hooks/
  stores/
  types/
  index.ts
```

规则：

- modules的子页面放到 views/ 内。
- 页面相关私有组件放在模块内。
- 页面相关私有 hooks 放在模块内。
- 模块私有 stores 放在模块内。
- 模块私有 API aliases 放在模块内。
- 只有复用关系明确后，才将代码上提到全局目录。
- 优先通过模块 `index.ts` 导入模块出口。

## 组件规则

- `components/common` 用于通用可复用组件。
- `components/layout` 用于应用框架组件。
- `components/business` 用于被多个模块复用且带业务概念的组件。
- `components/ui` 用于 shadcn/ui 生成的底层组件源码，业务侧按需从具体文件导入，例如 `@/components/ui/button`。
- 模块私有组件不要放入全局组件目录。

## 全局样式规则

- `src/styles/index.css` 是 Tailwind CSS v4 入口。
- `src/styles/theme.css` 是主题变量的定义。
- 主题变量使用 CSS 变量维护。
- 默认主题为浅色，`:root` 是组件库主题的默认来源。
- 模块和组件不要重复定义全局 reset 或滚动条规则。

## API 规则

API aliases 是全局扁平结构，名称必须唯一：

```ts
export const userApi = {
  listUsers: {
    method: 'GET',
    url: '/users',
  },
  updateUser: {
    method: 'PUT',
    url: '/users/:id',
  },
} as const
```


通过 `useAPI()` 使用接口：

```ts
const $api = useAPI()

await $api.listUsers({
  query: { page: 1, pageSize: 20 },
})

await $api.updateUser({
  path: { id: 1 },
  body: { name: 'Tom' },
  headers: { 'X-Trace-Id': traceId },
  config: { signal: abortController.signal },
})
```
api 详细定义参考文档 `spec/10-foundation/api.md`。


## 环境规则

所有环境差异配置使用 `.env` 文件：

```txt
.env
.env.development
.env.test
.env.production
.env.mock
```

推荐变量：

```txt
VITE_APP_TITLE=
VITE_APP_BASE_PATH=
VITE_API_BASE_URL=
VITE_API_PROXY_TARGET=
VITE_API_TIMEOUT=
VITE_API_WITH_CREDENTIALS=
VITE_ENABLE_MOCK=
VITE_BUILD_SOURCEMAP=
```

规则：

- 应用代码通过 `src/config/env.ts` 读取环境值。
- Vite 配置通过 `loadEnv` 读取环境值。
- 非根路径部署时通过 `VITE_APP_BASE_PATH` 配置应用基础路径，例如 `/admin/`。
- 开发环境跨域请求通过 Vite proxy 处理。
- 不在业务代码里硬编码后端 host。

## Vite 规则

Vite 应包含：

- React plugin。
- Tailwind CSS v4 plugin。
- `publicDir: 'public'`，确保 `public/` 资源在 dev 和 build 后都可通过应用根路径访问。
- `@` 指向 `src` 的路径别名。
- 基于 `VITE_API_PROXY_TARGET` 的代理配置。
- 常用依赖预构建。
- 由环境变量控制构建 sourcemap。
- 大型依赖组手动分包。

建议分包：

- `react-vendor`
- `router-vendor`
- `ui-vendor`
- `state-vendor`

## Public 资源规则

- `public/` 下的文件不需要 import，会由 Vite dev server 直接托管，并在 build 时复制到 `dist/` 根路径。
- 访问路径不要包含 `/public` 前缀。例如 `public/logo.svg` 应通过 `/logo.svg` 访问。
- 非根路径部署时，页面内手写 public 资源 URL 应考虑 `VITE_APP_BASE_PATH` 对最终访问路径的影响。
- 需要被代码处理、哈希或 tree-shaking 的资源放在 `src/assets/`，不要放在 `public/`。

## Store 规则

## 权限规则

前端权限遵循统一 permission code 体系：

- Code 结构为 `domain:resource:action`，末段允许通配，例如 `system:user:*`。
- 全局通配使用 `*`。
- 路由级权限配置在 `src/routes/index.tsx` 文件中，通过` <RouteGuard accessConfig={{ access: ['user:view'] }}></RouteGuard>` 组件包裹。
- 元素级权限使用 `src/components/common/can.tsx`。
- 项目级 scope 通过 `PermissionScopeProvider` 注入。
- 超管通过 `superAdmin` 字段控制，享有全部权限。
- 权限载荷与初始化逻辑参考 `spec/10-foundation/permission.md`。

## Store 规则

- 使用 Zustand 管理全局状态和模块状态。
- 全局应用状态放在 `src/stores`。
- 模块私有状态放在 `src/modules/<module>/stores`。
- 只有多个模块依赖时，才将模块状态上提为全局状态。

## 命名规则

- 目录使用 kebab-case。
- React 组件使用 PascalCase。
- Hooks 以 `use` 开头。
- Zustand stores 使用 `*.store.ts`。
- 类型可放在 `types.ts` 或模块 `types/`。
- API alias 使用动词开头的 camelCase。

## 质量规则

必备工具：

- ESLint
- Prettier
- EditorConfig
- TypeScript type checking

测试规则：

- 测试文件统一放在 `tests/` 目录下。
- 按被测领域继续分目录，例如 API 测试放在 `tests/api/`。
- 不要把 `*.test.ts`、`*.spec.ts` 放入 `src/` 应用源码目录。
- 新增测试脚本或测试依赖时，必须同步更新 `package.json` 和对应 lock 文件。

依赖规则：

- 新增、删除或升级依赖必须通过包管理器完成。
- 使用 npm 时，`package.json` 和 `package-lock.json` 必须一起更新。
- 不要手写修改 lock 文件来模拟依赖安装结果。

完成前需要执行：

```txt
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## 当前验证范围

当前完成后，应满足以下条件：

- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run format:check` 通过。
- `npm run build` 通过。
- `src/modules/dashboard` 和 `src/modules/tasks` 可作为新增页面模块的结构参考。
