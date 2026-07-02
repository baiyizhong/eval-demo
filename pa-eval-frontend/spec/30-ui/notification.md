# Notification

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

统一项目中的全局提示类交互，包括轻量消息提示 `toast` 和需要用户确认的全局确认弹窗 `confirm`。

## 适用范围

- 成功、失败、警告、信息提示：使用 `toast`
- 删除、提交、退出、覆盖等需要用户明确选择的操作：使用 `confirm`
- 页面或组件内不要重复实现临时提示层、确认弹窗状态管理或自定义全局弹窗容器

## Toast

Toast 使用 `sonner`，适合展示无需阻塞用户操作的短消息。

### 导入

```ts
import { toast } from 'sonner'
```

### 基础用法

```ts
toast.success('保存成功')
toast.error('保存失败')
toast.warning('请检查输入内容')
toast.info('操作已触发')
```

### 使用建议

- 成功提示使用 `toast.success`
- 错误提示使用 `toast.error`
- 非阻塞提醒使用 `toast.info` 或 `toast.warning`
- 需要展示结构化内容、调试数据或提交结果时，可以使用 `toast.message`
- 文案应直接说明结果或问题，不要只写“成功”“失败”
- 不需要用户选择时，不要使用确认弹窗

示例：

```tsx
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function SaveButton() {
  return (
    <Button
      type='button'
      onClick={() => {
        toast.success('配置已保存')
      }}
    >
      保存
    </Button>
  )
}
```

### 自定义内容

`toast.message` 适合展示比普通短消息更丰富的内容，例如表单提交结果、调试数据或轻量详情。内容仍然是非阻塞提示，不应用来承载复杂表单、长流程或必须确认的操作。

需要在自定义内容里提供关闭按钮时，先保存 `toast.message` 返回的 `toastId`，再调用 `toast.dismiss(toastId)`。

```tsx
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function showSubmittedData(data: unknown) {
  const toastId = toast.message('提交结果', {
    description: (
      <div className='flex flex-col gap-3'>
        <pre className='mt-2 w-full overflow-x-auto rounded-md bg-slate-950 p-4'>
          <code className='text-white'>{JSON.stringify(data, null, 2)}</code>
        </pre>
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='self-end'
          onClick={() => toast.dismiss(toastId)}
        >
          关闭
        </Button>
      </div>
    ),
  })
}
```

使用约束：

- 内容应保持轻量，避免替代 `Dialog`、`Drawer` 或页面主体区域
- 可交互内容只放关闭、查看详情等低风险动作
- 需要用户明确二次确认时，使用 `confirm`

## 全局确认弹窗

全局确认弹窗使用 `confirm`，适合需要等待用户选择后再继续执行的操作。

### 导入

```ts
import { confirm } from '@/lib/confirm'
```

### 基础用法

```ts
const confirmed = await confirm({
  title: '确认提交',
  desc: '确定要提交当前内容吗？',
  confirmText: '确认提交',
})

if (!confirmed) {
  return
}

toast.success('提交成功')
```

### 危险操作

删除、覆盖、退出等高风险操作应设置 `destructive: true`。

```ts
const confirmed = await confirm({
  title: '删除数据',
  desc: '删除后无法恢复，确定要继续吗？',
  confirmText: '删除',
  cancelBtnText: '取消',
  destructive: true,
})

if (!confirmed) {
  return
}

// 执行删除逻辑
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title` | `React.ReactNode` | 是 | 弹窗标题 |
| `desc` | `React.ReactNode` | 是 | 弹窗描述内容 |
| `confirmText` | `React.ReactNode` | 否 | 确认按钮文案，默认由确认弹窗组件提供 |
| `cancelBtnText` | `string` | 否 | 取消按钮文案，默认由确认弹窗组件提供 |
| `destructive` | `boolean` | 否 | 是否使用危险操作按钮样式 |
| `className` | `string` | 否 | 传给弹窗内容容器的 className |

### 返回值

`confirm(options)` 返回 `Promise<boolean>`：

- 用户点击确认：返回 `true`
- 用户点击取消或关闭弹窗：返回 `false`

## 选择规则

| 场景 | 推荐方式 |
| --- | --- |
| 保存成功、复制成功、导入完成 | `toast.success` |
| 请求失败、权限不足、表单提交失败 | `toast.error` |
| 参数缺失、状态提醒、非阻塞告知 | `toast.warning` / `toast.info` |
| 删除前确认 | `confirm({ destructive: true })` |
| 提交、覆盖、退出前确认 | `confirm(...)` |

## 完整示例

```tsx
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { confirm } from '@/lib/confirm'

export function DeleteButton() {
  const handleDelete = async () => {
    const confirmed = await confirm({
      title: '删除任务',
      desc: '确定要删除这个任务吗？此操作不可撤销。',
      confirmText: '删除',
      destructive: true,
    })

    if (!confirmed) {
      return
    }

    // await deleteTask()
    toast.success('任务已删除')
  }

  return (
    <Button type='button' variant='destructive' onClick={handleDelete}>
      删除
    </Button>
  )
}
```
