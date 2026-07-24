# 日期时间选择组件详细设计

## 背景

`FilterPanel` 的 `dateRange` 字段原本将完整区间渲染为一个按钮文本。用户只能通过日历选择日期，并在 Popover 底部修改时间，不能直接编辑完整的开始、结束日期时间。组件实现和日期工具也全部内嵌在 `filter-panel.tsx`，不利于独立维护和测试。

本设计将 `DateTimeRangePicker` 抽取到 `src/components/common/date-time/`，并补充同风格的单值 `DateTimePicker`，把相关类型、解析和格式化工具一并内聚到该目录。

## 目标

- 日期区间入口由开始输入框、结束输入框和末尾日历图标组成。
- 控件宽度不足时，结束输入框和日历图标换到第二行。
- 支持直接输入、粘贴、失焦或 Enter 后自动格式化。
- 校验真实日期、合法时间和区间先后顺序，错误值不向外提交。
- 通过 `showTime` 配置支持日期区间和日期时间区间。
- 保持外部值为 `[]` 或两个规范化字符串组成的数组。

## 目录与职责

```text
src/components/common/date-time/
├── date-time-picker.tsx
├── date-time-range-picker.tsx
├── date-time-utils.ts
└── date-time.types.ts
```

- `date-time-picker.tsx`：单日期或日期时间选择、输入与清除交互。
- `date-time-range-picker.tsx`：区间组件 UI、输入草稿、Popover、日历及时间联动。
- `date-time-calendar-locale.ts`：两个 Picker 共用的中文日历 locale 与导航辅助文案。
- `date-time-utils.ts`：日期解析、格式化、时间规范化和区间比较纯函数。
- `date-time.types.ts`：公共配置、组件 Props 和解析结果类型。

测试仍按项目约束放在 `src/tests`，不放入组件源码目录。

## 组件接口

```ts
type DateTimeRangePickerProps = {
  value: string[]
  onChange: (nextValue: string[]) => void
  disabled?: boolean
  placeholder?: string
  startPlaceholder?: string
  endPlaceholder?: string
  showTime?: boolean
  timeStep?: number
  timeFormat?: 'HH:mm' | 'HH:mm:ss'
  className?: string
}
```

`FilterPanel` 继续接收原有 `DateRangeFilterField`，无需业务调用方修改配置。

## 值协议

| 模式 | 生效值 | 清空值 |
| --- | --- | --- |
| 日期 | `["YYYY-MM-DD", "YYYY-MM-DD"]` | `[]` |
| 日期时间（分钟） | `["YYYY-MM-DD HH:mm", "YYYY-MM-DD HH:mm"]` | `[]` |
| 日期时间（秒） | `["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD HH:mm:ss"]` | `[]` |
| 仅开始 | `[start, ""]` | - |
| 仅结束 | `["", end]` | - |

组件不提交单元素数组。日历只选择开始日期时，值保存在组件草稿中，不触发 `onChange`，避免在用户尚未完成选择时覆盖原有完整区间。手工清空或通过 clearable 清空任意一端时使用空字符串占位，使调用方可以进行单边区间查询；两端均为空时提交 `[]`。

## 输入解析与格式化

日期接受以下形式：

- `20260723`
- `2026-7-23`
- `2026/7/23`
- `2026.7.23`

日期时间还接受紧凑格式 `202607231430`、`20260723143005`，以及使用空格或 `T` 分隔的时间。失焦或按 Enter 后按当前配置格式化。

日期时间模式只输入日期时，开始端补 `00:00` 或 `00:00:00`，结束端补 `23:59` 或 `23:59:59`。`timeStep` 继续传给 Popover 内的原生时间输入，用于控制选择步长，不改变既有默认结束时间语义。

## 状态与提交

组件内部维护：

- `startText`、`endText`：允许暂时不合法的输入草稿。
- `draftRange`：日历尚未选完的区间。
- `errors`：开始、结束或区间级错误。
- `open`：受控 Popover 开关。

外部 `value` 更新后同步覆盖输入草稿并清理错误。单端失焦时先规范化当前端；两端均合法且开始不晚于结束时才调用 `onChange`。清空任意一端会清空外部完整区间。

## Popover 与可访问性

输入框不能嵌套在按钮中。组件使用 `PopoverAnchor` 定位整个输入组，只有末尾日历图标按钮作为 `PopoverTrigger`：

- 输入框负责手工编辑。
- 图标按钮负责打开日历。
- 输入组使用 `role="group"` 和业务占位文案作为可访问名称。
- 两个输入分别提供开始、结束 `aria-label`。
- 校验失败设置 `aria-invalid`，错误文本使用 `role="alert"` 并通过 `aria-describedby` 关联。

## 响应式布局

组件使用 Tailwind CSS v4 容器查询，判断控件自身宽度而非 viewport：

- 窄布局使用两列：开始输入跨两列，结束输入和图标位于第二行。
- 日期模式容器达到 `25rem` 后切换为开始、结束、图标三列。
- 日期时间格式在 `25rem` 容器内仍可完整显示，日期和日期时间模式均在容器达到 `25rem` 后切换为三列。
- 输入列使用 `minmax(0, 1fr)`，避免撑破 `FilterPanel`。

## 日历与时间联动

- 日历第一次选择日期时更新开始草稿并清空结束草稿，不提交未完成区间。
- 日历完成区间时更新两个规范值；仅日期模式自动关闭 Popover。
- 日期时间模式保留 Popover，允许继续设置两端时间。
- 重新选择日期时优先保留当前合法时间，没有时间时使用开始、结束默认值。
- 修改时间后重新校验区间顺序，逆序时保留草稿并展示错误，不提交。

## 影响范围

- `src/components/common/filter-panel.tsx`
- `src/components/common/date-time/*`
- `src/tests/date-time-range.test.ts`
- `spec/40-components/common/filter-panel.md`

无需修改后端接口、业务筛选状态和现有 `dateRange` 调用方。

## 验证

- 纯函数测试覆盖紧凑输入、分隔符输入、闰年、非法日期、默认时间和区间比较。
- `npm run typecheck`
- `npm run lint`
- `npm run build`
