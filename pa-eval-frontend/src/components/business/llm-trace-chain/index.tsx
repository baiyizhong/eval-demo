import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Search,
  Download,
  ChartNoAxesGantt,
  GitBranch,
  ListFilter,
  ListCollapse,
  AlignLeft,
  X,
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
import { GraphView } from './GraphView'
import { TimelineView } from './TimelineView'
import { LegendItem, TreeView } from './TreeView'
import type {
  LLMTraceChainProps,
  MetadataVisibility,
  TraceViewMode,
} from './types'
import {
  buildObservationGraphData,
  collectNodeTypes,
  countNodes,
  EMPTY_TRACE_DATA,
  filterVisibleTree,
  getAvailableMetadata,
  getFirstGraphObservation,
  getGraphObservations,
  graphObservationToTreeNode,
  MIN_RESIZABLE_WIDTH,
  RESIZE_EDGE_OFFSET,
  toCssSize,
} from './utils'

export type {
  GraphObservation,
  LLMTraceChainProps,
  MetadataVisibility,
  NodeStyle,
  NodeType,
  TraceGraphInput,
  TraceGraphResponse,
  TraceSummary,
  TreeNode,
} from './types'

// ---- Main component ----
export function LLMTraceChain({
  data,
  graph,
  nodeStyles,
  width = '100%',
  height = '100%',
  collapsedWidth = 40,
  summary,
  enabledViewModes,
  isCollapsed: controlledIsCollapsed,
  onCollapsedChange,
  onWidthChange,
  onExport,
  onNodeClick,
}: LLMTraceChainProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousViewModeRef = useRef<TraceViewMode | undefined>(undefined)
  const resizeStateRef = useRef({
    startX: 0,
    startWidth: 0,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [uncontrolledIsCollapsed, setUncontrolledIsCollapsed] = useState(false)
  const [resizedWidth, setResizedWidth] = useState<number | undefined>()
  const [isResizing, setIsResizing] = useState(false)
  const [viewMode, setViewMode] = useState<TraceViewMode>('tree')
  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState<
    string | undefined
  >()
  const [isMetadataMenuOpen, setIsMetadataMenuOpen] = useState(false)
  const [metadataVisibility, setMetadataVisibility] =
    useState<MetadataVisibility>({
      duration: true,
      cost: false,
      tokens: false,
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
  const graphObservations = useMemo(() => getGraphObservations(graph), [graph])
  const firstGraphObservation = useMemo(
    () => getFirstGraphObservation(graph),
    [graph]
  )
  const firstGraphNodeId = firstGraphObservation?.id
  const graphSelectionData = useMemo(
    () => buildObservationGraphData(graphObservations),
    [graphObservations]
  )
  const firstRootNode = filteredData[0] ?? traceData[0]
  const firstRootNodeId = firstRootNode?.id
  const hasGraphInput = graph !== undefined
  const enabledTreeView = enabledViewModes?.tree ?? true
  const enabledTimelineView = enabledViewModes?.timeline ?? true
  const enabledGraphView =
    hasGraphInput && (enabledViewModes?.graph ?? enabledViewModes?.chain ?? true)
  const hasViewModeSwitcher =
    enabledTreeView || enabledTimelineView || enabledGraphView
  const fallbackViewMode: TraceViewMode = enabledTreeView
    ? 'tree'
    : enabledTimelineView
      ? 'timeline'
      : enabledGraphView
        ? 'graph'
        : 'tree'
  const effectiveViewMode =
    (viewMode === 'tree' && enabledTreeView) ||
    (viewMode === 'timeline' && enabledTimelineView) ||
    (viewMode === 'graph' && enabledGraphView)
      ? viewMode
      : fallbackViewMode
  const containerStyle = useMemo<CSSProperties>(
    () => ({
      width: toCssSize(
        isCollapsed ? collapsedWidth : (resizedWidth ?? width)
      ),
      height: toCssSize(height),
    }),
    [collapsedWidth, height, isCollapsed, resizedWidth, width]
  )

  useEffect(() => {
    setResizedWidth(undefined)
  }, [width])

  useEffect(() => {
    if (viewMode !== effectiveViewMode) {
      setViewMode(effectiveViewMode)
    }
  }, [effectiveViewMode, viewMode])

  useEffect(() => {
    const previousViewMode = previousViewModeRef.current

    if (previousViewMode === effectiveViewMode) return

    previousViewModeRef.current = effectiveViewMode

    if (effectiveViewMode === 'graph') {
      setSelectedTreeNodeId(firstGraphNodeId)

      if (firstGraphObservation) {
        const graphNodeId = firstGraphObservation.id

        onNodeClick?.(graphObservationToTreeNode(firstGraphObservation), {
          depth: Math.max(
            (graphSelectionData.levelsById.get(graphNodeId) ?? 1) - 1,
            0
          ),
          hasChildren: Boolean(
            graphSelectionData.childIdsById.get(graphNodeId)?.length
          ),
          isOpen: true,
          event: new globalThis.MouseEvent('click'),
        })
      }

      return
    }

    if (previousViewMode === 'graph') {
      setSelectedTreeNodeId(firstRootNodeId)

      if (firstRootNode) {
        onNodeClick?.(firstRootNode, {
          depth: 0,
          hasChildren: Boolean(firstRootNode.children?.length),
          isOpen: true,
          event: new globalThis.MouseEvent('click'),
        })
      }
    }
  }, [
    effectiveViewMode,
    firstGraphNodeId,
    firstGraphObservation,
    graphSelectionData,
    firstRootNode,
    firstRootNodeId,
    onNodeClick,
  ])

  useEffect(() => {
    if (!isResizing) return

    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (event: PointerEvent) => {
      const containerLeft = containerRef.current?.getBoundingClientRect().left

      if (containerLeft === undefined) return

      const nextRawWidth =
        resizeStateRef.current.startWidth +
        event.clientX -
        resizeStateRef.current.startX
      const maxWidth = Math.max(
        MIN_RESIZABLE_WIDTH,
        window.innerWidth - containerLeft - RESIZE_EDGE_OFFSET
      )
      const nextWidth = Math.min(
        Math.max(nextRawWidth, MIN_RESIZABLE_WIDTH),
        maxWidth
      )

      setResizedWidth(nextWidth)
      onWidthChange?.(nextWidth)
    }

    const handlePointerUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizing, onWidthChange])

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

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isCollapsed) return

      const containerWidth = containerRef.current?.getBoundingClientRect().width

      if (containerWidth === undefined) return

      resizeStateRef.current = {
        startX: event.clientX,
        startWidth: containerWidth,
      }
      event.preventDefault()
      setIsResizing(true)
    },
    [isCollapsed]
  )

  const isTreeMode = effectiveViewMode === 'tree'

  useEffect(() => {
    if (!isTreeMode) setIsMetadataMenuOpen(false)
  }, [isTreeMode])

  return (
    <div
      ref={containerRef}
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card ${
        isResizing ? '' : 'transition-[width] duration-200'
      }`}
      style={containerStyle}
    >
      {!isCollapsed && (
        <div
          role='separator'
          aria-orientation='vertical'
          aria-label='Resize trace panel'
          title='Resize trace panel'
          tabIndex={0}
          onPointerDown={handleResizePointerDown}
          className={`absolute top-0 right-0 bottom-0 z-30 w-2 cursor-col-resize touch-none transition-colors ${
            isResizing ? 'bg-blue-400/30' : 'hover:bg-blue-400/20'
          }`}
        />
      )}

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
            {hasViewModeSwitcher && (
              <div className='mr-1 flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5'>
                {enabledTreeView && (
                  <button
                    type='button'
                    title='Tree view'
                    aria-pressed={effectiveViewMode === 'tree'}
                    onClick={() => setViewMode('tree')}
                    className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
                      effectiveViewMode === 'tree'
                        ? 'bg-white text-slate-700 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <GitBranch size={12} strokeWidth={1.8} />
                    Tree
                  </button>
                )}
                {enabledTimelineView && (
                  <button
                    type='button'
                    title='Timeline view'
                    aria-pressed={effectiveViewMode === 'timeline'}
                    onClick={() => setViewMode('timeline')}
                    className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
                      effectiveViewMode === 'timeline'
                        ? 'bg-white text-slate-700 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <ChartNoAxesGantt size={12} strokeWidth={1.8} />
                    Timeline
                  </button>
                )}
                {enabledGraphView && (
                  <button
                    type='button'
                    title='Graph view'
                    aria-pressed={effectiveViewMode === 'graph'}
                    onClick={() => setViewMode('graph')}
                    className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
                      effectiveViewMode === 'graph'
                        ? 'bg-white text-slate-700 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Link2 size={12} strokeWidth={1.8} />
                    Graph
                  </button>
                )}
              </div>
            )}
            <DropdownMenu
              open={isTreeMode ? isMetadataMenuOpen : false}
              onOpenChange={(open) => {
                if (!isTreeMode) return
                setIsMetadataMenuOpen(open)
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type='button'
                  title='Filter metadata'
                  disabled={!isTreeMode}
                  className={`rounded-md p-1.5 text-slate-400 transition-colors ${
                    isTreeMode
                      ? 'hover:bg-slate-100 hover:text-slate-600'
                      : 'cursor-not-allowed opacity-40'
                  }`}
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
              onClick={isTreeMode ? handleLeafCollapse : undefined}
              title='Collapse leaf nodes'
              disabled={!isTreeMode}
              className={`rounded-md p-1.5 text-slate-400 transition-colors ${
                isTreeMode
                  ? 'hover:bg-slate-100 hover:text-slate-600'
                  : 'cursor-not-allowed opacity-40'
              }`}
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
      {!isCollapsed && effectiveViewMode === 'tree' && (
        <div className='border-border border-b bg-slate-50/60 px-4 py-2'>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
            {legendTypes.map((type) => (
              <LegendItem key={type} type={type} nodeStyles={nodeStyles} />
            ))}
          </div>
        </div>
      )}

      {!isCollapsed && effectiveViewMode === 'tree' && (
        <TreeView
          data={traceData}
          searchQuery={searchQuery}
          metadataVisibility={effectiveMetadataVisibility}
          hideLeafNodes={hideLeafNodes}
          leafCollapseVersion={leafCollapseVersion}
          selectedNodeId={selectedTreeNodeId}
          nodeStyles={nodeStyles}
          onSearchClear={() => setSearchQuery('')}
          onSelectedNodeChange={setSelectedTreeNodeId}
          onNodeClick={onNodeClick}
        />
      )}

      {!isCollapsed && effectiveViewMode === 'timeline' && (
        <TimelineView
          data={filteredData}
          selectedNodeId={selectedTreeNodeId}
          nodeStyles={nodeStyles}
          onSelectedNodeChange={setSelectedTreeNodeId}
          onNodeClick={onNodeClick}
        />
      )}

      {!isCollapsed && effectiveViewMode === 'graph' && (
        <GraphView
          graph={graph}
          selectedNodeId={selectedTreeNodeId}
          onSelectedNodeChange={setSelectedTreeNodeId}
          onNodeClick={onNodeClick}
        />
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

export default LLMTraceChain
