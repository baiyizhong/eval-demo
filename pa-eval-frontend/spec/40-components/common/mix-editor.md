# MixEditor 组件使用规范

`MixEditor` 是一个混合内容查看与编辑组件，用于展示、复制、搜索和编辑 JSON、字符串、Markdown 等内容。组件会先规范化输入值，再根据内容类型和当前视图选择合适的展示方式。

- 对象 / 数组：支持 JSON 树视图、格式化表格视图、关键字搜索和编辑校验
- JSON 字符串：会尝试深度解析为结构化 JSON 后展示
- Markdown 字符串：支持 Markdown 预览，并在复制时保留 Markdown 原文
- 普通字符串：按文本内容展示和编辑
- 强制文本模式：可通过 `forceTextMode` 跳过 JSON / Markdown 自动识别
- 编辑态：统一使用 `CodeMirrorEditor`

## 引入方式

```tsx
import { MixEditor, type MixEditorView } from '@/components/common/MixEditor';
```

## 参数列表

```ts
export type MixEditorProps = {
  value?: unknown;
  defaultValue?: unknown;
  onValueChange?: (value: unknown) => void;
  title?: string;
  view?: MixEditorView;
  defaultView?: MixEditorView;
  onViewChange?: (view: MixEditorView) => void;
  readOnly?: boolean;
  defaultEditing?: boolean;
  showEditButton?: boolean;
  showEditActions?: boolean;
  forceTextMode?: boolean;
  jsonCollapsedDepth?: number;
  className?: string;
  editorClassName?: string;
  editorMinHeight?: number | string;
  editorMaxHeight?: number | string;
};
```

### value

类型：`unknown`

默认值：`undefined`

受控模式下的内容值。组件实际使用 `value ?? internalValue` 作为当前值，因此传入 `null` 时会回退到内部状态。

当 `value` 是字符串时，组件会通过 `parseMixEditorJson` 尝试深度解析 JSON：

- JSON 字符串会被解析成对象、数组、数字、布尔值或 `null`
- 解析最多处理约 `500_000` 字符、深度为 `2`
- 非 JSON 字符串会保持字符串
- 非字符串值会原样使用

如果传入 `forceTextMode`，组件会跳过上述自动解析逻辑，并把内容按文本处理。

```tsx
<MixEditor value={{ id: 1, name: 'demo' }} />
<MixEditor value='{"id":1,"name":"demo"}' />
```

### defaultValue

类型：`unknown`

默认值：`null`

非受控模式下的初始内容值。当没有传入 `value` 时，组件内部会维护内容状态。

```tsx
<MixEditor defaultValue={{ status: 'draft' }} />
```

### onValueChange

类型：`(value: unknown) => void`

默认值：`undefined`

编辑保存成功后触发。如果传入了 `value`，组件不会自行更新外部状态，需要调用方在 `onValueChange` 中同步更新。

```tsx
const [value, setValue] = useState<unknown>({ enabled: true });

<MixEditor
  value={value}
  onValueChange={setValue}
/>;
```

保存时的解析规则：

- 当前值是对象 / 数组时，草稿必须是合法 JSON，否则保存按钮禁用并显示错误文案
- 非结构化内容保存空白字符串时会得到 `''`
- 非结构化内容看起来像 JSON、数字、布尔值或 `null` 时，会尝试 `JSON.parse`
- 解析失败时保留原始字符串
- `forceTextMode` 为 `true` 时，保存结果始终是字符串，不会尝试 `JSON.parse`

### title

类型：`string`

默认值：`undefined`

组件顶部标题。未传入时只显示复制按钮和右侧操作区。

```tsx
<MixEditor title="请求参数" value={value} />
```

### view

类型：`MixEditorView`

默认值：`undefined`

受控模式下的当前视图。

```ts
type MixEditorView = 'pretty' | 'json';
```

- `json`：JSON 树视图或文本视图
- `pretty`：格式化视图，结构化 JSON 展示为表格并默认展开第一层，Markdown 展示为预览

```tsx
const [view, setView] = useState<MixEditorView>('json');

<MixEditor
  value={value}
  view={view}
  onViewChange={setView}
/>;
```

### defaultView

类型：`MixEditorView`

默认值：`undefined`

非受控模式下的初始视图。未传入时，结构化对象 / 数组默认使用 `pretty`，其他内容默认使用 `json`。

```tsx
<MixEditor value={value} defaultView="pretty" />;
```

### onViewChange

类型：`(view: MixEditorView) => void`

默认值：`undefined`

用户点击 `JSON` / `Text` 或 `格式化` 按钮切换视图时触发。

```tsx
<MixEditor
  value={value}
  onViewChange={(view) => {
    console.log('current view:', view);
  }}
/>;
```

### readOnly

类型：`boolean`

默认值：`false`

是否只读。为 `true` 时不展示编辑按钮，但仍可复制、搜索、切换视图、展开 / 折叠 JSON。

```tsx
<MixEditor value={value} readOnly />
```

### defaultEditing

类型：`boolean`

默认值：`false`

是否默认进入编辑态。为 `true` 时，组件首次渲染就显示编辑器，并使用当前内容初始化草稿。

如果同时设置 `readOnly={true}`，`defaultEditing` 不生效。

```tsx
<MixEditor
  value={value}
  defaultEditing
/>
```

### showEditButton

类型：`boolean`

默认值：`true`

是否展示编辑按钮。只有在 `readOnly={false}` 时生效。

```tsx
<MixEditor value={value} showEditButton={false} />
```

### showEditActions

类型：`boolean`

默认值：`true`

编辑态下是否展示“保存”和“取消”按钮。

- `true`：编辑完成后点击“保存”才触发 `onValueChange`，点击“取消”丢弃草稿。
- `false`：隐藏“保存”和“取消”按钮，进入联动模式；用户修改草稿后，组件会在内部防抖后自动触发 `onValueChange`。

联动模式使用组件内置防抖时间 `300ms`，不会暴露额外 props。草稿校验失败时不会触发 `onValueChange`。

```tsx
<MixEditor
  value={value}
  onValueChange={setValue}
  showEditActions={false}
/>
```

### forceTextMode

类型：`boolean`

默认值：`false`

是否强制按文本模式处理内容。为 `true` 时，组件不会自动解析 JSON 字符串，也不会识别 Markdown；对象 / 数组会先通过 `JSON.stringify(value ?? null, null, 2)` 转成文本展示。

编辑保存时也会保持文本语义：即使草稿内容看起来像 JSON、数字、布尔值或 `null`，`onValueChange` 收到的仍是字符串。

```tsx
const jsonString = '{"id":1,"name":"demo"}';

<MixEditor
  title="原始文本"
  value={jsonString}
  forceTextMode
/>;
```

### jsonCollapsedDepth

类型：`number`

默认值：`1`

传给 `JSONView` 的折叠深度。JSON 模式默认展开；用户点击折叠按钮后，组件会按该深度折叠内容。

当组件处于非编辑态、内容是结构化对象 / 数组，并且当前视图是 `json` 时，会显示展开 / 折叠按钮。

```tsx
<MixEditor value={value} jsonCollapsedDepth={2} />
```

### className

类型：`string`

默认值：`undefined`

传给组件根节点 `section` 的 `className`。

```tsx
<MixEditor value={value} className="rounded-md border p-4" />
```

### editorClassName

类型：`string`

默认值：`undefined`

传给编辑态 `CodeMirrorEditor` 的 `className`。组件会默认追加 `rounded-none border-0`。

```tsx
<MixEditor value={value} editorClassName="text-sm" />
```

### editorMinHeight

类型：`number | string`

默认值：`260`

内容区域的最小高度，同时传给编辑态的 `CodeMirrorEditor`。该参数在 JSON、格式化、Markdown、文本浏览态以及编辑态均生效。

```tsx
<MixEditor value={value} editorMinHeight={300} />
<MixEditor value={value} editorMinHeight="40vh" />
```

### editorMaxHeight

类型：`number | string`

默认值：`520`

编辑器最大高度。

```tsx
<MixEditor value={value} editorMaxHeight={720} />
```

## 使用示例

### 基础用法

```tsx
const [value, setValue] = useState<unknown>({
  name: 'MixEditor',
  enabled: true,
});

<MixEditor
  title="配置内容"
  value={value}
  onValueChange={setValue}
/>;
```

### 受控用法

```tsx
const [value, setValue] = useState<unknown>({
  app: 'MixEditor',
  enabled: true,
});

<MixEditor
  title="受控内容"
  value={value}
  onValueChange={setValue}
/>;
```

### 非受控用法

```tsx
<MixEditor
  title="非受控内容"
  defaultValue={{
    app: 'MixEditor',
    enabled: true,
  }}
/>;
```

### 控制视图状态

```tsx
const [view, setView] = useState<MixEditorView>('json');

<MixEditor
  value={value}
  view={view}
  onViewChange={setView}
/>;
```

### 联动编辑模式

```tsx
const [value, setValue] = useState<unknown>({
  enabled: true,
  threshold: 0.8,
});

<MixEditor
  title="联动配置"
  value={value}
  onValueChange={setValue}
  showEditActions={false}
/>;
```

进入编辑态后不会显示“保存”和“取消”。用户修改内容时，如果草稿校验通过，组件会在内部防抖后调用 `onValueChange`。

### 默认编辑模式

```tsx
<MixEditor
  title="默认编辑"
  value={value}
  onValueChange={setValue}
  defaultEditing
/>
```

如果需要打开后直接进入联动编辑，可同时使用：

```tsx
<MixEditor
  title="默认联动编辑"
  value={value}
  onValueChange={setValue}
  defaultEditing
  showEditActions={false}
/>
```

### Markdown 预览

```tsx
const markdown = `# 标题

这里是 **Markdown** 内容。

- 列表项 1
- 列表项 2
`;

<MixEditor
  title="Markdown 预览"
  value={markdown}
  defaultView="pretty"
/>;
```

### JSON 字符串

```tsx
const jsonString = JSON.stringify(
  {
    source: 'stringified json',
    enabled: true,
  },
  null,
  2,
);

<MixEditor
  title="JSON 字符串"
  value={jsonString}
  onValueChange={(nextValue) => {
    console.log(nextValue);
  }}
/>;
```

### 强制文本模式

```tsx
const rawPayload = JSON.stringify(
  {
    source: 'raw text',
    enabled: true,
  },
  null,
  2,
);

<MixEditor
  title="原始 Payload"
  value={rawPayload}
  forceTextMode
  onValueChange={(nextValue) => {
    console.log(typeof nextValue, nextValue);
  }}
/>;
```

### 搜索结构化 JSON

```tsx
<MixEditor
  title="可搜索 JSON"
  defaultValue={{
    users: [
      { id: 1, name: 'Alice', role: 'admin' },
      { id: 2, name: 'Bob', role: 'viewer' },
    ],
  }}
/>;
```

## 展示规则

### JSON / Text 视图

当前视图为 `json` 时，组件使用 `JSONView` 展示内容。按钮文案会根据内容类型显示为 `JSON` 或 `Text`：

- 对象 / 数组使用 JSON 模式
- 普通字符串使用文本模式
- 数字、布尔值、`null` 等值通过 `JSONView` 展示
- JSON 字符串会先尝试解析，再按解析后的类型展示
- `forceTextMode` 为 `true` 时，内容固定按文本模式展示

结构化对象 / 数组在该视图下支持展开 / 折叠全部。

### Pretty 视图

当前视图为 `pretty` 时，组件会按内容类型选择展示方式：

- 结构化对象 / 数组：使用 `MixJsonTable`
- Markdown 字符串：使用 `MixMarkdownView`
- 仅包含一个字符串字段且该字段是 Markdown 的普通对象：预览该字段内容
- 普通字符串：不显示 `格式化` 按钮，只显示 `Text` 视图

当内容同时是结构化对象且可提取 Markdown 时，Markdown 预览优先于表格。

## 搜索行为

搜索只对结构化对象 / 数组生效，且 Markdown 内容不会展示搜索入口。

- 点击搜索按钮后会展开搜索框并自动聚焦
- 输入关键字后会按大小写不敏感方式匹配对象 key、字符串、数字、布尔值、`null`、`bigint`
- 数组会保留包含匹配内容的元素
- 对象会保留匹配 key，或递归保留包含匹配内容的子结构
- 没有匹配结果时显示“无匹配结果”
- 在搜索框内按 `Escape` 会关闭搜索框
- 点击“取消”会清空关键字并关闭搜索框

搜索结果会影响当前展示内容，但不会修改原始值，也不会影响复制内容。

## 复制行为

点击左侧复制按钮时：

- Markdown 内容复制 Markdown 原文
- 其他内容复制 `stringifyForEditor` 的结果
- 对象 / 数组会使用 `JSON.stringify(value ?? null, null, 2)`
- 字符串会复制原字符串
- 复制成功后按钮状态短暂显示“已复制”
- 复制失败时通过无障碍 live region 提示“复制失败”

## 编辑行为

点击“编辑”后进入编辑态：

- 对象 / 数组会格式化为 JSON 字符串
- 字符串按原文展示
- 非字符串值会通过 `JSON.stringify(value ?? null, null, 2)` 转为草稿
- `forceTextMode` 为 `true` 时，草稿按文本保存，保存值始终是字符串
- 编辑器模式根据内容类型自动选择：
  - 结构化对象 / 数组：`json`
  - 其他内容：`text`

编辑态下只显示“保存”和“取消”按钮。

如果设置 `showEditActions={false}`，编辑态下不显示“保存”和“取消”，并启用联动模式：

- 用户每次修改草稿后，组件会使用内置 `300ms` 防抖触发 `onValueChange`
- 草稿校验失败时不触发 `onValueChange`
- 进入编辑态时初始化草稿不会触发 `onValueChange`
- 同一份草稿不会因为受控值回写而重复触发 `onValueChange`

点击“保存”后：

- 如果草稿校验通过，调用 `onValueChange`
- 非受控模式下同时更新组件内部状态
- 保存成功后退出编辑态

点击“取消”后：

- 丢弃当前草稿
- 退出编辑态
- 不触发 `onValueChange`

## 注意事项

1. `value` 使用 `value ?? internalValue` 解析，因此传入 `null` 时会回退到内部值；如果需要明确展示 `null`，需要先调整组件实现。
2. 字符串默认会尝试深度 JSON 解析，JSON 字符串可能会被解析成对象或数组；需要保留原始文本时使用 `forceTextMode`。
3. `readOnly` 只隐藏编辑入口，不影响复制、搜索和视图切换。
4. `defaultEditing` 只影响首次渲染的初始状态，不是受控编辑态；如果需要运行时控制编辑态，需要扩展受控 API。
5. `showEditButton={false}` 只隐藏编辑按钮，不代表只读语义。
6. `showEditActions={false}` 会隐藏编辑态保存 / 取消按钮，并启用防抖联动变更，不代表只读语义。
7. `pretty` 视图不一定总是表格：Markdown 会进入 Markdown 预览，结构化对象 / 数组会进入表格，普通字符串不会出现 `格式化` 按钮。
8. 搜索过滤只影响屏幕展示；复制仍基于完整的解析值。
9. 结构化对象 / 数组编辑时必须提交合法 JSON，保存按钮才可点击；`forceTextMode` 下不做 JSON 语法校验。
