# ImportDialog 组件使用规范

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

## 组件定位

`ImportDialog` 是通用文件导入弹窗组件，位于 `src/components/common/import-dialog.tsx`。

组件只负责渲染弹窗、选择文件、校验文件类型，并在提交时把选中的 `File` 回传给调用方；它不负责解析文件、不发起接口请求、不展示提交结果，也不绑定任何业务模块语义。

## 导入方式

```tsx
import { ImportDialog } from "@/components/common/import-dialog";
```

## Props

```ts
type ImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  fileTypes?: string[];
  onImport?: (file: File) => void;
};
```

字段说明：

- `open`：控制弹窗显示状态。
- `onOpenChange`：弹窗打开或关闭时触发，组件关闭或重置表单时会调用它。
- `title`：弹窗标题，默认是 `导入文件`。
- `description`：弹窗说明，默认是 `从本地选择文件进行导入。`。
- `fileTypes`：允许导入的文件类型，同时用于 input `accept` 和提交校验。默认是 `["text/csv"]`。
- `onImport`：提交成功后回调选中的 `File`，文件解析、上传和错误处理由调用方完成。

## 文件类型规则

`fileTypes` 支持三类写法：

- MIME 类型，例如 `text/csv`、`application/json`。
- 文件扩展名，例如 `.csv`、`.json`。
- MIME 通配类型，例如 `image/*`。

示例：

```tsx
<ImportDialog
  open={open}
  onOpenChange={setOpen}
  title="导入配置"
  description="请选择 JSON 配置文件。"
  fileTypes={["application/json", ".json"]}
  onImport={(file) => {
    // 在调用方解析或上传文件
  }}
/>
```

## 文案与业务边界

组件默认文案为中文，不包含 `Task`、`Tasks` 等业务关键字。业务页面需要特定标题或说明时，通过 `title` 和 `description` 覆盖。

组件不调用 `showSubmittedData`。如需展示导入成功、失败或文件详情，调用方应在 `onImport` 中自行处理，例如通过 toast、页面状态或业务弹窗展示。

## 校验行为

提交时会先校验是否已选择文件，再校验文件类型是否匹配 `fileTypes`。校验失败时在表单字段下方展示中文错误提示：

- 未选择文件：`请上传文件`
- 类型不匹配：`请上传 <文件类型> 格式的文件。`

校验通过后，组件调用 `onImport(file)` 并关闭弹窗。

## 使用约定

- 业务模块不要修改组件内部默认逻辑来适配特定导入流程，应通过 props 配置标题、说明和文件类型。
- 文件解析、上传、接口错误、导入进度和成功提示都放在调用方。
- 如果需要多文件导入，应先扩展 props 契约，再同步更新本规范。
