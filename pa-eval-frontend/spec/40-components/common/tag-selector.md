# TagSelector 组件使用规范

## 适用任务

- 在表单、筛选器或设置项中选择多个标签。
- 需要从候选标签中快速追加，也允许用户输入并创建新标签的场景。

## 组件定位

`TagSelector` 是项目通用的受控多标签选择组件，放在 `src/components/common`。它组合 shadcn/ui 的 `Popover`、`Input`、`Button`、`Badge`，统一处理：

- 已选标签展示和移除。
- 候选标签追加。
- 手动输入并创建新标签。
- 标签值去空格、去空值、去重。
- 最大标签数量和单个标签长度限制。

`TagSelector` 不负责请求标签列表、不读取路由或业务 store、不做权限判断，也不绑定某个模块的标签枚举。调用方负责维护 `value` 状态、提供候选 `options`，并在 `onChange` 中保存结果。

## 导入

```tsx
import { TagSelector } from '@/components/common/tag-selector'
import type { TagOption } from '@/components/common/tag-selector'
```

## Props 契约

```tsx
type TagOption = {
  label: string
  value?: string
  disabled?: boolean
}

type TagSelectorProps = {
  value: string[]
  options: Array<TagOption | string>
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  allowCreate?: boolean
  disabled?: boolean
  maxTags?: number
  maxTagLength?: number
  className?: string
  onChange: (value: string[]) => void
}
```

规则：

- `value` 必填，是当前已选标签值数组；组件会在内部按 `trim()` 后的值展示，并在更新时提交归一化后的数组。
- `options` 必填，支持字符串数组或 `{ label, value, disabled }` 对象数组；字符串选项的 `label` 和 `value` 相同。
- `placeholder` 是未选择任何标签时的触发器文案，默认 `选择标签`。
- `searchPlaceholder` 是输入框占位文案，默认 `搜索或新增标签`。
- `emptyText` 是没有候选标签时的空态文案，默认 `暂无标签`。
- `allowCreate` 默认为 `true`。为 `false` 时输入框禁用，只能从候选项追加。
- `disabled` 为 `true` 时组件整体不可交互。
- `maxTags` 限制最多可选标签数量。达到上限后，候选按钮、输入框和新增按钮都会禁用。
- `maxTagLength` 限制新增标签的字符长度，按 `Array.from(value).length` 计算，适合包含中文或 emoji 的输入。
- `className` 只用于触发器外层布局和宽度覆盖，例如 `max-w-sm`。
- `onChange` 必须更新调用方状态；组件不会在内部持久化最终值。

## 推荐用法

普通表单字段：

```tsx
const [tags, setTags] = useState<string[]>([])

return (
  <TagSelector
    value={tags}
    options={['安全性', '准确性', '性能']}
    onChange={setTags}
  />
)
```

使用对象选项并限制数量：

```tsx
<TagSelector
  value={form.tags}
  options={[
    { label: '高优先级', value: 'priority-high' },
    { label: '已废弃', value: 'deprecated', disabled: true },
  ]}
  maxTags={5}
  maxTagLength={20}
  placeholder='选择任务标签'
  onChange={(nextTags) => updateForm({ tags: nextTags })}
/>
```

只允许从候选项选择：

```tsx
<TagSelector
  value={filters.tags}
  options={availableTags}
  allowCreate={false}
  searchPlaceholder='从候选标签中选择'
  emptyText='暂无可选标签'
  onChange={(nextTags) => setFilters({ ...filters, tags: nextTags })}
/>
```

## 值归一化规则

- 组件会对 `value`、`options.value`、字符串选项和手工输入执行 `trim()`。
- 归一化后为空的值会被忽略。
- 重复值会被去重，并保留首次出现的顺序。
- 已选标签展示时，优先使用候选项中相同 `value` 对应的 `label`；没有匹配候选项时展示原始标签值。
- `onChange` 收到的是归一化后的标签值数组，不是展示文案数组。

## 交互规则

- 点击触发器或在触发器聚焦时按 `Enter` / 空格可打开或关闭 Popover。
- 点击已选标签中的移除按钮会删除该标签，并阻止触发器点击冒泡。
- 点击候选按钮会追加该标签；已选中、禁用或达到 `maxTags` 后的候选项不可点击。
- 在输入框输入内容后，点击新增按钮或按 `Enter` 会创建标签。
- 新增成功后输入框会清空。
- 当 `allowCreate=false`、`disabled=true` 或已达到 `maxTags` 时，输入框不可编辑。

## 样式规则

- 组件默认宽度为 `w-full`，调用方应在表单布局外层或 `className` 中约束宽度。
- 已选标签使用 `Badge variant='secondary'`，候选项使用 `Button variant='outline'`。
- 样式使用项目语义 token，例如 `border-input`、`bg-background`、`text-muted-foreground`、`ring`。
- 不要通过 `className` 覆盖组件核心颜色体系；局部宽度、高度和布局约束可以覆盖。
- 在表单行、抽屉或筛选区中使用时，外层容器应提供稳定宽度，避免 Popover 宽度随内容抖动。

## 与业务逻辑的边界

- 标签列表请求、搜索接口、防抖和远程分页应在调用方或业务 hook 中实现。
- 标签合法性校验应由调用方在提交前完成；组件只处理基础空值、去重和长度限制。
- 如果需要展示标签颜色、权限、分组、描述或异步搜索结果，应先评估是否需要业务私有组件，不要直接把业务规则塞进 `TagSelector`。
- 如果需要单选标签，应优先使用 `Select`、`RadioGroup` 或业务私有组件，不要用 `TagSelector` 模拟单选。

## 禁止事项

- 不要在 `TagSelector` 中新增模块名称、接口请求、权限 code 或业务枚举。
- 不要把真实密钥、Token、内部口令等敏感内容作为标签展示。
- 不要依赖候选项顺序表达业务优先级以外的隐式逻辑；需要排序时在调用方显式处理。
- 不要在业务页面重复实现同类多标签选择 Popover，优先复用 `TagSelector`。
- 不要修改 `spec/README.md` 等索引文件，除非任务明确要求更新索引。

## 检查清单

使用或修改 `TagSelector` 时确认：

- `value` 是受控状态，`onChange` 会同步更新调用方。
- `options` 已由调用方过滤、排序并注入，不在组件内请求接口。
- `maxTags`、`maxTagLength` 与业务校验规则一致。
- `allowCreate` 的开启或关闭符合当前场景。
- 空态文案和占位文案符合页面语义。
- 表单外层宽度稳定，Popover 不会超出主要内容区。
- 修改组件 props、归一化逻辑或交互行为后，运行 `npm run typecheck`，必要时补充 `npm run lint`。
