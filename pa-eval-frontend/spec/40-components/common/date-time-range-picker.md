# DateTimeRangePicker 组件使用规范

## 适用任务

- 使用、修改或评审日期区间、日期时间区间选择功能。
- 在筛选器、查询条件或表单中接入 `DateTimeRangePicker`。

## 组件定位

`DateTimeRangePicker` 是受控的日期或日期时间区间输入组件，组合了开始与结束文本输入、区间日历、可选的起止时间输入、单边清除和区间校验。

组件只负责本地日期时间字符串区间的输入与规范化，不负责业务筛选提交、时区换算、快捷时间范围或接口请求。调用方必须通过 `value` 和 `onChange` 保存状态。

## 导入方式

```tsx
import { DateTimeRangePicker } from '@/components/common/date-time/date-time-range-picker'
```

## Props

```ts
type DateTimeFormat = 'HH:mm' | 'HH:mm:ss'

type DateTimeRangePickerProps = {
  value: string[]
  onChange: (nextValue: string[]) => void
  disabled?: boolean
  clearable?: boolean
  placeholder?: string
  startPlaceholder?: string
  endPlaceholder?: string
  showTime?: boolean
  timeStep?: number
  timeFormat?: DateTimeFormat
  className?: string
}
```

字段说明：

- `value`：当前受控区间；元素顺序固定为开始值、结束值。
- `onChange`：区间选择完成、时间变化、文本校验通过或单边清除后触发。
- `disabled`：禁用两个文本输入、日历按钮和清除操作。
- `clearable`：是否显示单边清除按钮，默认 `true`。
- `placeholder`：整个输入组合的可访问名称；不会覆盖两个输入框各自的 placeholder。
- `startPlaceholder`：开始输入框提示；默认使用当前格式。
- `endPlaceholder`：结束输入框提示；默认使用当前格式。
- `showTime`：是否启用开始和结束时间选择，默认 `false`。
- `timeStep`：两个原生时间输入的步进秒数；不传时，分钟格式默认 `60`，秒格式默认 `1`。
- `timeFormat`：时间精度，默认 `'HH:mm'`；仅在 `showTime` 为 `true` 时生效。
- `className`：追加到组件根容器，主要用于布局和尺寸调整。

## 值契约

组件可能通过 `onChange` 返回以下形态：

| 状态 | 值示例 |
| --- | --- |
| 空区间 | `[]` |
| 完整区间 | `['2026-07-01', '2026-07-23']` |
| 清除结束值后保留开始值 | `['2026-07-01', '']` |
| 清除开始值后保留结束值 | `['', '2026-07-23']` |

调用方不能假设数组永远有两个元素。读取和转换时使用 `nextValue[0] ?? ''`、`nextValue[1] ?? ''`，或使用能正确处理空元素的映射逻辑。

标准输出格式与 `DateTimePicker` 一致：日期为 `YYYY-MM-DD`，日期时间为 `YYYY-MM-DD HH:mm` 或 `YYYY-MM-DD HH:mm:ss`。

## 选择与校验规则

- 日历中第一次点击只形成开始日期草稿；选择结束日期后才提交完整区间。
- 日期模式下，完整选择后自动关闭 Popover。
- 日期时间模式下，完整选择后保留 Popover，供用户调整开始和结束时间。
- 启用时间后，未显式提供时间的开始值默认补为 `00:00`，结束值默认补为 `23:59`；秒格式分别为 `00:00:00` 和 `23:59:59`。
- 开始值晚于结束值时不触发新的 `onChange`，并显示“开始时间不能晚于结束时间”。
- 文本输入格式、真实日期和时分秒校验规则与 `DateTimePicker` 一致。
- 只有开始和结束日期都存在时，Popover 内的两个时间输入才可编辑。

## 推荐用法

### 日期筛选

```tsx
const [createdAtRange, setCreatedAtRange] = useState<string[]>([])

<Field label='创建日期'>
  <DateTimeRangePicker
    value={createdAtRange}
    onChange={setCreatedAtRange}
    startPlaceholder='开始日期'
    endPlaceholder='结束日期'
  />
</Field>
```

### 日期时间筛选与接口格式转换

```tsx
import {
  fromDateTimePickerValue,
  toDateTimePickerValue,
} from '@/components/common/date-time/date-time-utils'

<Field label='Trace 时间范围'>
  <DateTimeRangePicker
    value={form.createdAtRange.map(toDateTimePickerValue)}
    showTime
    timeFormat='HH:mm'
    startPlaceholder='开始时间'
    endPlaceholder='结束时间'
    onChange={(nextValue) => {
      updateForm({
        createdAtRange: [
          fromDateTimePickerValue(nextValue[0]),
          fromDateTimePickerValue(nextValue[1]),
        ],
      })
    }}
  />
</Field>
```

`toDateTimePickerValue()` 和 `fromDateTimePickerValue()` 只替换空格与 `T`，不会进行时区换算。接口使用 UTC、offset 或时间戳时，调用方必须在组件边界显式转换。

## 与筛选器组合

`FilterPanel` 的 `dateRange` 字段已经使用本组件。配置型筛选优先通过 `FilterPanel` 的字段定义接入，不要额外注册等价 renderer：

```ts
{
  id: 'createdAtRange',
  type: 'dateRange',
  label: '创建时间',
  showTime: true,
  timeFormat: 'HH:mm',
  startPlaceholder: '开始时间',
  endPlaceholder: '结束时间',
}
```

独立表单或不属于 `FilterPanel` 的复杂布局可以直接使用 `DateTimeRangePicker`。

## 响应式与布局约定

- 组件使用容器查询适配宽度；窄容器下开始和结束输入分行，容器达到 `25rem` 后两个输入与日历按钮同行。
- 调用方应给组件可用宽度，不要依赖覆盖内部 grid、断点或输入高度来强制排版。
- `className` 只用于外层布局，不覆盖内部语义颜色、错误态或控件交互。
- 快捷范围按钮属于业务筛选逻辑，应放在组件外并通过受控 `value` 更新区间。

## 禁止事项

- 不要把数组顺序反转；第一个元素永远是开始值，第二个元素永远是结束值。
- 不要假设 `onChange` 永远返回长度为 2 的完整区间。
- 不要把 `Date`、时间戳、`null` 或 `undefined` 作为数组元素传入。
- 不要把带 `Z` 或 offset 的时间字符串直接当作组件标准值。
- 不要在调用方重复实现开始时间不得晚于结束时间的同层 UI 校验。
- 不要在业务页面重复拼装双 Input、Calendar 和 Popover 来替代本组件。

## 检查清单

- 空区间、完整区间和单边为空都能被调用方状态安全处理。
- 开始值和结束值顺序正确，接口提交前按业务要求判断是否完整。
- `showTime`、`timeFormat` 与接口字段精度一致。
- UTC 或 offset 时间已在组件边界显式转换。
- 日历草稿、非法区间、清除单边和响应式布局均符合预期。
- 涉及代码变更时运行 `npm run typecheck`。
