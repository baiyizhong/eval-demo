# json-editor 组件使用规范

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
`src/components/common/json-editor.tsx`

该文件从原 `src/app/components/JsonEditorPanel.tsx` 迁移而来，组件导出名保持为 `JsonEditorPanel`。

## 组件依赖

使用组件之前需要确保依赖已安装：
`npm i json-edit-react`

## 导入方式

```tsx
import type { JsonData } from "json-edit-react";
import { JsonEditorPanel } from "@/components/common/json-editor";
```

## 类型说明

```tsx
type EditorPassthroughProps = Omit<
  JsonEditorProps,
  | "data"
  | "setData"
  | "theme"
  | "className"
  | "rootName"
  | "viewOnly"
  | "searchText"
  | "collapse"
  | "minWidth"
  | "maxWidth"
>;
```

`editorProps` 用于透传 `json-edit-react` 原生配置，但以下字段由 `JsonEditorPanel` 统一管理：

- `data`
- `setData`
- `theme`
- `className`
- `rootName`
- `viewOnly`
- `searchText`
- `collapse`
- `minWidth`
- `maxWidth`

## Props 契约

```tsx
type JsonEditorPanelProps = {
  data?: JsonData;
  defaultData?: JsonData;
  onDataChange?: (data: JsonData) => void;
  title?: string;
  rootName?: string;
  readOnly?: boolean;
  searchable?: boolean;
  searchText?: string;
  collapse?: JsonEditorProps["collapse"];
  height?: number | string;
  maxWidth?: JsonEditorProps["maxWidth"];
  minWidth?: JsonEditorProps["minWidth"];
  className?: string;
  editorClassName?: string;
  theme?: ThemeInput;
  editorProps?: EditorPassthroughProps;
};
```

关键规则：

- `data` 存在时组件按受控模式运行，显示和编辑都以调用方数据为准。
- `data` 不存在时组件按非受控模式运行，初始值来自 `defaultData`。
- `onDataChange` 只负责通知调用方数据变化，不内置保存、校验或接口提交。
- `readOnly` 会映射到 `json-edit-react` 的 `viewOnly`，用于关闭编辑能力。
- `searchable` 为 `false` 时不渲染搜索框，也不向编辑器传入 `searchText`。
- `searchText` 存在时搜索框按外部受控值展示；组件内部不会修改该值。
- `collapse` 直接透传给 `json-edit-react`，控制默认展开/折叠策略。
- `height` 会写入编辑器容器样式，用于控制 `JsonEditor` 的显示高度。
- `theme` 会追加到默认 GitHub Light 主题之后，用于局部覆盖主题。
- `editorProps` 用于配置 `indent`、`restrictDrag`、`showArrayIndices`、`showStringQuotes` 等原生参数。

## 推荐用法

```tsx
const initialJsonData: JsonData = {
  app: {
    name: "Navigation Bar",
    theme: "github-light",
    version: "0.0.1",
  },
  editor: {
    library: "json-edit-react",
    rootName: "appConfig",
    clipboard: true,
  },
};

function Page() {
  const [jsonData, setJsonData] = useState<JsonData>(initialJsonData);

  return (
    <JsonEditorPanel
      data={jsonData}
      onDataChange={setJsonData}
      title="应用 JSON 配置"
      rootName="appConfig"
      readOnly
      collapse={1}
      height={420}
      editorProps={{
        indent: 4,
        restrictDrag: true,
        showArrayIndices: true,
        showStringQuotes: true,
      }}
    />
  );
}
```

## 搜索接入约定

组件默认开启搜索框，搜索行为使用 `json-edit-react` 的 `searchText` 和 `searchFilter`。

默认规则：

- 搜索框 placeholder 为“搜索关键字”。
- 默认 `searchFilter` 为 `"all"`，同时匹配 key 和 value。
- 搜索输入框由组件内部状态管理。

外部受控搜索示例：

```tsx
<JsonEditorPanel
  data={jsonData}
  searchText={keyword}
  editorProps={{
    searchFilter: "key",
  }}
/>
```

关闭搜索示例：

```tsx
<JsonEditorPanel data={jsonData} searchable={false} />
```

## 状态和显示规则

- 标题默认为 `JSON 配置`。
- `rootName` 默认为 `config`。
- `readOnly` 默认为 `false`，即允许编辑。
- `searchable` 默认为 `true`。
- `collapse` 默认为 `false`，即默认展开。
- `minWidth` 和 `maxWidth` 默认都是 `100%`。
- 编辑器默认使用 GitHub Light 主题；编辑态容器背景为白色，只读态容器背景为 `bg-gray-100`。
- 编辑器容器默认最小高度为 `200px`。
- 编辑器默认 `rootFontSize` 为 `13`，除非调用方通过 `editorProps.rootFontSize` 覆盖。
- 编辑器默认开启内部复制图标 tooltip，除非调用方通过 `editorProps.showIconTooltips` 覆盖。
- 编辑器默认 `showCollectionCount` 为 `"when-closed"`，除非调用方覆盖。

## 样式约定

组件外层固定带有 `json-editor-panel` class，用于限定覆盖 `json-edit-react` 内部样式。

当前全局样式中使用该作用域调整新增 key 输入框：

```css
.json-editor-panel input {
  height: 24px;
  padding: 2px 6px;
  font-size: 12px;
  line-height: 20px;
}
```

修改样式时：

- 优先在 `JsonEditorPanel` 外层作用域内覆盖 `json-edit-react` 的内部 class。
- 不要写全局 `.jer-*` 选择器，避免影响其他页面可能存在的 JSON 编辑器。

## 大模型约束

大模型在修改该组件时必须遵守：

- 不要把业务 JSON 数据写死到 `src/components/common/json-editor.tsx`，示例数据只能放在调用方或文档中。
- 不要把保存、提交、接口请求、权限判断等业务逻辑放入组件。
- 不要删除 `editorProps` 透传能力；新增原生配置优先通过 `editorProps` 支持。
- 不要覆盖 `data`、`setData`、`theme`、`className`、`rootName`、`viewOnly`、`searchText`、`collapse`、`minWidth`、`maxWidth` 的所有权，这些字段由封装层统一处理。
