import type { CSSProperties } from 'react'
import type { Edge, IdType, Node } from 'vis-network/standalone'
import {
  ArrowLeftRight,
  ArrowUpDown,
  Bot,
  Braces,
  Brain,
  ClipboardCheck,
  Database,
  FileText,
  Flame,
  Link2,
  Shield,
  Split,
} from 'lucide-react'
import type {
  GraphObservation,
  MetadataVisibility,
  NodeStyle,
  NodeType,
  ObservationGraphData,
  TimelineRow,
  TraceGraphInput,
  TreeNode,
} from './types'

export function getAvailableMetadata(nodes: TreeNode[]): MetadataVisibility {
  return nodes.reduce<MetadataVisibility>(
    (availableMetadata, node) => {
      const childMetadata = getAvailableMetadata(node.children ?? [])

      return {
        duration:
          availableMetadata.duration ||
          childMetadata.duration ||
          node.duration !== undefined,
        cost:
          availableMetadata.cost ||
          childMetadata.cost ||
          node.cost !== undefined,
        tokens:
          availableMetadata.tokens ||
          childMetadata.tokens ||
          node.tokensIn !== undefined ||
          node.tokensOut !== undefined ||
          node.tokensTotal !== undefined,
      }
    },
    {
      duration: false,
      cost: false,
      tokens: false,
    }
  )
}

export function parseDurationSeconds(duration?: string): number {
  if (!duration) return 0

  const value = parseFloat(duration)
  if (Number.isNaN(value)) return 0

  return duration.trim().toLowerCase().endsWith('ms') ? value / 1000 : value
}

const UNIX_SECONDS_THRESHOLD = 1_000_000_000
const UNIX_MILLISECONDS_THRESHOLD = 1_000_000_000_000

export function parseTraceTimeSeconds(time?: number | string): number | undefined {
  if (time === undefined || time === null) return undefined

  if (typeof time === 'number') {
    return parseNumericTraceTimeSeconds(time)
  }

  const normalizedTime = time.trim()
  if (!normalizedTime) return undefined

  if (normalizedTime.toLowerCase().endsWith('ms')) {
    const value = Number.parseFloat(normalizedTime)
    return Number.isNaN(value) ? undefined : value / 1000
  }

  if (/^-?\d+(\.\d+)?$/.test(normalizedTime)) {
    return parseNumericTraceTimeSeconds(Number(normalizedTime))
  }

  const timestamp = Date.parse(normalizedTime)
  return Number.isNaN(timestamp) ? undefined : timestamp / 1000
}

export function parseNumericTraceTimeSeconds(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined

  const absoluteValue = Math.abs(value)

  if (absoluteValue >= UNIX_MILLISECONDS_THRESHOLD) return value / 1000
  if (absoluteValue >= UNIX_SECONDS_THRESHOLD) return value

  return value
}

export function formatDurationSeconds(durationSeconds: number): string {
  return `${durationSeconds.toFixed(2)}s`
}

export function getCumulativeDurationSeconds(node: TreeNode): number {
  return (
    parseDurationSeconds(node.duration) +
    (node.children ?? []).reduce(
      (total, child) => total + getCumulativeDurationSeconds(child),
      0
    )
  )
}

export function getDurationLabel(node: TreeNode): string | null {
  if (!node.duration) return null

  if (!node.children?.length) return node.duration

  return `${node.duration} ∑ ${formatDurationSeconds(
    getCumulativeDurationSeconds(node)
  )}`
}

// ---- Icon config ----
export const DEFAULT_NODE_STYLES: Record<string, NodeStyle> = {
  ingress: {
    icon: <ArrowLeftRight size={10} strokeWidth={2.5} />,
    textCls: 'text-slate-500',
    bgCls: 'bg-slate-200',
  },
  invoke: {
    icon: <ArrowLeftRight size={10} strokeWidth={2.5} />,
    textCls: 'text-blue-500',
    bgCls: 'bg-blue-100',
  },
  agent: {
    icon: <Bot size={11} strokeWidth={2} />,
    textCls: 'text-orange-600',
    bgCls: 'bg-orange-100',
  },
  run: {
    icon: <ArrowLeftRight size={10} strokeWidth={2.5} />,
    textCls: 'text-orange-500',
    bgCls: 'bg-orange-50 ring-1 ring-orange-200',
  },
  response: {
    icon: <ArrowUpDown size={10} strokeWidth={2.5} />,
    textCls: 'text-violet-600',
    bgCls: 'bg-violet-50 ring-1 ring-violet-200',
  },
  tool: {
    icon: <Flame size={10} strokeWidth={2} />,
    textCls: 'text-amber-600',
    bgCls: 'bg-amber-100',
  },
  embedding: {
    icon: <Braces size={10} strokeWidth={2.5} />,
    textCls: 'text-teal-600',
    bgCls: 'bg-teal-50 ring-1 ring-teal-200',
  },
  retrieval: {
    icon: <Database size={10} strokeWidth={2} />,
    textCls: 'text-indigo-600',
    bgCls: 'bg-indigo-50 ring-1 ring-indigo-200',
  },
  memory: {
    icon: <Brain size={10} strokeWidth={2} />,
    textCls: 'text-pink-600',
    bgCls: 'bg-pink-50 ring-1 ring-pink-200',
  },
  prompt: {
    icon: <FileText size={10} strokeWidth={2} />,
    textCls: 'text-lime-700',
    bgCls: 'bg-lime-50 ring-1 ring-lime-200',
  },
  router: {
    icon: <Split size={10} strokeWidth={2} />,
    textCls: 'text-yellow-700',
    bgCls: 'bg-yellow-50 ring-1 ring-yellow-300',
  },
  guard: {
    icon: <Shield size={10} strokeWidth={2} />,
    textCls: 'text-rose-600',
    bgCls: 'bg-rose-50 ring-1 ring-rose-200',
  },
  eval: {
    icon: <ClipboardCheck size={10} strokeWidth={2} />,
    textCls: 'text-emerald-600',
    bgCls: 'bg-emerald-50 ring-1 ring-emerald-200',
  },
  chain: {
    icon: <Link2 size={10} strokeWidth={2.5} />,
    textCls: 'text-slate-600',
    bgCls: 'bg-slate-100 ring-1 ring-slate-300',
  },
  default: {
    icon: <ArrowLeftRight size={10} strokeWidth={2.5} />,
    textCls: 'text-slate-500',
    bgCls: 'bg-slate-200',
  },
}

export const EMPTY_TRACE_DATA: TreeNode[] = []
export const MIN_RESIZABLE_WIDTH = 500
export const RESIZE_EDGE_OFFSET = 24
export const TIMELINE_LEFT_WIDTH = 220
export const TIMELINE_MIN_LEFT_WIDTH = 160
export const TIMELINE_MAX_LEFT_WIDTH = 420
export const TIMELINE_ROW_HEIGHT = 30
export const TIMELINE_SCALE_PX = 72
export const TIMELINE_MIN_BLOCK_WIDTH = 4
export const TIMELINE_AXIS_HEIGHT = 28
export const TIMELINE_TREE_MAX_PAN = 420
export const CHAIN_START_NODE_ID = '__chain_start__'
export const CHAIN_END_NODE_ID = '__chain_end__'

export function getNodeStyle(
  type: NodeType,
  nodeStyles?: Partial<Record<string, NodeStyle>>
): NodeStyle {
  return (
    nodeStyles?.[type] ??
    DEFAULT_NODE_STYLES[type] ??
    DEFAULT_NODE_STYLES.default
  )
}

// ---- Search helpers ----
export function matchesSearch(node: TreeNode, q: string): boolean {
  if (!q) return true
  const lq = q.toLowerCase()
  return (
    node.id.toLowerCase().includes(lq) ||
    node.title.toLowerCase().includes(lq) ||
    node.type.toLowerCase().includes(lq) ||
    (node.tags ?? []).some((tag) => tag.toLowerCase().includes(lq))
  )
}

export function subtreeVisible(node: TreeNode, q: string): boolean {
  if (!q) return true
  if (matchesSearch(node, q)) return true
  return (node.children ?? []).some((c) => subtreeVisible(c, q))
}

export function collectNodeTypes(nodes: TreeNode[]): NodeType[] {
  const types = new Set<NodeType>()

  function visit(node: TreeNode) {
    types.add(node.type)
    node.children?.forEach(visit)
  }

  nodes.forEach(visit)
  return Array.from(types)
}

export function filterVisibleTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes

  return nodes.reduce<TreeNode[]>((visibleNodes, node) => {
    if (!subtreeVisible(node, q)) return visibleNodes

    visibleNodes.push({
      ...node,
      children: node.children ? filterVisibleTree(node.children, q) : undefined,
    })

    return visibleNodes
  }, [])
}

export function getTimelineRows(
  nodes: TreeNode[],
  openNodeIds: Set<string>,
  depth = 0
): TimelineRow[] {
  return nodes.flatMap((node) => {
    const hasChildren = Boolean(node.children?.length)
    const row: TimelineRow = {
      node,
      depth,
      hasChildren,
    }

    if (!hasChildren || !openNodeIds.has(node.id)) return [row]

    return [row, ...getTimelineRows(node.children ?? [], openNodeIds, depth + 1)]
  })
}

export function collectExpandableNodeIds(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.children?.length ? [node.id] : []),
    ...collectExpandableNodeIds(node.children ?? []),
  ])
}

export function getNodeTimeRange(node: TreeNode): {
  start: number
  end: number
  blockDuration: number
  duration: number
} {
  const start = parseTraceTimeSeconds(node.startTime) ?? 0
  const explicitEnd = parseTraceTimeSeconds(node.endTime)
  const duration = parseDurationSeconds(node.duration)
  const end = explicitEnd ?? start + duration
  const normalizedEnd = end >= start ? end : start
  const blockDuration = duration || normalizedEnd - start

  return {
    start,
    end: normalizedEnd,
    blockDuration: Math.max(blockDuration, 0),
    duration: Math.max(normalizedEnd - start, duration, 0),
  }
}

export function getTimelineRange(rows: TimelineRow[]): {
  minStart: number
  maxEnd: number
  totalSeconds: number
} {
  if (!rows.length) {
    return {
      minStart: 0,
      maxEnd: 1,
      totalSeconds: 1,
    }
  }

  const ranges = rows.map((row) => getNodeTimeRange(row.node))
  const minStart = Math.min(...ranges.map((range) => range.start))
  const maxEnd = Math.max(...ranges.map((range) => range.end), minStart + 1)

  return {
    minStart,
    maxEnd,
    totalSeconds: Math.max(maxEnd - minStart, 1),
  }
}

export function toCssSize(value: number | string): CSSProperties['width'] {
  return typeof value === 'number' ? `${value}px` : value
}

export function isTimelineTreeControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('[data-timeline-tree-control="true"]'))
  )
}

export function getGraphObservations(
  graph?: TraceGraphInput
): GraphObservation[] {
  if (!graph) return []
  if (Array.isArray(graph)) return graph
  return graph.result?.data?.json ?? []
}

export function getFirstGraphNodeId(graph?: TraceGraphInput): string | undefined {
  return getFirstGraphObservation(graph)?.id
}

export function getFirstGraphObservation(
  graph?: TraceGraphInput
): GraphObservation | undefined {
  return getSortedGraphObservations(getGraphObservations(graph))[0]
}

function getSortedGraphObservations(
  observations: GraphObservation[]
): GraphObservation[] {
  return [...observations].sort((a, b) => {
    const timeA = parseTraceTimeSeconds(a.startTime) ?? 0
    const timeB = parseTraceTimeSeconds(b.startTime) ?? 0

    return timeA - timeB || (a.step ?? 0) - (b.step ?? 0)
  })
}

export function formatObservationDuration(observation: GraphObservation): string {
  const start = parseTraceTimeSeconds(observation.startTime)
  const end = parseTraceTimeSeconds(observation.endTime)

  if (start === undefined || end === undefined || end < start) return ''

  return formatDurationSeconds(end - start)
}

export function graphObservationToTreeNode(observation: GraphObservation): TreeNode {
  const duration = formatObservationDuration(observation)

  return {
    id: observation.id,
    type: observation.observationType.toLowerCase() as NodeType,
    title: observation.name,
    duration: duration || undefined,
    startTime: observation.startTime,
    endTime: observation.endTime,
    tags: [observation.observationType],
  }
}

export function getObservationTypeColor(observationType: string): Node['color'] {
  switch (observationType.toUpperCase()) {
    case 'GENERATION':
      return {
        background: '#f5f3ff',
        border: '#c4b5fd',
        highlight: { background: '#ede9fe', border: '#8b5cf6' },
      }
    case 'RETRIEVER':
      return {
        background: '#eef2ff',
        border: '#a5b4fc',
        highlight: { background: '#e0e7ff', border: '#6366f1' },
      }
    case 'TOOL':
      return {
        background: '#fef3c7',
        border: '#fbbf24',
        highlight: { background: '#fde68a', border: '#d97706' },
      }
    case 'EVALUATOR':
      return {
        background: '#ecfdf5',
        border: '#6ee7b7',
        highlight: { background: '#d1fae5', border: '#10b981' },
      }
    case 'SPAN':
      return {
        background: '#eff6ff',
        border: '#93c5fd',
        highlight: { background: '#dbeafe', border: '#3b82f6' },
      }
    default:
      return {
        background: '#f8fafc',
        border: '#cbd5e1',
        highlight: { background: '#f1f5f9', border: '#64748b' },
      }
  }
}

export function buildObservationGraphData(
  observations: GraphObservation[]
): ObservationGraphData {
  const observationsById = new Map(
    observations.map((observation) => [observation.id, observation])
  )
  const sortedObservations = getSortedGraphObservations(observations)

  const roots = observations
    .filter(
      (observation) =>
        !observation.parentObservationId ||
        !observationsById.has(observation.parentObservationId)
    )
    .sort((a, b) => {
      const timeA = parseTraceTimeSeconds(a.startTime) ?? 0
      const timeB = parseTraceTimeSeconds(b.startTime) ?? 0

      return timeA - timeB || (a.step ?? 0) - (b.step ?? 0)
    })
  const nodes: Node[] = [
    {
      id: CHAIN_START_NODE_ID,
      label: 'START',
      level: 0,
      shape: 'box',
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      color: {
        background: '#ecfdf5',
        border: '#10b981',
        highlight: { background: '#d1fae5', border: '#059669' },
      },
      font: { color: '#047857', size: 12, face: 'Inter, system-ui' },
    },
  ]
  const edges: Edge[] = []
  const candidateEdges: Edge[] = []
  const childIdsById = new Map<string, string[]>()
  const levelsById = new Map<string, number>()

  function addCandidateEdge(from: string, to: string) {
    if (from === to) return
    if (
      candidateEdges.some((edge) => edge.from === from && edge.to === to)
    ) {
      return
    }

    candidateEdges.push({
      id: `${from}->${to}`,
      from,
      to,
    })
  }

  sortedObservations.forEach((observation, index) => {
    const duration = formatObservationDuration(observation)
    const type = observation.observationType.toUpperCase()

    nodes.push({
      id: observation.id,
      label: `${observation.name}\n${type}${duration ? ` · ${duration}` : ''}`,
      title: [
        observation.name,
        `Type: ${type}`,
        observation.startTime ? `Start: ${observation.startTime}` : '',
        observation.endTime ? `End: ${observation.endTime}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      level: index + 1,
      shape: 'box',
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      color: getObservationTypeColor(type),
      font: { color: '#334155', size: 12, face: 'Inter, system-ui' },
    })
  })

  sortedObservations.forEach((target) => {
    const parentId = target.parentObservationId

    if (parentId && observationsById.has(parentId)) {
      addCandidateEdge(parentId, target.id)
    }

    const targetStart = parseTraceTimeSeconds(target.startTime)

    if (targetStart === undefined) return

    sortedObservations.forEach((source) => {
      if (source.id === target.id) return

      const sourceEnd = parseTraceTimeSeconds(source.endTime)

      if (sourceEnd === undefined || sourceEnd > targetStart) return

      addCandidateEdge(source.id, target.id)
    })
  })

  function hasAlternatePath(from: IdType, to: IdType, skippedEdgeId?: IdType) {
    const visitedIds = new Set<IdType>()
    const queue: IdType[] = [from]

    while (queue.length) {
      const currentId = queue.shift()

      if (currentId === undefined || visitedIds.has(currentId)) continue

      visitedIds.add(currentId)

      const nextIds = candidateEdges
        .filter(
          (edge) => edge.id !== skippedEdgeId && edge.from === currentId
        )
        .map((edge) => edge.to)
        .filter((id): id is IdType => id !== undefined)

      if (nextIds.includes(to)) return true

      queue.push(...nextIds)
    }

    return false
  }

  const completeCandidateEdges = candidateEdges.filter(
    (
      edge
    ): edge is Edge & {
      from: IdType
      to: IdType
    } => edge.from !== undefined && edge.to !== undefined
  )

  const reducedEdges = completeCandidateEdges.filter(
    (edge) => !hasAlternatePath(edge.from, edge.to, edge.id)
  )

  roots.forEach((root) => {
    levelsById.set(root.id, 1)
  })

  let didUpdateLevel = true

  while (didUpdateLevel) {
    didUpdateLevel = false

    reducedEdges.forEach((edge) => {
      if (typeof edge.from !== 'string' || typeof edge.to !== 'string') return

      const sourceLevel = levelsById.get(edge.from)

      if (sourceLevel === undefined) return

      const nextTargetLevel = sourceLevel + 1
      const currentTargetLevel = levelsById.get(edge.to) ?? 1

      if (nextTargetLevel <= currentTargetLevel) return

      levelsById.set(edge.to, nextTargetLevel)
      didUpdateLevel = true
    })
  }

  nodes.forEach((node) => {
    if (typeof node.id !== 'string') return

    const level = levelsById.get(node.id)

    if (level !== undefined) {
      node.level = level
    }
  })

  edges.push(
    ...roots.map((root) => ({
      id: `${CHAIN_START_NODE_ID}->${root.id}`,
      from: CHAIN_START_NODE_ID,
      to: root.id,
    })),
    ...reducedEdges
  )

  sortedObservations.forEach((observation) => {
    childIdsById.set(
      observation.id,
      reducedEdges
        .filter((edge) => edge.from === observation.id)
        .map((edge) => String(edge.to))
    )
  })

  const sourceObservationIds = new Set(
    reducedEdges.map((edge) => String(edge.from))
  )
  const terminalObservations = sortedObservations.filter(
    (observation) => !sourceObservationIds.has(observation.id)
  )

  terminalObservations.forEach((observation) => {
    edges.push({
      id: `${observation.id}->${CHAIN_END_NODE_ID}`,
      from: observation.id,
      to: CHAIN_END_NODE_ID,
    })
  })

  const maxLevel = nodes.reduce((level, node) => {
    const nodeLevel = typeof node.level === 'number' ? node.level : 0
    return Math.max(level, nodeLevel)
  }, 0)

  nodes.push({
    id: CHAIN_END_NODE_ID,
    label: 'END',
    level: maxLevel + 1,
    shape: 'box',
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    color: {
      background: '#fef2f2',
      border: '#ef4444',
      highlight: { background: '#fee2e2', border: '#dc2626' },
    },
    font: { color: '#b91c1c', size: 12, face: 'Inter, system-ui' },
  })

  return {
    nodes,
    edges,
    observationsById,
    childIdsById,
    levelsById,
  }
}

export function countNodes(nodes: TreeNode[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children ?? []), 0)
}
