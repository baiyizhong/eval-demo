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
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

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
  height?: number | string
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
    textCls: 'text-muted-foreground',
    bgCls: 'bg-muted',
  },
  invoke: {
    icon: <ArrowLeftRight size={10} strokeWidth={2.5} />,
    textCls: 'text-primary',
    bgCls: 'bg-primary/10',
  },
  agent: {
    icon: <Bot size={11} strokeWidth={2} />,
    textCls: 'text-foreground',
    bgCls: 'bg-secondary',
  },
  run: {
    icon: <ArrowLeftRight size={10} strokeWidth={2.5} />,
    textCls: 'text-foreground',
    bgCls: 'bg-muted ring-1 ring-border',
  },
  response: {
    icon: <ArrowUpDown size={10} strokeWidth={2.5} />,
    textCls: 'text-primary',
    bgCls: 'bg-primary/10 ring-1 ring-primary/20',
  },
  tool: {
    icon: <Flame size={10} strokeWidth={2} />,
    textCls: 'text-foreground',
    bgCls: 'bg-secondary',
  },
  embedding: {
    icon: <Braces size={10} strokeWidth={2.5} />,
    textCls: 'text-primary',
    bgCls: 'bg-primary/10 ring-1 ring-primary/20',
  },
  retrieval: {
    icon: <Database size={10} strokeWidth={2} />,
    textCls: 'text-foreground',
    bgCls: 'bg-muted ring-1 ring-border',
  },
  memory: {
    icon: <Brain size={10} strokeWidth={2} />,
    textCls: 'text-muted-foreground',
    bgCls: 'bg-muted ring-1 ring-border',
  },
  prompt: {
    icon: <FileText size={10} strokeWidth={2} />,
    textCls: 'text-foreground',
    bgCls: 'bg-secondary ring-1 ring-border',
  },
  router: {
    icon: <Split size={10} strokeWidth={2} />,
    textCls: 'text-foreground',
    bgCls: 'bg-accent ring-1 ring-border',
  },
  guard: {
    icon: <Shield size={10} strokeWidth={2} />,
    textCls: 'text-destructive',
    bgCls: 'bg-destructive/10 ring-1 ring-destructive/20',
  },
  eval: {
    icon: <ClipboardCheck size={10} strokeWidth={2} />,
    textCls: 'text-primary',
    bgCls: 'bg-primary/10 ring-1 ring-primary/20',
  },
  chain: {
    icon: <Link2 size={10} strokeWidth={2.5} />,
    textCls: 'text-muted-foreground',
    bgCls: 'bg-muted ring-1 ring-border',
  },
  default: {
    icon: <ArrowLeftRight size={10} strokeWidth={2.5} />,
    textCls: 'text-muted-foreground',
    bgCls: 'bg-muted',
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
        className={cn(
          'inline-flex size-[15px] items-center justify-center rounded-[2px]',
          s.bgCls,
          s.textCls
        )}
      >
        {s.icon}
      </span>
      <span className='text-muted-foreground text-[11px]'>
        {s.label ?? type}
      </span>
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
        className={cn(
          'group flex cursor-pointer items-center gap-2 py-[6px] pr-3 transition-colors duration-75 select-none',
          isDirectMatch
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-muted/60'
        )}
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
          className={cn(
            'inline-flex size-[18px] shrink-0 items-center justify-center rounded-[3px]',
            style.bgCls,
            style.textCls
          )}
        >
          {style.icon}
        </span>

        {/* Title */}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[13px] leading-snug',
            isDirectMatch ? 'font-semibold' : 'text-foreground font-medium'
          )}
        >
          {node.title}
        </span>

        {/* Right-side metadata */}
        <div className='ml-1 flex shrink-0 items-center gap-3'>
          {metadataVisibility.tokens && node.tokensIn !== undefined && (
            <span className='text-muted-foreground font-mono text-[11px] whitespace-nowrap'>
              {node.tokensIn} → {node.tokensOut}&nbsp;(Σ {node.tokensTotal})
            </span>
          )}
          {metadataVisibility.cost && node.cost && (
            <span className='text-destructive font-mono text-[11px] whitespace-nowrap'>
              Σ {node.cost}
            </span>
          )}
          {metadataVisibility.duration && node.duration && (
            <span
              className={cn(
                'font-mono text-[12px] whitespace-nowrap',
                durationHigh ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {node.duration}
            </span>
          )}
        </div>

        {/* Expand / collapse chevron */}
        <span className='text-muted-foreground flex w-[16px] shrink-0 items-center justify-center'>
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
            <Badge
              key={tag}
              variant='secondary'
              className='rounded-[3px] px-1.5 py-0.5 text-[11px]'
            >
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* Children */}
      {hasChildren && isEffectivelyOpen && (
        <div className='relative'>
          {/* Vertical guide line */}
          <Separator
            orientation='vertical'
            className='pointer-events-none absolute top-0 bottom-0'
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
  height = 'calc(100vh - 48px)',
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
      height: toCssSize(height),
    }),
    [collapsedWidth, height, isCollapsed, width]
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
      className='border-border bg-card flex min-h-0 flex-col overflow-hidden rounded-lg border transition-[width] duration-200'
      style={containerStyle}
    >
      {/* ---- Header ---- */}
      <div
        className={cn(
          'border-border bg-background flex items-center gap-2 border-b py-2.5',
          isCollapsed ? 'px-1.5' : 'px-3'
        )}
      >
        {/* Panel toggle */}
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={handleCollapsedChange}
          title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          aria-expanded={!isCollapsed}
        >
          <AlignLeft />
        </Button>

        {/* Search */}
        {!isCollapsed && (
          <div className='relative flex-1'>
            <Search
              className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2'
              size={14}
            />
            <Input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search by ID, title, or type…'
              className='h-8 pr-8 pl-8 text-[13px]'
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            />
            {searchQuery && (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={() => setSearchQuery('')}
                className='absolute top-1/2 right-1 size-6 -translate-y-1/2'
                aria-label='Clear search'
              >
                <X />
              </Button>
            )}
          </div>
        )}

        {/* Toolbar buttons */}
        {!isCollapsed && (
          <div className='ml-auto flex shrink-0 items-center gap-0.5'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  title='Filter metadata'
                >
                  <ListFilter />
                </Button>
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
            <Button
              type='button'
              variant='ghost'
              size='icon'
              onClick={handleLeafCollapse}
              title='Collapse leaf nodes'
            >
              <ListCollapse />
            </Button>
            {onExport && (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={handleExport}
                title='Export'
              >
                <Download />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ---- Legend ---- */}
      {!isCollapsed && (
        <div className='border-border bg-muted/30 border-b px-4 py-2'>
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
                className='text-muted-foreground mb-3'
              />
              <p className='text-muted-foreground text-[13px] font-medium'>
                No results for "{searchQuery}"
              </p>
              <p className='text-muted-foreground mt-1 text-[12px]'>
                Try searching by type, title, or ID
              </p>
              <Button
                type='button'
                variant='link'
                onClick={() => setSearchQuery('')}
                className='mt-3 h-auto p-0 text-[12px]'
              >
                Clear search
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ---- Footer ---- */}
      {!isCollapsed && (
        <div className='border-border bg-muted/30 flex items-center justify-between border-t px-4 py-2'>
          <span className='text-muted-foreground text-[11px]'>
            {searchQuery
              ? `Filtering by "${searchQuery}"`
              : `${countNodes(traceData)} nodes total`}
          </span>
          <div className='text-muted-foreground flex items-center gap-3 text-[11px]'>
            {effectiveMetadataVisibility.duration && summary?.duration && (
              <span className='flex items-center gap-1'>
                <span className='bg-foreground inline-block size-2 rounded-full' />
                Total: {summary.duration}
              </span>
            )}
            {effectiveMetadataVisibility.cost && summary?.cost && (
              <span className='flex items-center gap-1'>
                <span className='bg-destructive inline-block size-2 rounded-full' />
                Cost: {summary.cost}
              </span>
            )}
            {effectiveMetadataVisibility.tokens && summary?.tokens && (
              <span className='flex items-center gap-1'>
                <span className='bg-muted-foreground inline-block size-2 rounded-full' />
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
