# markdown-editor 组件使用规范

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

## 文件位置

组件文件位于：

`src/components/common/markdown-editor.tsx`

该文件由 `/Users/panpan/Downloads/navigation-bar/src/app/components/MarkdownEditorPanel.tsx` 迁移而来，并按当前项目约定改为 common 组件路径与 kebab-case 文件名。

## 组件依赖

使用组件之前需要确保依赖已安装：

```bash
npm i @uiw/react-md-editor
```

组件内部同时依赖项目已有的 shadcn 风格基础组件和图标：

- `Button`
- `ToggleGroup`
- `Tooltip`
- `Copy`
- `Check`

## 组件职责

`MarkdownEditorPanel` 是一个 Markdown 编辑和预览面板组件。它负责渲染标题、复制按钮、编辑/预览切换控件，以及 `@uiw/react-md-editor` 编辑器本体。

组件不负责保存文档、不提交接口、不做权限判断，也不内置业务级 Markdown 内容。调用方应通过 `value`、`defaultValue` 和 `onValueChange` 管理真实文档内容。

## 导入方式

```tsx
import {
  MarkdownEditorPanel,
  type MarkdownMode,
} from '@/components/common/markdown-editor'
```

如需受控管理内容或模式，调用方自行从 React 引入状态能力：

```tsx
import { useState } from 'react'
```

## 类型说明

```tsx
export type MarkdownMode = 'edit' | 'preview'

type MarkdownEditorPassthroughProps = Omit<
  MDEditorProps,
  | 'value'
  | 'onChange'
  | 'preview'
  | 'hideToolbar'
  | 'className'
  | 'height'
  | 'data-color-mode'
>
```

`editorProps` 用于透传 `@uiw/react-md-editor` 原生配置，但以下字段由 `MarkdownEditorPanel` 统一管理：

- `value`
- `onChange`
- `preview`
- `hideToolbar`
- `className`
- `height`
- `data-color-mode`

## Props 契约

```tsx
type MarkdownEditorPanelProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  title?: string
  defaultMode?: MarkdownMode
  mode?: MarkdownMode
  onModeChange?: (mode: MarkdownMode) => void
  height?: number | string
  readOnly?: boolean
  className?: string
  editorClassName?: string
  editorProps?: MarkdownEditorPassthroughProps
}
```

关键规则：

- `value` 存在时组件按受控内容模式运行，显示和编辑都以调用方传入的 `value` 为准。
- `value` 不存在时组件按非受控内容模式运行，初始值来自 `defaultValue`。
- `onValueChange` 只负责通知调用方 Markdown 内容变化，不内置保存、校验、同步或接口提交。
- `mode` 存在时组件按受控模式切换运行，当前编辑器模式以调用方传入的 `mode` 为准。
- `mode` 不存在时组件按非受控模式切换运行，初始模式来自 `defaultMode`。
- `onModeChange` 只负责通知调用方模式变化，不负责持久化模式偏好。
- `defaultMode` 只支持 `'edit'` 和 `'preview'`。
- `height` 控制编辑器高度，直接传给 `@uiw/react-md-editor`。
- `readOnly` 会映射到编辑器的 `textareaProps.readOnly`，用于关闭文本输入编辑能力。
- `editorProps` 用于配置 `textareaProps`、`commands`、`extraCommands`、`visibleDragbar` 等原生参数。

## 推荐用法

受控内容和受控模式示例：

```tsx
const initialMarkdown = `# Navigation Bar

这是一个用于展示导航栏、JSON 配置和 Markdown 文档编辑能力的示例页面。

## 当前能力

- 顶部导航栏
- JSON 配置编辑
- Markdown 编辑与预览切换
`

function Page() {
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [mode, setMode] = useState<MarkdownMode>('preview')

  return (
    <MarkdownEditorPanel
      value={markdown}
      onValueChange={setMarkdown}
      mode={mode}
      onModeChange={setMode}
      title='页面说明'
      height={420}
      editorProps={{
        visibleDragbar: false,
        textareaProps: {
          placeholder: '请输入 Markdown 内容',
        },
      }}
    />
  )
}
```

只读预览示例：

```tsx
<MarkdownEditorPanel
  value={markdown}
  title='发布说明'
  mode='preview'
  readOnly
  height={360}
/>
```

非受控示例：

```tsx
<MarkdownEditorPanel
  defaultValue='# 文档标题'
  defaultMode='edit'
  onValueChange={(nextMarkdown) => {
    console.log(nextMarkdown)
  }}
/>
```

## 内容状态约定

组件内部使用如下规则解析内容状态：

- `editorValue = value ?? internalValue`。
- 当 `value === undefined` 时，用户编辑会更新组件内部状态。
- 当 `value !== undefined` 时，用户编辑不会更新内部状态，只会触发 `onValueChange`。
- `@uiw/react-md-editor` 的 `onChange` 可能传入 `undefined`，组件会统一转换为空字符串 `''`。
- `defaultValue` 只在非受控模式初始化时生效，后续修改 `defaultValue` 不会重置内容。

## 模式切换约定

组件顶部右侧使用单选 `ToggleGroup` 切换模式。

模式含义：

- `'edit'`：显示 Markdown 编辑态。
- `'preview'`：显示 Markdown 预览态。

切换规则：

- `resolvedMode = mode ?? internalMode`。
- 当 `mode === undefined` 时，切换按钮会更新组件内部模式。
- 当 `mode !== undefined` 时，切换按钮只会触发 `onModeChange`，调用方必须更新 `mode` 才能改变界面。
- 非 `'edit'` 或 `'preview'` 的值会被忽略。
- 组件固定传入 `hideToolbar`，默认不显示 `@uiw/react-md-editor` 原生工具栏。

## 状态和显示规则

- `defaultValue` 默认为空字符串。
- `title` 默认为 `'Markdown 文档'`。
- `defaultMode` 默认为 `'preview'`。
- `height` 默认为 `200`。
- `readOnly` 默认为 `false`，即允许编辑。
- 外层容器固定带有 `markdown-editor-panel` class。

## 样式约定

修改样式时：

- 优先通过 `className` 覆盖面板外层样式。
- 优先通过 `editorClassName` 覆盖 `MDEditor` 根节点样式。
- 如需覆盖 `@uiw/react-md-editor` 内部结构，优先使用 `.markdown-editor-panel` 作为作用域前缀。
- 不要写无作用域的 `.w-md-editor`、`.wmde-markdown` 等全局选择器，避免影响其他页面可能存在的 Markdown 编辑器。
- 不要移除复制按钮、模式切换和标题区域的无障碍属性。

## 大模型修改约束

大模型在修改该组件时必须遵守：

- 不要把业务 Markdown 文档写死到 `markdown-editor.tsx`，示例内容只能放在调用方或文档中。
- 不要把保存、发布、提交、接口请求、权限判断等业务逻辑放入组件。
- 不要删除 `editorProps` 透传能力；新增原生配置优先通过 `editorProps` 支持。
- 不要覆盖 `value`、`onChange`、`preview`、`hideToolbar`、`className`、`height`、`data-color-mode` 的所有权，这些字段由封装层统一处理。
- 不要新增独立的 `onSave`、`onPublish`、`onCopySuccess` 等业务事件，除非用户明确要求扩展组件契约。
- 不要让组件直接依赖路由库、数据请求库或全局状态库。
- 调整编辑/预览模式时必须保持 `MarkdownMode` 类型和 `ToggleGroup` 的受控/非受控规则一致。
- 修改只读逻辑时必须继续通过 `textareaProps.readOnly` 与调用方传入的 `editorProps.textareaProps` 合并，不要直接丢弃调用方的 `textareaProps`。
