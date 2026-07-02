import {
  useState,
  useCallback,
  useMemo,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import {
  Search,
  Download,
  ArrowLeftRight,
  Bot,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ListFilter,
  ListCollapse,
  AlignLeft,
  Flame,
  X,
  // New: LLM chain node types
  Braces,
  Database,
  Brain,
  FileText,
  Split,
  Shield,
  ClipboardCheck,
  Link2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ---- Types ----
type BuiltInNodeType =
  | 'ingress'
  | 'invoke'
  | 'agent'
  | 'run'
  | 'response'
  | 'tool'
  // LLM chain extensions
  | 'embedding' // vector embedding call
  | 'retrieval' // vector DB / RAG retrieval
  | 'memory' // memory read / write
  | 'prompt' // prompt template rendering
  | 'router' // conditional routing / decision
  | 'guard' // guardrails / safety filter
  | 'eval' // scoring / evaluation step
  | 'chain' // sub-chain / pipeline step

export type NodeType = BuiltInNodeType | (string & {})

export interface TreeNode {
  id: string
  type: NodeType
  title: string
  duration?: string
  cost?: string
  tokensIn?: number
  tokensOut?: number
  tokensTotal?: number
  tags?: string[]
  children?: TreeNode[]
}

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

export interface LLMTraceChainProps {
  data?: TreeNode[]
  nodeStyles?: Partial<Record<string, NodeStyle>>
  width?: number | string
  collapsedWidth?: number | string
  summary?: TraceSummary
  isCollapsed?: boolean
  onCollapsedChange?: (isCollapsed: boolean) => void
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
      event: MouseEvent<HTMLDivElement>
    }
  ) => void
}

function getAvailableMetadata(nodes: TreeNode[]): MetadataVisibility {
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

// ---- Icon config ----
const DEFAULT_NODE_STYLES: Record<string, NodeStyle> = {
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

const EMPTY_TRACE_DATA: TreeNode[] = []

function getNodeStyle(
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
function matchesSearch(node: TreeNode, q: string): boolean {
  if (!q) return true
  const lq = q.toLowerCase()
  return (
    node.id.toLowerCase().includes(lq) ||
    node.title.toLowerCase().includes(lq) ||
    node.type.toLowerCase().includes(lq) ||
    (node.tags ?? []).some((tag) => tag.toLowerCase().includes(lq))
  )
}

function subtreeVisible(node: TreeNode, q: string): boolean {
  if (!q) return true
  if (matchesSearch(node, q)) return true
  return (node.children ?? []).some((c) => subtreeVisible(c, q))
}

function collectNodeTypes(nodes: TreeNode[]): NodeType[] {
  const types = new Set<NodeType>()

  function visit(node: TreeNode) {
    types.add(node.type)
    node.children?.forEach(visit)
  }

  nodes.forEach(visit)
  return Array.from(types)
}

function filterVisibleTree(nodes: TreeNode[], q: string): TreeNode[] {
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

function toCssSize(value: number | string): CSSProperties['width'] {
  return typeof value === 'number' ? `${value}px` : value
}

// ---- Legend item ----
function LegendItem({
  type,
  nodeStyles,
}: {
  type: NodeType
  nodeStyles?: Partial<Record<string, NodeStyle>>
}) {
  const s = getNodeStyle(type, nodeStyles)
  return (
    <div className='flex items-center gap-1.5'>
      <span
        className={`inline-flex h-[15px] w-[15px] items-center justify-center rounded-[2px] ${s.bgCls} ${s.textCls}`}
      >
        {s.icon}
      </span>
      <span className='text-[11px] text-slate-500'>{s.label ?? type}</span>
    </div>
  )
}

// ---- Tree node row component ----
interface RowProps {
  node: TreeNode
  depth: number
  searchQuery: string
  metadataVisibility: MetadataVisibility
  hideLeafNodes: boolean
  leafCollapseVersion: number
  nodeStyles?: Partial<Record<string, NodeStyle>>
  onNodeClick?: LLMTraceChainProps['onNodeClick']
}

function TreeRow({
  node,
  depth,
  searchQuery,
  metadataVisibility,
  hideLeafNodes,
  leafCollapseVersion,
  nodeStyles,
  onNodeClick,
}: RowProps) {
  const [open, setOpen] = useState(true)
  const [leafRevealState, setLeafRevealState] = useState({
    version: leafCollapseVersion,
    reveal: false,
  })
  const hasChildren = Boolean(node.children?.length)
  const style = getNodeStyle(node.type, nodeStyles)
  const isDirectMatch = searchQuery ? matchesSearch(node, searchQuery) : false
  const isVisible = !searchQuery || subtreeVisible(node, searchQuery)
  const revealLeafChildren =
    leafRevealState.version === leafCollapseVersion && leafRevealState.reveal
  const shouldHideLeafChildren = hideLeafNodes && !revealLeafChildren
  const visibleChildren = (node.children ?? []).filter(
    (child) => !(shouldHideLeafChildren && !child.children?.length)
  )
  const isEffectivelyOpen = open && visibleChildren.length > 0

  if (hideLeafNodes && !hasChildren) return null
  if (!isVisible) return null

  const durationVal = node.duration ? parseFloat(node.duration) : 0
  const durationHigh = durationVal >= 1.0

  const INDENT_PX = 20
  const BASE_PX = 16
  const rowPaddingLeft = BASE_PX + depth * INDENT_PX

  return (
    <div>
      {/* Main row */}
      <div
        className={`group flex cursor-pointer items-center gap-2 py-[6px] pr-3 transition-colors duration-75 select-none ${
          isDirectMatch ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-slate-50'
        } `}
        style={{ paddingLeft: `${rowPaddingLeft}px` }}
        onClick={(event) => {
          onNodeClick?.(node, {
            depth,
            hasChildren,
            isOpen: open,
            event,
          })

          if (!hasChildren) return

          if (shouldHideLeafChildren) {
            setLeafRevealState({
              version: leafCollapseVersion,
              reveal: true,
            })
            setOpen(true)
            return
          }

          setOpen((v) => !v)
        }}
      >
        {/* Node type icon badge */}
        <span
          className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] ${style.bgCls} ${style.textCls} `}
        >
          {style.icon}
        </span>

        {/* Title */}
        <span
          className={`min-w-0 flex-1 truncate text-[13px] leading-snug ${isDirectMatch ? 'font-semibold text-amber-900' : 'font-medium text-slate-800'} `}
        >
          {node.title}
        </span>

        {/* Right-side metadata */}
        <div className='ml-1 flex shrink-0 items-center gap-3'>
          {metadataVisibility.tokens && node.tokensIn !== undefined && (
            <span className='font-mono text-[11px] whitespace-nowrap text-violet-500'>
              {node.tokensIn} → {node.tokensOut}&nbsp;(Σ {node.tokensTotal})
            </span>
          )}
          {metadataVisibility.cost && node.cost && (
            <span className='font-mono text-[11px] whitespace-nowrap text-red-500'>
              Σ {node.cost}
            </span>
          )}
          {metadataVisibility.duration && node.duration && (
            <span
              className={`font-mono text-[12px] whitespace-nowrap ${
                durationHigh ? 'text-orange-500' : 'text-slate-400'
              }`}
            >
              {node.duration}
            </span>
          )}
        </div>

        {/* Expand / collapse chevron */}
        <span className='flex w-[16px] shrink-0 items-center justify-center text-slate-400'>
          {hasChildren ? (
            isEffectivelyOpen ? (
              <ChevronDown size={14} strokeWidth={1.5} />
            ) : (
              <ChevronRight size={14} strokeWidth={1.5} />
            )
          ) : null}
        </span>
      </div>

      {/* Tags detail line */}
      {node.tags?.length ? (
        <div
          className='flex flex-wrap items-center gap-1.5 pb-1 text-[11px]'
          style={{ paddingLeft: `${rowPaddingLeft + 24}px` }}
        >
          {node.tags.map((tag) => (
            <span
              key={tag}
              className='rounded-[3px] bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500'
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* Children */}
      {hasChildren && isEffectivelyOpen && (
        <div className='relative'>
          {/* Vertical guide line */}
          <div
            className='pointer-events-none absolute top-0 bottom-0 w-px bg-slate-200'
            style={{ left: `${rowPaddingLeft + 8}px` }}
          />
          {visibleChildren.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              searchQuery={searchQuery}
              metadataVisibility={metadataVisibility}
              hideLeafNodes={hideLeafNodes && !revealLeafChildren}
              leafCollapseVersion={leafCollapseVersion}
              nodeStyles={nodeStyles}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Main component ----
export function LLMTraceChain({
  data,
  nodeStyles,
  width = '100%',
  collapsedWidth = 40,
  summary,
  isCollapsed: controlledIsCollapsed,
  onCollapsedChange,
  onExport,
  onNodeClick,
}: LLMTraceChainProps = {}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [uncontrolledIsCollapsed, setUncontrolledIsCollapsed] = useState(false)
  const [metadataVisibility, setMetadataVisibility] =
    useState<MetadataVisibility>({
      duration: true,
      cost: true,
      tokens: true,
    })
  const [hideLeafNodes, setHideLeafNodes] = useState(false)
  const [leafCollapseVersion, setLeafCollapseVersion] = useState(0)
  const isCollapsed = controlledIsCollapsed ?? uncontrolledIsCollapsed
  const traceData = data ?? EMPTY_TRACE_DATA
  const legendTypes = useMemo(() => collectNodeTypes(traceData), [traceData])
  const metadataAvailability = useMemo(
    () => getAvailableMetadata(traceData),
    [traceData]
  )
  const effectiveMetadataVisibility = useMemo<MetadataVisibility>(
    () => ({
      duration: metadataVisibility.duration && metadataAvailability.duration,
      cost: metadataVisibility.cost && metadataAvailability.cost,
      tokens: metadataVisibility.tokens && metadataAvailability.tokens,
    }),
    [metadataAvailability, metadataVisibility]
  )
  const filteredData = useMemo(
    () => filterVisibleTree(traceData, searchQuery),
    [searchQuery, traceData]
  )
  const containerStyle = useMemo<CSSProperties>(
    () => ({
      width: toCssSize(isCollapsed ? collapsedWidth : width),
    }),
    [collapsedWidth, isCollapsed, width]
  )

  const handleExport = useCallback(() => {
    onExport?.({
      data: traceData,
      filteredData,
      searchQuery,
      metadataVisibility: effectiveMetadataVisibility,
    })
  }, [
    effectiveMetadataVisibility,
    filteredData,
    onExport,
    searchQuery,
    traceData,
  ])

  const handleCollapsedChange = useCallback(() => {
    const nextCollapsed = !isCollapsed

    if (controlledIsCollapsed === undefined) {
      setUncontrolledIsCollapsed(nextCollapsed)
    }

    onCollapsedChange?.(nextCollapsed)
  }, [controlledIsCollapsed, isCollapsed, onCollapsedChange])

  const handleLeafCollapse = useCallback(() => {
    setHideLeafNodes(true)
    setLeafCollapseVersion((version) => version + 1)
  }, [])

  const hasResults =
    !searchQuery || traceData.some((n) => subtreeVisible(n, searchQuery))

  return (
    <div
      className={`bg-card flex h-[calc(100vh-48px)] flex-col overflow-hidden transition-[width] duration-200`}
      style={containerStyle}
    >
      {/* ---- Header ---- */}
      <div
        className={`border-border flex items-center gap-2 border-b bg-white py-2.5 ${isCollapsed ? 'px-1.5' : 'px-3'} `}
      >
        {/* Panel toggle */}
        <button
          type='button'
          onClick={handleCollapsedChange}
          title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          aria-expanded={!isCollapsed}
          className='shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600'
        >
          <AlignLeft size={15} strokeWidth={1.75} />
        </button>

        {/* Search */}
        {!isCollapsed && (
          <div className='flex flex-1 items-center gap-2 rounded-lg border border-transparent bg-slate-100 px-2.5 py-1.5 transition-all focus-within:border-blue-300 focus-within:bg-white'>
            <Search
              size={13}
              strokeWidth={2}
              className='shrink-0 text-slate-400'
            />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search by ID, title, or type…'
              className='min-w-0 flex-1 bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400'
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className='text-slate-400 transition-colors hover:text-slate-600'
              >
                <X size={12} strokeWidth={2} />
              </button>
            )}
          </div>
        )}

        {/* Toolbar buttons */}
        {!isCollapsed && (
          <div className='ml-auto flex shrink-0 items-center gap-0.5'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type='button'
                  title='Filter metadata'
                  className='rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600'
                >
                  <ListFilter size={14} strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-40'>
                <DropdownMenuLabel>元信息</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={effectiveMetadataVisibility.duration}
                  disabled={!metadataAvailability.duration}
                  onCheckedChange={(checked) =>
                    setMetadataVisibility((current) => ({
                      ...current,
                      duration: Boolean(checked),
                    }))
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  Duration
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={effectiveMetadataVisibility.cost}
                  disabled={!metadataAvailability.cost}
                  onCheckedChange={(checked) =>
                    setMetadataVisibility((current) => ({
                      ...current,
                      cost: Boolean(checked),
                    }))
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  Cost
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={effectiveMetadataVisibility.tokens}
                  disabled={!metadataAvailability.tokens}
                  onCheckedChange={(checked) =>
                    setMetadataVisibility((current) => ({
                      ...current,
                      tokens: Boolean(checked),
                    }))
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  Tokens
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type='button'
              onClick={handleLeafCollapse}
              title='Collapse leaf nodes'
              className='rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600'
            >
              <ListCollapse size={14} strokeWidth={1.75} />
            </button>
            {onExport && (
              <button
                type='button'
                onClick={handleExport}
                title='Export'
                className='rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700'
              >
                <Download size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---- Legend ---- */}
      {!isCollapsed && (
        <div className='border-border border-b bg-slate-50/60 px-4 py-2'>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
            {legendTypes.map((type) => (
              <LegendItem key={type} type={type} nodeStyles={nodeStyles} />
            ))}
          </div>
        </div>
      )}

      {/* ---- Tree content ---- */}
      {!isCollapsed && (
        <div className='min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden'>
          {hasResults ? (
            <div className='py-1'>
              {traceData.map((node) => (
                <TreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  searchQuery={searchQuery}
                  metadataVisibility={effectiveMetadataVisibility}
                  hideLeafNodes={hideLeafNodes}
                  leafCollapseVersion={leafCollapseVersion}
                  nodeStyles={nodeStyles}
                  onNodeClick={onNodeClick}
                />
              ))}
            </div>
          ) : (
            <div className='flex flex-col items-center justify-center py-16 text-center'>
              <Search
                size={28}
                strokeWidth={1.5}
                className='mb-3 text-slate-300'
              />
              <p className='text-[13px] font-medium text-slate-500'>
                No results for "{searchQuery}"
              </p>
              <p className='mt-1 text-[12px] text-slate-400'>
                Try searching by type, title, or ID
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className='mt-3 text-[12px] text-blue-500 underline underline-offset-2 transition-colors hover:text-blue-700'
              >
                Clear search
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- Footer ---- */}
      {!isCollapsed && (
        <div className='border-border flex items-center justify-between border-t bg-slate-50/60 px-4 py-2'>
          <span className='text-[11px] text-slate-400'>
            {searchQuery
              ? `Filtering by "${searchQuery}"`
              : `${countNodes(traceData)} nodes total`}
          </span>
          <div className='flex items-center gap-3 text-[11px] text-slate-400'>
            {effectiveMetadataVisibility.duration && summary?.duration && (
              <span className='flex items-center gap-1'>
                <span className='inline-block h-2 w-2 rounded-full bg-orange-400' />
                Total: {summary.duration}
              </span>
            )}
            {effectiveMetadataVisibility.cost && summary?.cost && (
              <span className='flex items-center gap-1'>
                <span className='inline-block h-2 w-2 rounded-full bg-red-400' />
                Cost: {summary.cost}
              </span>
            )}
            {effectiveMetadataVisibility.tokens && summary?.tokens && (
              <span className='flex items-center gap-1'>
                <span className='inline-block h-2 w-2 rounded-full bg-violet-400' />
                Tokens: {summary.tokens}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Utility: count all nodes ----
function countNodes(nodes: TreeNode[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children ?? []), 0)
}

export default LLMTraceChain
