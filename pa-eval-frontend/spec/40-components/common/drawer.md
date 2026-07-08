# Drawer 组件使用规范

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

`Drawer` 是通用右侧抽屉容器组件，位于 `src/components/common/drawer.tsx`。

组件只负责抽屉打开关闭、标题区、默认操作按钮和内容容器布局；它不负责表单状态、接口请求、业务校验或提交结果展示。表单场景应与 `BaseForm` 或业务表单组件组合使用。

## 导入方式

```tsx
import { Drawer } from "@/components/common/drawer";
```

## Props

```ts
type DrawerMode = "default" | "enhanced";

type DrawerProps = React.ComponentProps<typeof Sheet> & {
  title: React.ReactNode;
  children?: React.ReactNode;
  mode?: DrawerMode;
  width?: number | string;
  resizable?: boolean;
  showOverlay?: boolean;
  actions?: React.ReactNode | null;
  showCancel?: boolean;
  showConfirm?: boolean;
  cancelText?: React.ReactNode;
  confirmText?: React.ReactNode;
  onCancel?: () => void;
  onConfirm?: () => void;
  cancelProps?: React.ComponentProps<typeof Button>;
  confirmProps?: React.ComponentProps<typeof Button>;
  contentProps?: Omit<React.ComponentProps<typeof SheetContent>, "children">;
};
```

字段说明：

- `open`：控制抽屉显示状态，来自 `Sheet`。
- `onOpenChange`：抽屉打开或关闭时触发，来自 `Sheet`。
- `title`：抽屉标题，必传。
- `children`：抽屉主体内容。
- `mode`：抽屉宽度模式，默认 `default`。
- `width`：自定义抽屉宽度，支持数字或 CSS 宽度字符串。
- `resizable`：是否允许从抽屉左侧边缘拖拽调整宽度；`enhanced` 模式默认开启，其他模式默认关闭，传 `false` 可强制关闭。
- `showOverlay`：是否显示遮罩层；默认模式默认显示，`enhanced` 模式默认关闭，传入布尔值可强制覆盖；关闭遮罩层时默认同步使用非 modal 模式，让抽屉下方内容可直接点击。
- `actions`：自定义标题右侧操作区；传 `null` 可隐藏默认按钮。
- `showCancel`：是否显示默认取消按钮，默认 `true`。
- `showConfirm`：是否显示默认确认按钮，默认 `true`。
- `cancelText`：取消按钮文案，默认 `取消`。
- `confirmText`：确认按钮文案，默认 `确认`。
- `onCancel`：点击取消按钮时触发，随后组件会调用 `onOpenChange(false)`。
- `onConfirm`：点击确认按钮时触发。
- `cancelProps`：透传给取消按钮，常用于覆盖 `disabled`、`children` 等。
- `confirmProps`：透传给确认按钮，常用于绑定表单 `form`、`type` 或禁用状态。
- `contentProps`：透传给 `SheetContent`，用于追加 `className`、`style` 等容器属性。

## 宽度规则

- `mode="default"`：默认宽度 `450px`。
- `mode="enhanced"`：默认宽度 `70vw`。
- 传入 `width` 时优先使用 `width`，数字会转换为 `px`。
- 抽屉最大宽度限制为 `100vw`，避免移动端溢出。
- `resizable` 开启时，用户可拖拽抽屉左侧边缘调整宽度；开始拖拽后宽度会切换为像素值，最小宽度为 `360px`，小屏下不超过当前视口宽度。
- 拖拽后的宽度会在关闭动画期间保持，避免关闭时抽屉跳回默认宽度造成抖动。
- `showOverlay={false}` 时不会渲染遮罩层，并默认禁用 Radix Dialog 的 modal 行为，抽屉下方页面内容可直接点击；`enhanced` 模式默认采用该行为。
- `resizable` 开启时，点击遮罩层不会关闭抽屉；需要通过取消按钮、业务操作或外部受控状态关闭。

```tsx
<Drawer open={open} onOpenChange={setOpen} title="编辑配置" width={520}>
  {/* content */}
</Drawer>

<Drawer open={open} onOpenChange={setOpen} title="详情" mode="enhanced">
  {/* content */}
</Drawer>

<Drawer
  open={open}
  onOpenChange={setOpen}
  title="详情"
  mode="enhanced"
  resizable={false}
>
  {/* enhanced 宽度但禁用拖拽 */}
</Drawer>
```

## 默认操作区

标题和按钮在同一行展示。默认按钮顺序是：

1. 确认按钮
2. 取消按钮

两个默认按钮都使用 `size="sm"`。抽屉不会显示底层 `SheetContent` 自带的右上角关闭按钮。

## 内容滚动

`Drawer` 的标题区固定在顶部，主体内容区独立滚动。调用方传入的 `children` 会渲染在内部滚动容器中；当内容高度超过视口时，只滚动主体内容，不滚动 `SheetHeader`。

```tsx
<Drawer
  open={open}
  onOpenChange={setOpen}
  title="创建评测任务"
  confirmText="提交"
  onConfirm={() => {
    // 执行提交逻辑
  }}
/>
```

## 与表单组合

`Drawer` 可以与 `BaseForm` 组合成特定业务抽屉表单，例如创建任务抽屉、编辑用户抽屉或配置表单抽屉。组合后的业务抽屉表单应由调用方或业务组件命名和封装，`Drawer` 本身不感知表单字段、schema 或提交逻辑。

推荐通过 `confirmProps` 绑定表单 id，让标题区确认按钮触发表单提交。

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
      // 提交成功后由调用方关闭抽屉
      setOpen(false);
    }}
  >
    {(form) => {
      // 渲染 FormField
    }}
  </BaseForm>
</Drawer>;
```

## 新建和编辑抽屉表单

新建和编辑可以复用同一套抽屉表单方案。推荐封装一个业务组件，例如 `TaskFormDrawer`，通过是否传入当前数据判断模式。

```tsx
type TaskFormDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current?: Task;
};

function TaskFormDrawer({
  open,
  onOpenChange,
  current,
}: TaskFormDrawerProps) {
  const isEdit = !!current;
  const formId = "task-form";

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "编辑任务" : "创建任务"}
      confirmText={isEdit ? "保存" : "创建"}
      confirmProps={{ form: formId, type: "submit" }}
    >
      <BaseForm
        id={formId}
        schema={taskSchema}
        defaultValues={{
          title: current?.title ?? "",
          priority: current?.priority ?? "medium",
        }}
        onSubmit={(data) => {
          if (isEdit) {
            // updateTask(current.id, data)
          } else {
            // createTask(data)
          }

          onOpenChange(false);
        }}
      >
        {(form) => (
          <TaskFields form={form} />
        )}
      </BaseForm>
    </Drawer>
  );
}
```

如果同一个抽屉会在不同编辑对象之间切换，需要注意 `defaultValues` 不会自动重置表单值。可在业务表单里监听 `current` 后调用 `form.reset(...)`，或在 `BaseForm` 后续扩展 `resetKey` 之类的显式重置能力。

## 详情抽屉

详情抽屉只用于展示数据，不应使用 `BaseForm`。推荐组合 `Drawer + BaseDetail`，或者在业务目录封装 `TaskDetailDrawer`。

纯展示详情时，可以隐藏确认按钮，仅保留关闭按钮：

```tsx
<Drawer
  open={open}
  onOpenChange={setOpen}
  title="任务详情"
  mode="enhanced"
  showConfirm={false}
  cancelText="关闭"
>
  <BaseDetail
    columns={2}
    items={[
      { label: "任务标题", value: task.title },
      { label: "状态", value: <Badge variant="secondary">{task.status}</Badge> },
      { label: "优先级", value: task.priority },
      { label: "创建时间", value: task.createdAt },
    ]}
  />
</Drawer>
```

如果详情页需要复杂区块，可以使用 `BaseDetail` 的自定义项：

```tsx
<BaseDetail
  columns={2}
  items={[
    { label: "任务标题", value: task.title },
    {
      key: "metrics",
      span: "full",
      render: <TaskMetricsPanel metrics={task.metrics} />,
    },
  ]}
/>
```

详情抽屉需要提供编辑入口时，使用 `actions` 自定义标题右侧操作区：

```tsx
<Drawer
  open={open}
  onOpenChange={setOpen}
  title="任务详情"
  mode="enhanced"
  actions={
    <Button size="sm" onClick={onEdit}>
      编辑
    </Button>
  }
>
  <TaskDetailContent task={task} />
</Drawer>
```

## 多抽屉状态管理

同一页面存在新建、编辑、详情等多个抽屉时，推荐用一个联合状态管理当前抽屉类型，避免多个 boolean 状态互相冲突。

```ts
type TaskDrawerState =
  | { type: "create" }
  | { type: "edit"; task: Task }
  | { type: "detail"; task: Task }
  | null;
```

示例：

```tsx
const [drawer, setDrawer] = useState<TaskDrawerState>(null);

<TaskFormDrawer
  open={drawer?.type === "create"}
  onOpenChange={(open) => !open && setDrawer(null)}
/>

<TaskFormDrawer
  open={drawer?.type === "edit"}
  current={drawer?.type === "edit" ? drawer.task : undefined}
  onOpenChange={(open) => !open && setDrawer(null)}
/>

<TaskDetailDrawer
  open={drawer?.type === "detail"}
  task={drawer?.type === "detail" ? drawer.task : undefined}
  onEdit={() => {
    if (drawer?.type === "detail") {
      setDrawer({ type: "edit", task: drawer.task });
    }
  }}
  onOpenChange={(open) => !open && setDrawer(null)}
/>
```

## 使用约定

- 不在 `Drawer` 内部写业务字段、表单 schema、接口请求或 toast。
- 需要复用某个业务抽屉表单时，应在业务目录封装 `TaskCreateDrawer`、`UserEditDrawer` 等组件。
- 详情抽屉应封装为 `TaskDetailDrawer`、`UserDetailDrawer` 等业务组件，内容展示优先使用 `BaseDetail` 或业务详情组件。
- 表单提交成功后是否关闭抽屉，由调用方决定。
- 取消按钮默认会关闭抽屉；如果需要二次确认，应在调用方自定义 `actions`。
- 标题区只保留标题和操作按钮，不放描述文案。
- 需要复杂 footer、批量操作或危险操作时，优先使用 `actions` 自定义操作区。
