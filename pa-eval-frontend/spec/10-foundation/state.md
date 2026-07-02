# State Spec

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

规范 Zustand 状态的放置、命名和边界，避免模块状态过早全局化。

## 适用范围

- `src/stores/*`
- `src/modules/<module-name>/stores/*`
- 需要读写应用状态、用户状态或模块状态的组件与 hooks

## 项目事实

- 项目使用 Zustand。
- 模块私有 store 目录应放在 `src/modules/<module-name>/stores/`。

## 必须遵守

- store 文件命名使用 `*.store.ts`。
- hook 命名使用 `useXxxStore`。
- 全局状态只放跨模块共享数据。
- 模块页面内部状态优先使用组件本地 state 或模块私有 store。
- store 类型应和 store 定义放在同文件，除非类型被多个文件复用。
- reset 方法应把状态恢复到明确初始值。

## 禁止事项

- 不要把单个页面的临时状态放入全局 store。
- 不要让模块 store 直接修改另一个模块 store 的私有实现。
- 不要在 store 中直接创建新的请求库实例。
- 不要把后端返回的所有字段无筛选地长期保存为全局状态。
- 不要使用 `any` 绕过状态类型。

## 标准流程

1. 判断状态作用域：组件本地、模块私有、全局。
2. 组件本地状态直接使用 React state。
3. 模块内多组件共享时，创建 `src/modules/<module-name>/stores/<name>.store.ts`。
4. 多模块共享时，创建或扩展 `src/stores/<name>.store.ts`。
5. 为状态和 action 定义明确 TypeScript 类型。
6. 在组件中通过 store hook 选择所需字段，避免无关重渲染。

## 模板示例

模块私有 store：

```ts
import { create } from 'zustand'

type UserFilterState = {
  keyword: string
  setKeyword: (keyword: string) => void
  resetFilters: () => void
}

export const useUserFilterStore = create<UserFilterState>((set) => ({
  keyword: '',
  setKeyword: (keyword) => set({ keyword }),
  resetFilters: () => set({ keyword: '' }),
}))
```

全局 store：

```ts
import { create } from 'zustand'

type LayoutState = {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}))
```

## 检查清单

- 状态作用域选择正确。
- store 文件使用 `*.store.ts`。
- action 名称表达具体行为。
- reset 方法没有遗漏字段。
- 没有使用 `any`。
- 涉及代码变更时运行 `npm run typecheck`。
