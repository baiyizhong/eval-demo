# FormDialog 组件使用规范

## 适用任务

- 处理与本文标题相关的开发、重构或评审任务。

## 相关源码

- `src/components/common/form-dialog.tsx`
- `src/components/common/base-form.tsx`
- `src/components/ui/dialog.tsx`

## 必读前置

- `spec/README.md`
- `spec/30-ui/component-guide.md`
- `spec/30-ui/styles-theme.md`
- `spec/40-components/common/base-form.md`

## 核心规则

- 先阅读本文后续的目标、必须遵守、规则和使用约定，再修改代码。

## 推荐示例

- 优先采用本文后续推荐用法和模板示例。

## 禁止事项

- 以本文后续“禁止事项”“约束”“大模型修改约束”为准。

## 检查清单

- 按本文后续检查清单和 `spec/README.md` 验证命令完成自检。

## 组件定位

`FormDialog` 是通用表单弹窗容器组件，位于 `src/components/common/form-dialog.tsx`。

组件用于少量内容输入、新建、编辑或配置保存等聚焦任务，是 `Drawer` 在轻量输入场景下的可选方案。它只负责弹窗打开关闭、标题区、描述、内容容器、底部默认操作按钮和取消关闭行为；不负责表单状态、接口请求、业务校验或提交结果展示。

表单场景应与 `BaseForm` 或业务表单组件组合使用。业务字段、schema、默认值、提交逻辑、成功提示和失败处理都由调用方负责。

## 导入方式

```tsx
import { FormDialog } from '@/components/common/form-dialog'
```

## Props

```ts
type FormDialogSize = 'sm' | 'default' | 'lg'

type FormDialogProps = React.ComponentProps<typeof Dialog> & {
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  size?: FormDialogSize
  width?: number | string
  actions?: React.ReactNode | null
  showCancel?: boolean
  showConfirm?: boolean
  cancelText?: React.ReactNode
  confirmText?: React.ReactNode
  onCancel?: () => void
  onConfirm?: () => void
  cancelProps?: React.ComponentProps<typeof Button>
  confirmProps?: React.ComponentProps<typeof Button>
  contentProps?: Omit<React.ComponentProps<typeof DialogContent>, 'children'>
  bodyProps?: Omit<React.ComponentProps<'div'>, 'children'>
  footerProps?: React.ComponentProps<typeof DialogFooter>
}
```

字段说明：

- `open`：控制弹窗显示状态，来自 `Dialog`。
- `onOpenChange`：弹窗打开或关闭时触发，来自 `Dialog`。
- `title`：弹窗标题，必传。
- `description`：弹窗说明，可选。
- `children`：弹窗主体内容。
- `size`：弹窗宽度尺寸，默认 `default`。
- `width`：自定义弹窗宽度，支持数字或 CSS 宽度字符串。
- `actions`：自定义底部操作区；传 `null` 可隐藏默认按钮。
- `showCancel`：是否显示默认取消按钮，默认 `true`。
- `showConfirm`：是否显示默认确认按钮，默认 `true`。
- `cancelText`：取消按钮文案，默认 `取消`。
- `confirmText`：确认按钮文案，默认 `确认`。
- `onCancel`：点击取消按钮时触发，随后组件会调用 `onOpenChange(false)`。
- `onConfirm`：点击确认按钮时触发，组件不会自动关闭弹窗。
- `cancelProps`：透传给取消按钮，常用于覆盖 `disabled`、`children` 等。
- `confirmProps`：透传给确认按钮，常用于绑定表单 `form`、`type` 或禁用状态。
- `contentProps`：透传给 `DialogContent`，用于追加 `className`、`style`、`showCloseButton` 等容器属性。
- `bodyProps`：透传给内容容器。
- `footerProps`：透传给 `DialogFooter`。

## 宽度规则

- `size="sm"`：默认宽度 `400px`。
- `size="default"`：默认宽度 `480px`。
- `size="lg"`：默认宽度 `640px`。
- 传入 `width` 时优先使用 `width`，数字会转换为 `px`。
- 弹窗最大宽度限制为 `calc(100vw - 2rem)`，避免移动端溢出。

```tsx
<FormDialog open={open} onOpenChange={setOpen} title='编辑配置' width={520}>
  {/* content */}
</FormDialog>

<FormDialog open={open} onOpenChange={setOpen} title='快速创建' size='sm'>
  {/* content */}
</FormDialog>
```

## 默认操作区

默认按钮位于弹窗底部右侧。默认按钮顺序是：

1. 取消按钮
2. 确认按钮

取消按钮点击后会执行 `onCancel?.()`，再调用 `onOpenChange(false)` 关闭弹窗。确认按钮点击后只执行 `onConfirm?.()`；如果确认按钮通过 `confirmProps` 绑定外部表单提交，提交成功后的关闭、刷新列表和 toast 由业务逻辑决定。

`FormDialog` 默认隐藏底层 `DialogContent` 的右上角关闭按钮，避免与底部取消按钮重复。如需显示，可以传入：

```tsx
<FormDialog
  open={open}
  onOpenChange={setOpen}
  title='编辑配置'
  contentProps={{ showCloseButton: true }}
>
  {/* content */}
</FormDialog>
```

## 与表单组合

推荐通过 `confirmProps` 绑定表单 id，让底部确认按钮触发表单提交。

```tsx
const formId = 'create-task-form'

<FormDialog
  open={open}
  onOpenChange={setOpen}
  title='创建评测任务'
  description='填写少量必要信息后提交。'
  confirmText='提交'
  confirmProps={{ form: formId, type: 'submit' }}
>
  <BaseForm
    id={formId}
    schema={schema}
    defaultValues={{ title: '' }}
    onSubmit={(data) => {
      // 提交成功后由调用方关闭弹窗
      setOpen(false)
    }}
  >
    {(form) => (
      // 渲染 FormField
      null
    )}
  </BaseForm>
</FormDialog>
```

## 与 Drawer 的选择

- 少量输入、轻量配置、聚焦任务：优先使用 `FormDialog`。
- 字段较多、内容需要纵向滚动、详情或复杂编辑：优先使用 `Drawer`。
- 破坏性操作确认：使用 `ConfirmDialog` 或 `confirm()`，不要用 `FormDialog` 代替确认弹窗。
- 文件导入：使用 `ImportDialog` 或业务导入组件。

## 禁止事项

- 不要让 `FormDialog` 直接发请求或读取模块 store。
- 不要在 `FormDialog` 内写默认业务字段、schema 或业务枚举。
- 不要绕开 `BaseForm` 或业务表单的 schema 校验直接提交未验证数据。
- 不要用普通 `div` 临时模拟弹窗或表单容器。
- 不要在调用方硬编码颜色覆盖弹窗底层视觉体系。

## 检查清单

- 弹窗标题必传且语义明确。
- 少量输入场景才使用 `FormDialog`；复杂表单改用 `Drawer`。
- 表单默认值、schema、提交回调一致。
- loading 时确认按钮避免重复提交。
- 成功、失败、取消路径都有明确处理。
- 涉及代码变更时运行 `npm run typecheck`。
