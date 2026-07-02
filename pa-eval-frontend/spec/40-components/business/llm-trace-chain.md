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

`LLMTraceChain` 是一个侧边面板组件，用于展示 LLM/Agent 执行链路的树形 Trace。它适合展示：

- Agent 调用链路
- LLM 请求与响应
- Tool 调用
- RAG 检索链路
- Prompt、Memory、Guardrail、Eval 等中间步骤
- 每个节点的耗时、费用、Token 和标签

组件内置搜索、节点展开/折叠、叶子节点隐藏、元信息开关、图例、面板折叠和导出回调。

## 导入方式

```tsx
import { LLMTraceChain, type TreeNode } from "@/components/business/llm-trace-chain";
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
| `cost`        | 否   | 费用字符串，例如 `"$0.001804"`。                                      |
| `tokensIn`    | 否   | 输入 Token 数。                                                       |
| `tokensOut`   | 否   | 输出 Token 数。                                                       |
| `tokensTotal` | 否   | 总 Token 数。                                                         |
| `tags`        | 否   | 节点标签，会显示在节点下方，也会参与搜索。                            |
| `children`    | 否   | 子节点数组，用于表达调用层级。                                        |

注意：如果要展示 Token 元数据，至少应提供 `tokensIn`。组件当前仅在 `tokensIn !== undefined` 时显示 token 行，展示格式为 `tokensIn → tokensOut (Σ tokensTotal)`。

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
  nodeStyles?: Partial<Record<string, NodeStyle>>;
  width?: number | string;
  collapsedWidth?: number | string;
  summary?: TraceSummary;
  isCollapsed?: boolean;
  onCollapsedChange?: (isCollapsed: boolean) => void;
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
      event: MouseEvent<HTMLDivElement>;
    },
  ) => void;
}
```

### `data`

Trace 树数据。未传入时等同于空数组。

```tsx
<LLMTraceChain data={traceData} />
```

### `width`

面板展开时宽度。可以是数字或 CSS 尺寸字符串。数字会转换为 px。

```tsx
<LLMTraceChain width={640} />
<LLMTraceChain width="42rem" />
<LLMTraceChain width="100%" />
```

默认值：`"100%"`。

### `collapsedWidth`

面板折叠时宽度。可以是数字或 CSS 尺寸字符串。

```tsx
<LLMTraceChain collapsedWidth={40} />
```

默认值：`40`。

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

点击任意节点行时触发。组件会先触发回调，再执行内部展开/折叠逻辑。

```tsx
<LLMTraceChain
  onNodeClick={(node, context) => {
    console.log(node.id, context.depth, context.hasChildren, context.isOpen);
  }}
/>
```

`context.isOpen` 是点击发生前的展开状态。

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
- 点击有子节点的行会展开或折叠该节点。
- 点击无子节点的行只触发 `onNodeClick`。
- “Collapse leaf nodes” 按钮会隐藏叶子节点，仅保留有子节点的结构节点。
- 在隐藏叶子节点后，点击某个仍有子节点的父节点，会展开显示该父节点下的叶子节点。
- 元数据过滤菜单可以开关 `Duration`、`Cost`、`Tokens` 三类信息。
- 如果整棵树中没有提供某类元信息，该菜单项会禁用且不能勾选：
  - `Duration`：任意节点或子节点存在 `duration` 时可用。
  - `Cost`：任意节点或子节点存在 `cost` 时可用。
  - `Tokens`：任意节点或子节点存在 `tokensIn`、`tokensOut` 或 `tokensTotal` 任一字段时可用。
- 节点行中的 Token 展示仍以 `tokensIn !== undefined` 为显示条件，格式为 `tokensIn → tokensOut (Σ tokensTotal)`。
- 只有传入 `onExport` 时才显示导出按钮。
- 折叠面板后仅显示折叠/展开按钮，不显示搜索、图例、树和底部汇总。

## 生成 Trace 数据的建议

大模型生成 `data` 时应遵循以下规则：

1. `id` 必须稳定且唯一，例如 `agent-claims`、`run-llm-1`、`resp-rag`。
2. `title` 应短而具体，建议格式为 `类型 (动作或对象)`，例如 `retrieval (policy_docs · top-5)`。
3. 父节点的 `duration`、`cost`、`tokens` 可以是子节点汇总，也可以来自后端聚合结果；不要在组件内计算。
4. 不要把大段 prompt、response 正文塞进 `title`；应使用短摘要，详细内容放在点击节点后的外部详情面板中。
5. `tags` 适合放状态、评分、模型名、业务域、风险等级等短文本。

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

## 完整受控示例

```tsx
import { useState } from "react";
import { LLMTraceChain, type TreeNode } from "@/components/business/llm-trace-chain";

export function TraceWorkspace({ traceData }: { traceData: TreeNode[] }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <LLMTraceChain
      data={traceData}
      width={640}
      collapsedWidth={40}
      summary={{
        duration: "8.54s",
        cost: "$0.006784",
        tokens: "Σ 798",
      }}
      isCollapsed={isCollapsed}
      onCollapsedChange={setIsCollapsed}
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
