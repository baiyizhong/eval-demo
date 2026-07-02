# ConfirmDialog 组件使用规范

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

`ConfirmDialog` 是通用确认弹窗组件，位于 `src/components/common/confirm-dialog.tsx`。

组件基于 shadcn/ui `AlertDialog` 组合实现，用于删除、停用、提交确认、危险操作二次确认等场景。它只负责确认交互和按钮状态，不负责执行业务请求、关闭策略或错误提示。

## 导入方式

```tsx
import { ConfirmDialog } from "@/components/common/confirm-dialog";
```

## Props

```ts
type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  disabled?: boolean;
  desc: React.JSX.Element | string;
  cancelBtnText?: string;
  confirmText?: React.ReactNode;
  destructive?: boolean;
  handleConfirm: () => void;
  isLoading?: boolean;
  className?: string;
  children?: React.ReactNode;
};
```

字段说明：

- `open`：控制弹窗显示状态。
- `onOpenChange`：弹窗打开或关闭时触发。
- `title`：弹窗标题，必传。
- `desc`：弹窗描述，支持字符串或 JSX。
- `cancelBtnText`：取消按钮文案；未传时组件当前默认显示 `Cancel`。
- `confirmText`：确认按钮文案；未传时组件当前默认显示 `Continue`。
- `destructive`：为 `true` 时确认按钮使用 `destructive` variant。
- `handleConfirm`：点击确认按钮时触发。
- `disabled`：禁用确认按钮。
- `isLoading`：禁用取消和确认按钮，避免重复提交。
- `className`：追加到 `AlertDialogContent`。
- `children`：渲染在描述和 footer 之间，用于补充影响范围、输入确认信息或额外提示。

## 推荐用法

```tsx
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="删除任务"
  desc="删除后无法恢复，请确认是否继续。"
  cancelBtnText="取消"
  confirmText="删除"
  destructive
  isLoading={deleting}
  handleConfirm={() => {
    // 在调用方执行删除、关闭弹窗和错误处理
  }}
/>
```

## 行为规则

- 组件是受控弹窗，调用方负责维护 `open` 状态。
- 点击确认只调用 `handleConfirm`，组件不会自动关闭；调用方应在业务成功或需要中断时自行调用 `onOpenChange(false)`。
- `isLoading` 为 `true` 时，取消按钮和确认按钮都会禁用。
- `disabled` 只禁用确认按钮，不影响取消按钮。
- `destructive` 只影响确认按钮视觉样式，不改变业务行为。

## 文案约定

业务代码应显式传入中文 `cancelBtnText` 和 `confirmText`，不要依赖当前英文默认值。危险操作的确认文案应表达动作本身，例如 `删除`、`停用`、`确认提交`，不要使用含糊的 `确定`。

`desc` 应写清操作影响和不可逆风险；需要展示更复杂的影响范围时，使用 `children` 插槽补充。

## 使用约束

- 不在组件内部发请求、调用 toast、读模块 store 或判断权限。
- 不把模块私有类型传入组件；确认内容通过 `title`、`desc` 和 `children` 表达。
- 需要表单校验式确认时，优先在调用方处理输入状态，再用 `disabled` 控制确认按钮。
