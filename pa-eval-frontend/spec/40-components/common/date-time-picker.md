# DateTimePicker 组件使用规范

## 适用任务

- 使用、修改或评审单日期、单日期时间选择功能。
- 在表单、筛选器中接入 `DateTimePicker`。

## 组件定位

`DateTimePicker` 是受控的单日期或单日期时间输入组件，组合了文本输入、日历 Popover、可选时间输入、清除操作和格式校验。

组件只负责本地日期时间字符串的输入与规范化，不负责表单字段标签、必填校验、时区换算、服务端格式转换或接口提交。调用方必须通过 `value` 和 `onChange` 保存状态。

## 导入方式

```tsx
import { DateTimePicker } from '@/components/common/date-time/date-time-picker'
```

需要在接口格式与组件格式之间转换时，从工具文件按需导入：

```tsx
import {
  fromDateTimePickerValue,
  toDateTimePickerValue,
} from '@/components/common/date-time/date-time-utils'
```

不要为日期时间目录新增全局 barrel 文件。

## Props

```ts
type DateTimeFormat = 'HH:mm' | 'HH:mm:ss'

type DateTimePickerProps = {
  value: string
  onChange: (nextValue: string) => void
  disabled?: boolean
  clearable?: boolean
  placeholder?: string
  showTime?: boolean
  timeStep?: number
  timeFormat?: DateTimeFormat
  className?: string
}
```

字段说明：

- `value`：当前受控值；空值必须传 `''`。
- `onChange`：选择日期、修改时间、清除或文本校验通过后触发。
- `disabled`：禁用文本输入、日历按钮和清除操作。
- `clearable`：是否显示清除按钮，默认 `true`。
- `placeholder`：输入提示，同时用于输入组合的可访问名称；不传时展示当前格式。
- `showTime`：是否启用时间选择，默认 `false`。
- `timeStep`：原生时间输入的步进秒数；不传时，分钟格式默认 `60`，秒格式默认 `1`。
- `timeFormat`：时间精度，默认 `'HH:mm'`；仅在 `showTime` 为 `true` 时生效。
- `className`：追加到组件根容器，主要用于布局和尺寸调整。

## 值格式与输入规则

组件对外使用字符串，不使用 `Date`：

| 配置 | 标准输出 | 示例 |
| --- | --- | --- |
| `showTime={false}` | `YYYY-MM-DD` | `2026-07-23` |
| `showTime timeFormat='HH:mm'` | `YYYY-MM-DD HH:mm` | `2026-07-23 09:30` |
| `showTime timeFormat='HH:mm:ss'` | `YYYY-MM-DD HH:mm:ss` | `2026-07-23 09:30:15` |

文本输入失焦或按 Enter 后进行校验和规范化：

- 日期支持 `-`、`/`、`.` 分隔，也支持紧凑的 `YYYYMMDD` 输入。
- 日期时间支持空格或 `T` 分隔；紧凑格式支持 `YYYYMMDDHH`、`YYYYMMDDHHmm`、`YYYYMMDDHHmmss`。
- 不存在的日期、越界的时分秒或与当前模式不符的输入不会触发 `onChange`，组件会就地显示错误。
- 启用时间但只输入日期时，单值组件按当天 `00:00` 或 `00:00:00` 补齐。
- 清除时回调 `onChange('')`。

## 推荐用法

### 仅选择日期

```tsx
const [birthday, setBirthday] = useState('')

<Field label='出生日期'>
  <DateTimePicker value={birthday} onChange={setBirthday} />
</Field>
```

### 选择日期和时间

```tsx
const [runAt, setRunAt] = useState('')

<Field label='执行时间'>
  <DateTimePicker
    value={runAt}
    onChange={setRunAt}
    showTime
    timeFormat='HH:mm'
    placeholder='选择执行时间'
  />
</Field>
```

字段标题由外层 `Field`、`FormField` 或等价表单结构提供，不要只依赖 placeholder 表达字段含义。

## 接口格式与时区

组件值表示本地日期或本地日期时间，不包含时区信息。`toDateTimePickerValue()` 和 `fromDateTimePickerValue()` 只在第一个空格与 `T` 之间替换，不执行时区换算：

```tsx
<DateTimePicker
  value={toDateTimePickerValue(form.runAt)}
  showTime
  onChange={(nextValue) => {
    updateForm({ runAt: fromDateTimePickerValue(nextValue) })
  }}
/>
```

如果接口字段是 UTC、带 offset 的 ISO 8601 时间或时间戳，调用方必须使用项目内相应的日期工具显式转换，不能直接用上述两个 helper 冒充时区转换。

## 交互与布局约定

- 聚焦文本框会打开日历，点击日历按钮也会打开日历。
- 日期模式下，选中日期后自动关闭 Popover；日期时间模式下保留 Popover，便于继续设置时间。
- `className` 只用于外层布局，不覆盖内部语义颜色、错误态或控件交互。
- 组件已有清除按钮、错误提示和 ARIA 属性，调用方不要在组件内部结构外重复实现同类交互。

## 禁止事项

- 不要把 `Date`、时间戳、`null` 或 `undefined` 直接传给 `value`。
- 不要把带 `Z` 或 offset 的时间字符串直接当作组件标准值。
- 不要在 `onChange` 中忽略空字符串，否则受控值会与组件清除状态不一致。
- 不要用 `timeStep` 代替业务校验；接口仍需校验允许的时间粒度。
- 不要在业务页面重复拼装 Input、Calendar 和 Popover 来替代本组件。

## 检查清单

- `value` 始终是字符串，空值使用 `''`。
- `showTime`、`timeFormat` 与接口字段精度一致。
- UTC 或 offset 时间已在组件边界显式转换。
- 外层表单提供清晰字段标题和业务校验信息。
- 清除、非法输入、键盘 Enter 和禁用状态均符合预期。
- 涉及代码变更时运行 `npm run typecheck`。
