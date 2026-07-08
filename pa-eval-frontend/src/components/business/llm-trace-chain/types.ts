import type { MouseEvent, ReactNode } from 'react'
import type { Edge, Node } from 'vis-network/standalone'

type BuiltInNodeType =
  | 'ingress'
  | 'invoke'
  | 'agent'
  | 'run'
  | 'response'
  | 'tool'
  | 'embedding'
  | 'retrieval'
  | 'memory'
  | 'prompt'
  | 'router'
  | 'guard'
  | 'eval'
  | 'chain'

export type NodeType = BuiltInNodeType | (string & {})

export interface TreeNode {
  id: string
  type: NodeType
  title: string
  duration?: string
  startTime?: number | string
  endTime?: number | string
  cost?: string
  tokensIn?: number
  tokensOut?: number
  tokensTotal?: number
  tags?: string[]
  children?: TreeNode[]
}

export interface GraphObservation {
  id: string
  node?: string
  step?: number
  parentObservationId?: string | null
  name: string
  startTime?: string
  endTime?: string
  observationType: string
}

export interface TraceGraphResponse {
  result?: {
    data?: {
      json?: GraphObservation[]
    }
  }
}

export type TraceGraphInput = GraphObservation[] | TraceGraphResponse

export interface NodeStyle {
  icon: ReactNode
  textCls: string
  bgCls: string
  label?: string
}

export interface TraceSummary {
  duration?: string
  cost?: string
  tokens?: string
}

export interface MetadataVisibility {
  duration: boolean
  cost: boolean
  tokens: boolean
}

export type TraceNodeClickEvent =
  | MouseEvent<HTMLDivElement>
  | globalThis.MouseEvent
export type TraceViewMode = 'tree' | 'timeline' | 'graph'
export type EnabledViewModes = Partial<Record<TraceViewMode, boolean>> & {
  /** @deprecated Use graph instead. */
  chain?: boolean
}

export interface TimelineRow {
  node: TreeNode
  depth: number
  hasChildren: boolean
}

export interface ObservationGraphData {
  nodes: Node[]
  edges: Edge[]
  observationsById: Map<string, GraphObservation>
  childIdsById: Map<string, string[]>
  levelsById: Map<string, number>
}

export interface LLMTraceChainProps {
  data?: TreeNode[]
  graph?: TraceGraphInput
  nodeStyles?: Partial<Record<string, NodeStyle>>
  width?: number | string
  height?: number | string
  collapsedWidth?: number | string
  summary?: TraceSummary
  enabledViewModes?: EnabledViewModes
  isCollapsed?: boolean
  onCollapsedChange?: (isCollapsed: boolean) => void
  onWidthChange?: (width: number) => void
  onExport?: (context: {
    data: TreeNode[]
    filteredData: TreeNode[]
    searchQuery: string
    metadataVisibility: MetadataVisibility
  }) => void
  onNodeClick?: (
    node: TreeNode,
    context: {
      depth: number
      hasChildren: boolean
      isOpen: boolean
      event: TraceNodeClickEvent
    }
  ) => void
}

export type SelectedNodeChangeHandler = (nodeId: string | undefined) => void
