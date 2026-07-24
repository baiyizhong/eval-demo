# FilterPanel 组件使用规范

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

`FilterPanel` 是一个受控筛选面板组件。它负责渲染筛选 UI、分组折叠、面板内快速检索、清空筛选、字段变更事件统一回调；它不负责保存业务筛选状态。

业务筛选数据必须由外部通过 `value` 传入，并通过 `onChange` 回填。

面板顶部的搜索框只用于按 `label` 快速定位筛选分组、字段或选项，不会写入 `value`，也不是提交字段。

## 导入

```tsx
import {
  FilterPanel,
  type FilterGroup,
  type FilterRendererMap,
  type FilterValues,
} from "@/components/common/filter-panel";
```

## Props

```ts
type FilterPanelProps = {
  groups: FilterGroup[];
  value: FilterValues;
  onChange: (nextValue: FilterValues, meta: FilterChangeMeta) => void;
  renderers?: FilterRendererMap;
  title?: string;
  searchPlaceholder?: string;
  width?: number | string;
  maxHeight?: number | string;
  collapsed?: boolean;
  defaultOpenGroupIds?: string[];
  className?: string;
};
```

字段说明：

- `groups`：外部传入的筛选分组配置，决定面板渲染哪些内容。
- `value`：当前筛选值，必须是受控数据源。
- `onChange`：任意字段变化或清空时触发，返回完整的下一份 `FilterValues`。
- `renderers`：外部注册的可复用字段渲染器，用于支持非内置 `field.type`。
- `title`：面板标题，默认是 `筛选`。
- `searchPlaceholder`：面板内快速检索输入框占位文案，默认是 `搜索筛选项...`。
- `width`：面板宽度。数字按 px 处理，例如 `360` 等于 `360px`；字符串按 CSS width 处理，例如 `"100%"`、`"24rem"`。不传时默认宽度为 `300px`。
- `maxHeight`：面板最大高度。数字按 px 处理，例如 `640` 等于 `640px`；字符串按 CSS max-height 处理，例如 `"70vh"`、`"calc(100vh - 120px)"`。不传时默认是 `calc(100vh - 160px)`。
- `collapsed`：外部控制面板是否收起。传 `true` 时面板从当前宽度向左收缩到 `0px` 并不可见；默认是 `false`。
- `defaultOpenGroupIds`：初始展开的分组 id。未传时使用每个 group 的 `defaultOpen`。
- `className`：追加到根容器的样式类。

## 尺寸与滚动

面板默认宽度为 `280px`。调用方需要更宽或响应式布局时，使用 `width` prop，不要依赖覆盖内部默认宽度类名。

面板根容器内置 `overflow-y-auto`，当内容高度超过 `maxHeight` 时会出现纵向滚动条；横向溢出会被隐藏。默认 `maxHeight` 为 `calc(100vh - 160px)`，适合放在页面主体区域左侧。

组件内部控件圆角与项目普通 `Button` 保持一致，统一使用 `rounded-md`。如果业务方通过 `className` 扩展样式，应避免把内部控件改回更大的圆角，以免与项目基础控件风格不一致。

## 折叠行为

面板不会自行处理折叠状态，顶部 Filter 图标只作为视觉标识，不绑定点击折叠行为。调用方需要通过 `collapsed` 控制是否收起。

当 `collapsed` 为 `true` 时，面板宽度动画到 `0px`，边框透明、内容透明，并禁用鼠标交互，视觉上从右往左收起直到消失。

折叠只影响 UI 展示，不会清空 `value`，也不会重置分组展开状态、搜索关键字或日期区间草稿。

## 数据结构

### FilterValues

```ts
type FilterValues = Record<string, unknown>;
```

`FilterValues` 使用扁平结构。每个 `field.id` 就是提交字段名，也是 `value` 的 key。

```ts
const value = {
  resourceName: "button",
  category: ["components"],
  priceRange: [0, 500],
};
```

不要把 `group.id` 放进提交结构中。`group.id` 只用于 UI 分组和 `onChange` 的 meta。

### FilterChangeMeta

```ts
type FilterChangeMeta = {
  groupId: string;
  fieldId: string;
  fieldType: string;
  action: string;
};
```

常见 `action`：

- `input`：文本输入变化。
- `toggle`：checkbox 或 tags 切换。
- `range`：数值范围变化。
- `date`：单日期变化。
- `dateRange`：日期区间变化。
- `custom`：自定义字段或外部 renderer 触发。
- `clear`：清空单字段或清空全部。

清空全部时，当前实现会回调：

```ts
{
  groupId: "*",
  fieldId: "*",
  fieldType: "*",
  action: "clear",
}
```

## 分组配置

```ts
type FilterGroup = {
  id: string;
  label: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  fields: FilterField[];
};
```

规则：

- `id`：分组唯一标识。
- `label`：分组标题，也会被面板内搜索框匹配。
- `icon`：可选图标。
- `defaultOpen`：未传 `defaultOpenGroupIds` 时决定初始展开。
- `fields`：该分组下的字段配置。

当一个折叠分组内存在有效筛选值时，分组标题右侧会显示激活数量 badge。

## 字段公共属性

所有字段共享以下属性：

```ts
type BaseFilterField = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  emptyValue?: unknown;
};
```

规则：

- `id` 必须全局唯一，并作为提交字段名。
- `label` 用于字段显示，也会被面板内搜索框匹配。
- `description` 可选，会显示在字段标题下方，也会被搜索匹配。
- `disabled` 禁用该字段。
- `emptyValue` 自定义清空值，常用于 `custom` 或外部 renderer。

## 内置字段类型

### input

文本输入。

```ts
{
  id: "resourceName",
  type: "input",
  label: "资源名称",
  placeholder: "输入资源名称"
}
```

值格式：

```ts
resourceName: string;
```

清空值：`""`。

### checkbox

多选 checkbox 列表。

```ts
{
  id: "category",
  type: "checkbox",
  label: "分类",
  options: [
    { label: "区块", value: "blocks", count: 3 },
    { label: "组件", value: "components", count: 8, disabled: false }
  ]
}
```

值格式：

```ts
category: string[]
```

清空值：`[]`。

`options[].label` 会被面板内搜索框匹配。

### range

数值范围滑块。

```ts
{
  id: "priceRange",
  type: "range",
  label: "价格区间",
  min: 0,
  max: 1000,
  step: 50,
  defaultValue: [0, 1000],
  formatValue: (value) => `¥${value}`
}
```

值格式：

```ts
priceRange: [number, number];
```

清空值：

- 优先使用 `defaultValue`。
- 未配置 `defaultValue` 时使用 `[min, max]`。

### tags

预设标签多选。

```ts
{
  id: "labels",
  type: "tags",
  label: "技术标签",
  options: [
    { label: "React", value: "react" },
    { label: "Radix UI", value: "radix" }
  ]
}
```

值格式：

```ts
labels: string[]
```

清空值：`[]`。

`tags` 不支持自由输入标签，只支持配置中的预设选项。

### date

单日期选择。

```ts
{
  id: "publishedAt",
  type: "date",
  label: "发布日期",
  placeholder: "选择日期"
}
```

值格式：

```ts
publishedAt: "YYYY-MM-DD" | "";
```

清空值：`""`。

#### date 开启时间选择

```ts
{
  id: "reviewedAt",
  type: "date",
  label: "审核时间",
  placeholder: "选择日期和时间",
  showTime: true,
  timeStep: 60,
  timeFormat: "HH:mm"
}
```

值格式：

```ts
reviewedAt: "YYYY-MM-DD HH:mm" | "";
```

如果 `timeFormat` 是 `"HH:mm:ss"`，值格式为：

```ts
reviewedAt: "YYYY-MM-DD HH:mm:ss" | "";
```

默认时间为 `00:00` 或 `00:00:00`。

### dateRange

日期区间选择。

```ts
{
  id: "activeWindow",
  type: "dateRange",
  label: "有效期",
  placeholder: "选择日期区间"
}
```

值格式：

```ts
activeWindow: ["YYYY-MM-DD", "YYYY-MM-DD"] | [];
```

清空值：`[]`。

#### dateRange 开启时间选择

```ts
{
  id: "campaignWindow",
  type: "dateRange",
  label: "活动周期",
  placeholder: "选择日期时间区间",
  showTime: true,
  timeStep: 300,
  timeFormat: "HH:mm:ss"
}
```

值格式：

```ts
campaignWindow: ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD HH:mm:ss"] | [];
```

默认开始时间为 `00:00` 或 `00:00:00`，默认结束时间为 `23:59` 或 `23:59:59`。

#### dateRange 手工输入与响应式布局

`dateRange` 渲染为开始输入框、结束输入框和日历图标。宽度不足时，开始输入框位于第一行，结束输入框和日历图标换到第二行；宽度足够时三者位于同一行。布局基于组件容器宽度，不依赖页面 viewport。

开始和结束输入框默认支持清除操作；有值且组件未禁用时，输入框末尾展示独立的清除按钮。点击清除按钮只清空对应一端，另一端合法时以空字符串占位并保留；两端均为空时提交 `[]`。直接使用 `DateTimeRangePicker` 时可配置 `clearable={false}` 隐藏清除操作。

输入框支持手工编辑和粘贴，失焦或按 Enter 后自动格式化：

- `showTime` 未开启时格式化为 `YYYY-MM-DD`。
- `showTime: true` 且 `timeFormat: "HH:mm"` 时格式化为 `YYYY-MM-DD HH:mm`。
- `showTime: true` 且 `timeFormat: "HH:mm:ss"` 时格式化为 `YYYY-MM-DD HH:mm:ss`。
- 支持 `YYYYMMDD`、`YYYY-M-D`、`YYYY/M/D` 等日期输入；日期时间还支持对应的紧凑数字格式。
- 日期时间模式只输入日期时，开始端使用当天 `00:00`，结束端使用当天 `23:59`；秒格式补齐对应秒数。

组件会校验日期是否真实存在、时间是否有效以及开始值是否晚于结束值。校验失败时保留输入草稿并展示错误，不向 `FilterPanel.onChange` 提交非法值。两端都有值时校验区间顺序；单边清空时提交 `[start, ""]` 或 `["", end]`，两端均为空时提交 `[]`。日历区间尚未选择完成时不触发变更。

可选占位配置：

```ts
{
  startPlaceholder: "开始日期",
  endPlaceholder: "结束日期"
}
```

### custom

单次自定义渲染字段。适合只在当前场景使用的特殊 UI。

```tsx
{
  id: "featuredOnly",
  type: "custom",
  label: "精选内容",
  emptyValue: false,
  render: ({ value, setValue }) => (
    <label>
      <span>只看精选</span>
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => setValue(event.target.checked, "custom")}
      />
    </label>
  )
}
```

要求：

- 必须通过 `setValue(nextValue, action?)` 回填。
- 不要直接修改外部 state。
- 建议提供 `emptyValue`，否则清空时该字段会变成 `undefined`。

## 外部 Renderer 扩展

对于可复用的新字段类型，不要修改 `FilterPanel` 核心组件，优先通过 `renderers` 注册。

```tsx
const renderers: FilterRendererMap = {
  rating: ({ value, setValue }) => {
    const rating = typeof value === "number" ? value : 0;

    return (
      <div>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => setValue(score, "custom")}
          >
            {score <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>
    );
  },
};
```

字段配置：

```ts
{
  id: "rating",
  type: "rating",
  label: "评分",
  emptyValue: 0
}
```

使用：

```tsx
<FilterPanel
  groups={groups}
  value={filters}
  onChange={setFilters}
  renderers={renderers}
/>
```

外部 renderer 的 `type` 不能与内置类型冲突。内置类型包括：

```ts
"input" | "checkbox" | "range" | "tags" | "date" | "dateRange" | "custom";
```

## Renderer Context

`custom.render` 和外部 renderer 都会收到同一类上下文：

```ts
type FilterRendererContext = {
  group: FilterGroup;
  field: FilterField;
  value: unknown;
  values: FilterValues;
  setValue: (nextValue: unknown, action?: string) => void;
  clearValue: () => void;
};
```

说明：

- `group`：当前字段所属分组。
- `field`：当前字段配置。
- `value`：当前字段值，即 `values[field.id]`。
- `values`：完整筛选值。
- `setValue`：统一回填入口，会触发 `onChange`。
- `clearValue`：清空当前字段。

## 面板内搜索行为

`FilterPanel` 顶部内置搜索框用于快速定位筛选配置，不参与提交。

匹配范围：

- `group.label`
- `field.label`
- `field.description`
- `checkbox.options[].label`
- `tags.options[].label`

搜索命中分组标题时，会展示该分组下全部字段。搜索只命中字段或选项时，只展示命中的字段。

## 清空行为

点击面板右上角 `清空` 会遍历所有 `groups.fields`，按字段类型生成清空值：

- `input` -> `""`
- `date` -> `""`
- `checkbox` -> `[]`
- `tags` -> `[]`
- `dateRange` -> `[]`
- `range` -> `defaultValue` 或 `[min, max]`
- `custom` / 外部 renderer -> `emptyValue`，未配置时为 `undefined`

如果字段配置了 `emptyValue`，优先使用 `emptyValue`。

## 完整示例

```tsx
import { useMemo, useState } from "react";
import {
  FilterPanel,
  type FilterGroup,
  type FilterRendererMap,
  type FilterValues,
} from "@/components/common/filter-panel";

const initialFilters: FilterValues = {
  resourceName: "",
  category: [],
  priceRange: [0, 1000],
  labels: [],
  publishedAt: "",
  activeWindow: [],
  reviewedAt: "",
  campaignWindow: [],
  featuredOnly: false,
  rating: 0,
};

export function Example() {
  const [filters, setFilters] = useState<FilterValues>(initialFilters);

  const groups = useMemo<FilterGroup[]>(
    () => [
      {
        id: "resource",
        label: "资源属性",
        defaultOpen: true,
        fields: [
          {
            id: "resourceName",
            type: "input",
            label: "资源名称",
            placeholder: "输入提交用资源名称",
          },
          {
            id: "category",
            type: "checkbox",
            label: "分类",
            options: [
              { label: "区块", value: "blocks", count: 3 },
              { label: "组件", value: "components", count: 8 },
            ],
          },
          {
            id: "priceRange",
            type: "range",
            label: "价格区间",
            min: 0,
            max: 1000,
            step: 50,
            defaultValue: [0, 1000],
          },
        ],
      },
      {
        id: "date",
        label: "日期",
        fields: [
          {
            id: "publishedAt",
            type: "date",
            label: "发布日期",
          },
          {
            id: "activeWindow",
            type: "dateRange",
            label: "有效期",
          },
          {
            id: "reviewedAt",
            type: "date",
            label: "审核时间",
            showTime: true,
          },
          {
            id: "campaignWindow",
            type: "dateRange",
            label: "活动周期",
            showTime: true,
            timeFormat: "HH:mm:ss",
          },
        ],
      },
      {
        id: "advanced",
        label: "高级",
        fields: [
          {
            id: "featuredOnly",
            type: "custom",
            label: "精选内容",
            emptyValue: false,
            render: ({ value, setValue }) => (
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => setValue(event.target.checked, "custom")}
                />
                只看精选
              </label>
            ),
          },
          {
            id: "rating",
            type: "rating",
            label: "评分",
            emptyValue: 0,
          },
        ],
      },
    ],
    [],
  );

  const renderers = useMemo<FilterRendererMap>(
    () => ({
      rating: ({ value, setValue }) => (
        <button type="button" onClick={() => setValue(5, "custom")}>
          当前评分：{typeof value === "number" ? value : 0}
        </button>
      ),
    }),
    [],
  );

  return (
    <FilterPanel
      title="筛选"
      groups={groups}
      value={filters}
      onChange={setFilters}
      renderers={renderers}
      searchPlaceholder="搜索分组、字段或选项..."
      width={360}
      maxHeight="70vh"
    />
  );
}
```

## 大模型生成代码时的约束

- 必须把 `FilterPanel` 当作受控组件使用。
- 必须保证 `field.id` 全局唯一，并作为提交字段名。
- 不要把面板顶部搜索框当作业务筛选字段。
- 需要改变面板宽度时，优先使用 `width` prop，而不是依赖覆盖内部默认宽度类名。
- 需要限制面板高度或适配页面布局时，优先使用 `maxHeight` prop；内容超出后由面板内部纵向滚动承载。
- 内部筛选控件圆角应与普通 `Button` 保持一致，避免通过覆盖样式改成更大的圆角。
- 新增可复用字段类型时，优先使用 `renderers`，不要直接改 `FilterPanel`。
- `custom` 和外部 renderer 必须通过 `setValue` 或 `clearValue` 回填。
- 日期值不要使用 `Date` 对象提交，使用组件约定的字符串格式。
- `dateRange` 必须使用数组，空值必须是 `[]`。
- `range` 必须使用 `[number, number]`。
- 清空逻辑依赖 `emptyValue`，外部 renderer 建议总是配置 `emptyValue`。
