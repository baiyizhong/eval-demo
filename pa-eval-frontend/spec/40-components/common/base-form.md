# BaseForm 组件使用规范

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

`BaseForm` 是通用基础表单封装组件，位于 `src/components/common/base-form.tsx`。

组件基于 `react-hook-form`、`zod` 和 shadcn/ui `Form` 实现，负责创建表单实例、接入 `zodResolver`、处理提交事件，并通过 render props 把 `form` 暴露给调用方渲染字段。它不绑定抽屉、弹窗、页面或任何业务模块。

## 导入方式

```tsx
import { BaseForm } from "@/components/common/base-form";
```

## Props

```ts
type BaseFormProps<TFieldValues extends FieldValues> = Omit<
  React.ComponentProps<"form">,
  "children" | "onSubmit"
> & {
  schema: z.ZodType<TFieldValues, TFieldValues>;
  defaultValues?: DefaultValues<TFieldValues>;
  formOptions?: Omit<UseFormProps<TFieldValues>, "defaultValues" | "resolver">;
  onSubmit: SubmitHandler<TFieldValues>;
  children:
    | React.ReactNode
    | ((form: UseFormReturn<TFieldValues>) => React.ReactNode);
};
```

字段说明：

- `schema`：`zod` schema，用于表单校验。
- `defaultValues`：表单默认值，传给 `useForm`。
- `formOptions`：额外 `useForm` 配置，不允许覆盖 `defaultValues` 和 `resolver`。
- `onSubmit`：校验通过后的提交回调。
- `children`：表单内容，推荐使用 render props 获取 `form` 后渲染 `FormField`。
- 其他原生 `form` 属性会透传给内部 `<form>`，例如 `id`、`className`、`autoComplete`。

## 基础用法

```tsx
import { z } from "zod";
import { BaseForm } from "@/components/common/base-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  title: z.string().min(1, "请输入标题"),
});

type FormValues = z.infer<typeof schema>;

export function ExampleForm() {
  const handleSubmit = (data: FormValues) => {
    // 提交业务逻辑
  };

  return (
    <BaseForm
      schema={schema}
      defaultValues={{ title: "" }}
      onSubmit={handleSubmit}
    >
      {(form) => (
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>标题</FormLabel>
              <FormControl>
                <Input placeholder="输入标题" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </BaseForm>
  );
}
```

## 与 Drawer 组合

`BaseForm` 不依赖 `Drawer`。当它与 `Drawer` 组合时，形成的是特定业务抽屉表单，例如创建任务抽屉表单或编辑配置抽屉表单。业务语义、字段、默认值和提交行为应放在业务组件里，公共 `Drawer` 与 `BaseForm` 只提供组合基础。

需要把抽屉标题区确认按钮作为提交按钮时，通过表单 `id` 组合。

```tsx
const formId = "create-task-form";

<Drawer
  open={open}
  onOpenChange={setOpen}
  title="创建评测任务"
  confirmText="提交"
  confirmProps={{ form: formId, type: "submit" }}
>
  <BaseForm
    id={formId}
    schema={schema}
    defaultValues={{ title: "" }}
    onSubmit={(data) => {
      // 保存数据
      setOpen(false);
    }}
  >
    {(form) => (
      // 渲染 FormField
      null
    )}
  </BaseForm>
</Drawer>;
```

## 与 BaseDetail 的关系

`BaseForm` 用于需要输入、校验和提交的场景，例如新建、编辑、配置保存。只读详情展示不要使用 `BaseForm`，应使用 `BaseDetail` 或业务详情组件。

`BaseDetail` 位于 `src/components/common/base-detail.tsx`，适合展示结构化详情字段，也支持自定义组件块。

```tsx
import { BaseDetail } from "@/components/common/base-detail";

<BaseDetail
  columns={2}
  items={[
    { label: "任务标题", value: task.title },
    { label: "状态", value: <Badge variant="secondary">{task.status}</Badge> },
    { label: "创建时间", value: task.createdAt },
    {
      key: "metrics",
      span: "full",
      render: <TaskMetricsPanel metrics={task.metrics} />,
    },
  ]}
/>;
```

在抽屉中使用时：

```tsx
<Drawer
  open={open}
  onOpenChange={setOpen}
  title="任务详情"
  mode="enhanced"
  showConfirm={false}
  cancelText="关闭"
>
  <BaseDetail columns={2} items={detailItems} />
</Drawer>
```

选择规则：

- 新建、编辑、提交：使用 `BaseForm`
- 查看详情、只读字段、状态展示：使用 `BaseDetail`
- 同一个业务对象通常可以分别封装 `TaskFormDrawer` 和 `TaskDetailDrawer`

## 扩展方式

业务表单可以基于 `BaseForm` 再封装更具体的组件，例如 `TaskForm`、`UserForm`、`ConfigForm`。

```tsx
function TaskForm({ onSubmit }: { onSubmit: (data: TaskFormValues) => void }) {
  return (
    <BaseForm schema={taskSchema} defaultValues={{ title: "" }} onSubmit={onSubmit}>
      {(form) => {
        // 只在这里维护任务字段
      }}
    </BaseForm>
  );
}
```

推荐扩展边界：

- `BaseForm` 只保留通用表单能力。
- 业务抽屉表单组件负责组合 `Drawer` 与 `BaseForm`，并维护字段、默认值、字段布局和业务文案。
- 页面或容器组件负责打开关闭、接口请求、成功提示和错误处理。

## 使用约定

- 不在 `BaseForm` 内部调用接口、toast、confirm 或路由跳转。
- 不把 `BaseForm` 命名为某个业务表单；业务语义放到二次封装组件里。
- `schema` 和 `defaultValues` 应保持字段一致。
- 复杂字段组合应拆到业务表单组件，避免页面文件过长。
