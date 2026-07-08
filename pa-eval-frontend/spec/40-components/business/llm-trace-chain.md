# LLMTraceChain 组件使用文档

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

`LLMTraceChain` 是一个侧边面板组件，用于展示 LLM/Agent 执行链路。组件支持树形 Trace、时间线视图，以及基于 observation 的 Graph 视图。它适合展示：

- Agent 调用链路
- LLM 请求与响应
- Tool 调用
- RAG 检索链路
- Prompt、Memory、Guardrail、Eval 等中间步骤
- 每个节点的耗时、费用、Token 和标签

组件内置搜索、节点展开/折叠、叶子节点隐藏、元信息开关、图例、树/时间线/图视图切换、面板拖拽改宽、面板折叠和导出回调。

## 导入方式

```tsx
import {
  LLMTraceChain,
  type TreeNode,
  type GraphObservation,
} from "@/components/business/llm-trace-chain";
```

如需使用默认导出：

```tsx
import LLMTraceChain from "@/components/business/llm-trace-chain";
```

## 最小可用示例

```tsx
import { LLMTraceChain, type TreeNode } from "@/components/business/llm-trace-chain";

const traceData: TreeNode[] = [
  {
    id: "root",
    type: "ingress",
    title: "ingress CustomerSupportAgent/run",
    duration: "3.42s",
    cost: "$0.002100",
    children: [
      {
        id: "agent-1",
        type: "agent",
        title: "CustomerSupportAgent",
        duration: "3.40s",
        children: [
          {
            id: "run-1",
            type: "run",
            title: "run (call LLM)",
            duration: "2.81s",
          },
          {
            id: "response-1",
            type: "response",
            title: "response",
            duration: "2.81s",
            tokensIn: 320,
            tokensOut: 96,
            tokensTotal: 416,
            cost: "$0.001800",
          },
        ],
      },
    ],
  },
];

export function TracePanel() {
  return (
    <LLMTraceChain
      data={traceData}
      width={640}
      summary={{
        duration: "3.42s",
        cost: "$0.002100",
        tokens: "Σ 416",
      }}
    />
  );
}
```

## TreeNode 数据结构

`data` 是 `TreeNode[]`，每个节点描述一次链路步骤。

```ts
interface TreeNode {
  id: string;
  type: NodeType;
  title: string;
  duration?: string;
  startTime?: number | string;
  endTime?: number | string;
  cost?: string;
  tokensIn?: number;
  tokensOut?: number;
  tokensTotal?: number;
  tags?: string[];
  children?: TreeNode[];
}
```

字段说明：

| 字段          | 必填 | 说明                                                                  |
| ------------- | ---- | --------------------------------------------------------------------- |
| `id`          | 是   | 节点唯一 ID。建议全树唯一，作为 React key 使用。                      |
| `type`        | 是   | 节点类型，用于决定图标、颜色和图例。                                  |
| `title`       | 是   | 节点显示名称。会被单行截断。                                          |
| `duration`    | 否   | 耗时字符串，例如 `"1.58s"`、`"0.03s"`。大于等于 `1.0s` 会用橙色强调。 |
| `startTime`   | 否   | 开始时间。时间线视图会优先用它计算节点起点；支持数字、数字字符串或可解析日期字符串。 |
| `endTime`     | 否   | 结束时间。时间线视图会优先用它计算节点终点；缺省时使用 `startTime + duration`。 |
| `cost`        | 否   | 费用字符串，例如 `"$0.001804"`。                                      |
| `tokensIn`    | 否   | 输入 Token 数。                                                       |
| `tokensOut`   | 否   | 输出 Token 数。                                                       |
| `tokensTotal` | 否   | 总 Token 数。                                                         |
| `tags`        | 否   | 节点标签，会显示在节点下方，也会参与搜索。                            |
| `children`    | 否   | 子节点数组，用于表达调用层级。                                        |

注意：如果要展示 Token 元数据，至少应提供 `tokensIn`。组件当前仅在 `tokensIn !== undefined` 时显示 token 行，展示格式为 `tokensIn → tokensOut (Σ tokensTotal)`。

注意：时间线视图依赖 `startTime`、`endTime` 或 `duration` 计算条块位置。若没有 `startTime`，节点从 `0s` 开始；若没有 `endTime`，会尝试用 `duration` 推导结束时间。

## Graph 数据结构

`graph` 用于 Graph 视图，可以直接传入 `GraphObservation[]`，也可以传入 Langfuse API 常见包装结构 `TraceGraphResponse`。

```ts
interface GraphObservation {
  id: string;
  node?: string;
  step?: number;
  parentObservationId?: string | null;
  name: string;
  startTime?: string;
  endTime?: string;
  observationType: string;
}

interface TraceGraphResponse {
  result?: {
    data?: {
      json?: GraphObservation[];
    };
  };
}

type TraceGraphInput = GraphObservation[] | TraceGraphResponse;
```

Graph 视图会根据 `parentObservationId` 建立父子边，并根据 `startTime`/`endTime` 推导可连接的顺序边。点击 Graph 节点时，组件会把 `GraphObservation` 转换为临时 `TreeNode` 后触发 `onNodeClick`：

- `id` 使用 observation `id`。
- `type` 使用 `observationType.toLowerCase()`。
- `title` 使用 `name`。
- `duration` 由 `startTime` 和 `endTime` 计算。
- `tags` 包含原始 `observationType`。

## 内置节点类型

组件内置以下 `type`，大模型生成数据时应优先使用这些值：

| 类型        | 使用场景                                             |
| ----------- | ---------------------------------------------------- |
| `ingress`   | Trace 入口、外部请求进入系统。                       |
| `invoke`    | 发起一次函数、链路或 Agent 调用。                    |
| `agent`     | Agent 节点。                                         |
| `run`       | 一次执行动作，例如调用 LLM、调用外部能力、执行步骤。 |
| `response`  | LLM 或 Agent 响应结果。                              |
| `tool`      | 工具调用。                                           |
| `embedding` | Embedding 请求。                                     |
| `retrieval` | 向量库、知识库或 RAG 检索。                          |
| `memory`    | 记忆读取或写入。                                     |
| `prompt`    | Prompt 模板渲染或拼装。                              |
| `router`    | 条件分支、路由、意图识别或决策。                     |
| `guard`     | 安全检查、输入输出过滤、Guardrail。                  |
| `eval`      | 评分、评估、质量检测。                               |
| `chain`     | 子链路、Pipeline 或复合步骤。                        |

可以传入自定义字符串作为 `type`。如果未配置样式，会使用默认图标和灰色样式。

## Props

```ts
interface LLMTraceChainProps {
  data?: TreeNode[];
  graph?: TraceGraphInput;
  nodeStyles?: Partial<Record<string, NodeStyle>>;
  width?: number | string;
  height?: number | string;
  collapsedWidth?: number | string;
  summary?: TraceSummary;
  enabledViewModes?: EnabledViewModes;
  isCollapsed?: boolean;
  onCollapsedChange?: (isCollapsed: boolean) => void;
  onWidthChange?: (width: number) => void;
  onExport?: (context: {
    data: TreeNode[];
    filteredData: TreeNode[];
    searchQuery: string;
    metadataVisibility: MetadataVisibility;
  }) => void;
  onNodeClick?: (
    node: TreeNode,
    context: {
      depth: number;
      hasChildren: boolean;
      isOpen: boolean;
      event: MouseEvent<HTMLDivElement> | globalThis.MouseEvent;
    },
  ) => void;
}

type TraceViewMode = "tree" | "timeline" | "graph";

type EnabledViewModes = Partial<Record<TraceViewMode, boolean>> & {
  /** @deprecated Use graph instead. */
  chain?: boolean;
};
```

### `data`

Trace 树数据。未传入时等同于空数组。

```tsx
<LLMTraceChain data={traceData} />
```

树视图和时间线视图使用 `data`。如果只传 `graph` 不传 `data`，树视图和时间线视图会显示空数据；调用方通常应同时传入树数据，或通过 `enabledViewModes` 关闭不需要的视图。

### `graph`

Graph 视图数据。未传入 `graph` 时，Graph 视图按钮不会显示，即使 `enabledViewModes.graph` 为 `true`。

```tsx
const graph: GraphObservation[] = [
  {
    id: "obs-root",
    name: "CustomerSupportAgent/run",
    observationType: "SPAN",
    startTime: "2026-07-08T10:00:00.000Z",
    endTime: "2026-07-08T10:00:03.420Z",
  },
  {
    id: "obs-generation",
    parentObservationId: "obs-root",
    name: "call LLM",
    observationType: "GENERATION",
    startTime: "2026-07-08T10:00:00.500Z",
    endTime: "2026-07-08T10:00:03.100Z",
  },
];

<LLMTraceChain data={traceData} graph={graph} />;
```

### `width`

面板展开时宽度。可以是数字或 CSS 尺寸字符串。数字会转换为 px。

```tsx
<LLMTraceChain width={640} />
<LLMTraceChain width="42rem" />
<LLMTraceChain width="100%" />
```

默认值：`"100%"`。

组件右侧内置拖拽改宽手柄。用户拖拽后，内部会用拖拽宽度覆盖 `width`；当 `width` prop 变化时，内部拖拽宽度会重置。

### `height`

面板高度。可以是数字或 CSS 尺寸字符串。数字会转换为 px。

```tsx
<LLMTraceChain height={520} />
<LLMTraceChain height="100%" />
```

默认值：`"100%"`。

### `collapsedWidth`

面板折叠时宽度。可以是数字或 CSS 尺寸字符串。

```tsx
<LLMTraceChain collapsedWidth={40} />
```

默认值：`40`。

### `enabledViewModes`

控制视图切换按钮。默认启用 `tree` 和 `timeline`；只有传入 `graph` 时才会启用 Graph 视图。

```tsx
<LLMTraceChain
  data={traceData}
  graph={graph}
  enabledViewModes={{
    tree: true,
    timeline: false,
    graph: true,
  }}
/>
```

字段说明：

| 字段       | 说明 |
| ---------- | ---- |
| `tree`     | 是否启用树视图。默认 `true`。 |
| `timeline` | 是否启用时间线视图。默认 `true`。 |
| `graph`    | 是否启用 Graph 视图。默认跟随 `graph` 是否传入。 |
| `chain`    | 兼容旧字段，已废弃；请使用 `graph`。 |

如果当前视图被禁用，组件会按 `tree`、`timeline`、`graph` 的顺序回退到第一个可用视图。

### `summary`

底部汇总信息。

```tsx
<LLMTraceChain
  summary={{
    duration: "8.54s",
    cost: "$0.006784",
    tokens: "Σ 798",
  }}
/>
```

只有对应元数据存在且元数据开关处于显示状态时，底部对应汇总才会显示。

### `isCollapsed` 和 `onCollapsedChange`

用于受控折叠状态。若不传 `isCollapsed`，组件内部自行管理折叠状态。

```tsx
const [collapsed, setCollapsed] = useState(false);

<LLMTraceChain isCollapsed={collapsed} onCollapsedChange={setCollapsed} />;
```

### `onWidthChange`

用户拖拽面板右侧改宽手柄时触发，参数是本次拖拽后的像素宽度。

```tsx
<LLMTraceChain
  width={panelWidth}
  onWidthChange={(nextWidth) => {
    setPanelWidth(nextWidth);
  }}
/>
```

### `onExport`

传入后，顶部工具栏会显示导出按钮。点击导出按钮时会回调当前数据和 UI 状态。

```tsx
<LLMTraceChain
  data={traceData}
  onExport={({ data, filteredData, searchQuery, metadataVisibility }) => {
    console.log({
      data,
      filteredData,
      searchQuery,
      metadataVisibility,
    });
  }}
/>
```

回调字段：

| 字段                 | 说明                               |
| -------------------- | ---------------------------------- |
| `data`               | 原始完整数据。                     |
| `filteredData`       | 按当前搜索词过滤后的树。           |
| `searchQuery`        | 当前搜索词。                       |
| `metadataVisibility` | 当前耗时、费用、Token 的有效显示状态。 |

`metadataVisibility` 是有效显示状态：如果用户数据中完全没有某类元信息，即使内部默认开关为开启，回调中该字段也会是 `false`。

### `onNodeClick`

点击树节点、时间线节点或 Graph 节点时触发。树视图中组件会先触发回调，再执行内部展开/折叠逻辑；时间线视图会同步选中节点；Graph 视图会把 observation 转成临时 `TreeNode` 后回调。

```tsx
<LLMTraceChain
  onNodeClick={(node, context) => {
    console.log(node.id, context.depth, context.hasChildren, context.isOpen);
  }}
/>
```

树视图和时间线视图中，`context.isOpen` 是点击发生前的展开状态；Graph 视图中固定为 `true`。Graph 视图触发的 `event` 来自 `vis-network`，类型可能是原生 `globalThis.MouseEvent`。

### `nodeStyles`

用于覆盖或新增节点类型样式。

```tsx
import { Sparkles } from "lucide-react";

<LLMTraceChain
  nodeStyles={{
    custom_llm: {
      icon: <Sparkles size={10} strokeWidth={2} />,
      textCls: "text-cyan-600",
      bgCls: "bg-cyan-50 ring-1 ring-cyan-200",
      label: "Custom LLM",
    },
  }}
/>;
```

`NodeStyle` 结构：

```ts
interface NodeStyle {
  icon: ReactNode;
  textCls: string;
  bgCls: string;
  label?: string;
}
```

`textCls` 和 `bgCls` 应使用项目已有 Tailwind class。`label` 会显示在图例中；不传时显示 `type` 原始值。

## 交互行为

- 搜索框会匹配 `id`、`title`、`type` 和 `tags`。
- 搜索命中节点会高亮；如果子节点命中，父节点会保留在树中。
- 顶部视图切换支持 `Tree`、`Timeline`、`Graph`；`Graph` 只在传入 `graph` 且未被 `enabledViewModes` 禁用时显示。
- 树视图会显示图例、元数据过滤、叶子节点隐藏和树形节点列表。
- 树视图中，点击有子节点的行会展开或折叠该节点。
- 树视图中，点击无子节点的行只触发 `onNodeClick`。
- 时间线视图使用搜索后的 `filteredData`，左侧树面板可拖拽横向平移，也可拖拽调整左侧面板宽度。
- 时间线条块位置由 `startTime`、`endTime` 和 `duration` 推导。
- Graph 视图使用 `graph` 数据，支持拖动画布、缩放和节点选择。
- 切换到 Graph 视图时，会默认选中最早的 observation，并触发一次 `onNodeClick`；从 Graph 切回其他视图时，会回到首个树根节点。
- 面板右侧可拖拽调整整体宽度，拖拽过程中会触发 `onWidthChange`。
- “Collapse leaf nodes” 按钮会隐藏叶子节点，仅保留有子节点的结构节点。
- 在隐藏叶子节点后，点击某个仍有子节点的父节点，会展开显示该父节点下的叶子节点。
- 元数据过滤菜单可以开关 `Duration`、`Cost`、`Tokens` 三类信息。
- 如果整棵树中没有提供某类元信息，该菜单项会禁用且不能勾选：
  - `Duration`：任意节点或子节点存在 `duration` 时可用。
  - `Cost`：任意节点或子节点存在 `cost` 时可用。
  - `Tokens`：任意节点或子节点存在 `tokensIn`、`tokensOut` 或 `tokensTotal` 任一字段时可用。
- 节点行中的 Token 展示仍以 `tokensIn !== undefined` 为显示条件，格式为 `tokensIn → tokensOut (Σ tokensTotal)`。
- 只有传入 `onExport` 时才显示导出按钮。
- 折叠面板后仅显示折叠/展开按钮，不显示搜索、视图切换、图例、内容区和底部汇总。

## 生成 Trace 数据的建议

大模型生成 `data` 时应遵循以下规则：

1. `id` 必须稳定且唯一，例如 `agent-claims`、`run-llm-1`、`resp-rag`。
2. `title` 应短而具体，建议格式为 `类型 (动作或对象)`，例如 `retrieval (policy_docs · top-5)`。
3. 父节点的 `duration`、`cost`、`tokens` 可以是子节点汇总，也可以来自后端聚合结果；不要在组件内计算。
4. 如需支持时间线视图，尽量为每个节点提供 `startTime` 和 `endTime`；只有 `duration` 时所有节点会从 `0s` 起排布。
5. 不要把大段 prompt、response 正文塞进 `title`；应使用短摘要，详细内容放在点击节点后的外部详情面板中。
6. `tags` 适合放状态、评分、模型名、业务域、风险等级等短文本。

## 推荐链路模板

### Agent + LLM

```ts
const data: TreeNode[] = [
  {
    id: "root",
    type: "ingress",
    title: "ingress SupportAgent/run",
    children: [
      {
        id: "agent-support",
        type: "agent",
        title: "SupportAgent",
        children: [
          {
            id: "run-llm",
            type: "run",
            title: "run (call LLM)",
            duration: "1.24s",
          },
          {
            id: "response",
            type: "response",
            title: "response",
            duration: "1.24s",
            tokensIn: 512,
            tokensOut: 128,
            tokensTotal: 640,
            cost: "$0.002300",
          },
        ],
      },
    ],
  },
];
```

### RAG Pipeline

```ts
const data: TreeNode[] = [
  {
    id: "rag-chain",
    type: "chain",
    title: "RAGPipeline",
    duration: "2.18s",
    children: [
      {
        id: "prompt",
        type: "prompt",
        title: "prompt (build retrieval query)",
      },
      {
        id: "embedding",
        type: "embedding",
        title: "embedding (text-embedding-3-small)",
        duration: "0.10s",
        tokensIn: 64,
        tokensOut: 0,
        tokensTotal: 64,
      },
      {
        id: "retrieval",
        type: "retrieval",
        title: "retrieval (knowledge_base · top-5)",
        duration: "0.08s",
        tags: ["top-k:5"],
      },
      {
        id: "answer",
        type: "response",
        title: "response (grounded answer)",
        duration: "1.72s",
        tokensIn: 920,
        tokensOut: 180,
        tokensTotal: 1100,
      },
      {
        id: "eval",
        type: "eval",
        title: "eval (faithfulness · 0.93)",
        tags: ["faithfulness", "score:0.93"],
      },
    ],
  },
];
```

## 常见误用

- 不要传入非树形结构；`children` 必须继续是 `TreeNode[]`。
- 不要让同一棵树中多个节点共用相同 `id`。
- 不要依赖组件自动统计 `summary`；汇总信息需要由调用方传入。
- 不要假设 `onExport` 会下载文件；它只回调上下文，真正下载逻辑由调用方实现。
- 不要在 `onNodeClick` 中阻止组件内部展开/折叠；当前组件没有提供阻止默认展开的 API。
- 不要把 `width` 写成无单位字符串数字，例如 `"640"`；应传 `640` 或 `"640px"`。
- 不要只传 `enabledViewModes.graph = true` 却不传 `graph`；没有 `graph` 数据时 Graph 按钮不会出现。
- 不要继续使用 `enabledViewModes.chain` 编写新代码；该字段仅用于兼容旧调用。

## 完整受控示例

```tsx
import { useState } from "react";
import {
  LLMTraceChain,
  type GraphObservation,
  type TreeNode,
} from "@/components/business/llm-trace-chain";

export function TraceWorkspace({
  traceData,
  graph,
}: {
  traceData: TreeNode[];
  graph?: GraphObservation[];
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(640);

  return (
    <LLMTraceChain
      data={traceData}
      graph={graph}
      width={panelWidth}
      collapsedWidth={40}
      enabledViewModes={{
        tree: true,
        timeline: true,
        graph: Boolean(graph?.length),
      }}
      summary={{
        duration: "8.54s",
        cost: "$0.006784",
        tokens: "Σ 798",
      }}
      isCollapsed={isCollapsed}
      onCollapsedChange={setIsCollapsed}
      onWidthChange={setPanelWidth}
      onExport={(context) => {
        const payload = JSON.stringify(context.filteredData, null, 2);
        const blob = new Blob([payload], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "llm-trace.json";
        link.click();
        URL.revokeObjectURL(url);
      }}
      onNodeClick={(node, context) => {
        console.log("selected node", {
          node,
          depth: context.depth,
          hasChildren: context.hasChildren,
          wasOpen: context.isOpen,
        });
      }}
    />
  );
}
```
