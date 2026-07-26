# Stepper 组件使用规范

## 适用任务

- 处理多步骤表单、向导式配置流程或阶段进度展示。

## 组件定位

`Stepper` 是项目内通用的多步骤进度组件，放在 `src/components/common`。它用于展示当前流程所处步骤，并可选支持点击步骤切换。

`Stepper` 不负责表单状态、步骤校验、接口请求、路由跳转或提交行为。调用方负责维护 `currentStep`、处理 `onStepChange`、控制是否允许跨步骤跳转，并在切换前执行必要校验。

## 导入

```tsx
import { Stepper } from '@/components/common/stepper'
```

## Props 契约

```tsx
type StepperItem = {
  id?: string
  title: React.ReactNode
  description?: React.ReactNode
}

type StepperProps = {
  items: StepperItem[]
  currentStep: number
  onStepChange?: (step: number) => void
  className?: string
}
```

规则：

- `items` 必须按展示顺序传入。每一项必须包含 `title`，可选 `description` 用于补充当前步骤目标。
- `id` 可选。步骤顺序稳定且不会动态增删时可省略；步骤可能重排或动态增删时必须传入稳定 `id`。
- `currentStep` 使用从 `0` 开始的索引，必须由调用方保证在 `0` 到 `items.length - 1` 范围内。
- `onStepChange` 存在时步骤按钮可点击；不存在时组件表现为只读进度。
- `className` 只用于外层布局，例如控制上下间距或容器宽度，不用于覆盖内部颜色、连接线或步骤圆点状态。

## 推荐用法

基础多步骤表单：

```tsx
const stepItems = [
  { title: '基础信息', description: '填写名称和说明' },
  { title: '评估配置', description: '选择评估器并映射变量' },
  { title: '样本设置', description: '设置数据来源和报告' },
]

export function ExampleWizard() {
  const [step, setStep] = useState(0)

  return (
    <div className='flex flex-col gap-5'>
      <Stepper
        items={stepItems}
        currentStep={step}
        onStepChange={(nextStep) => {
          if (canMoveToStep(nextStep)) {
            setStep(nextStep)
          }
        }}
      />

      {step === 0 ? <BasicInfoStep /> : null}
      {step === 1 ? <EvaluatorStep /> : null}
      {step === 2 ? <SampleStep /> : null}
    </div>
  )
}
```

只读进度：

```tsx
<Stepper items={stepItems} currentStep={currentStep} />
```

带稳定 `id`：

```tsx
<Stepper
  items={[
    { id: 'basic', title: '基础信息' },
    { id: 'mapping', title: '变量映射' },
    { id: 'sample', title: '样本设置' },
  ]}
  currentStep={step}
  onStepChange={handleStepChange}
/>
```

## 交互规则

- 点击步骤只触发 `onStepChange(index)`，组件不会自行改变当前步骤。
- 向后跳转时，调用方应先校验当前步骤和中间步骤；校验失败时保持或回退到失败步骤，并展示错误提示。
- 向前跳转通常允许直接切换，并由调用方清理当前错误提示。
- 上一步、下一步、提交等主操作按钮由调用方自行渲染，不放入 `Stepper`。
- 多步骤表单底部操作区应与当前步骤状态保持一致，例如首步禁用“上一步”，末步显示“提交”。

## 样式与可访问性规则

- 组件外层使用 `nav aria-label='步骤进度'`，内部使用 `ol` 和 `li` 保留有序步骤语义。
- 当前步骤通过 `aria-current='step'` 标记。
- 已完成步骤使用 `lucide-react` 的 `Check` 图标；未完成步骤显示从 `1` 开始的序号。
- 连接线只表达步骤之间的结构关系，不使用完成态颜色。
- 步骤项不使用外边框、hover 背景或选中背景效果，避免与页面卡片、表单区块产生竞争。
- 文本标题使用 `truncate`，描述使用 `line-clamp-2`；调用方应避免传入过长的不可断行文本。
- 颜色使用语义 token，例如 `bg-muted`、`text-muted-foreground`、`border-primary`、`bg-primary`。

## 使用边界

- `Stepper`：用于线性向导流程中的步骤进度。
- `Tabs`：用于同级内容切换，切换不代表流程完成度时使用。
- `PageNav`：用于页面内二级导航或子页面导航。
- `SidebarNav`：用于设置类页面侧向导航。
- `NavigationProgress`：用于全局路由切换进度。

## 禁止事项

- 不要在 `Stepper` 中写入业务步骤名称、业务枚举或接口请求。
- 不要让 `Stepper` 直接读取表单状态、React Query、路由参数或模块 store。
- 不要把非线性导航、筛选 tab 或页面二级导航伪装成 `Stepper`。
- 不要在调用方通过 `className` 覆盖内部步骤圆点、连接线或完成态颜色。
- 不要用 `window.alert` 或浏览器原生确认打断步骤切换；错误提示应由页面或表单区域承担。
- 不要在没有校验保护的情况下允许用户向后跨越未完成步骤。

## 检查清单

使用或修改 `Stepper` 时确认：

- `currentStep` 是合法的从 `0` 开始的索引。
- `items` 顺序稳定；动态步骤提供稳定 `id`。
- 步骤切换、校验、错误提示和提交逻辑都在调用方维护。
- 只读进度不传 `onStepChange`。
- 没有把 `Tabs`、`PageNav` 或全局加载进度场景误用为 `Stepper`。
- 修改 `Stepper` 的语义、连接线或样式约束时，同步更新 `src/tests/common/stepper.test.ts`。
- 涉及代码变更时运行 `npm run typecheck`；仅改规范文档时检查 Markdown 链接和索引入口。
