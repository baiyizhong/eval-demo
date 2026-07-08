import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { LLMTraceChainProps, NodeStyle, TreeNode } from './types'
import {
  collectExpandableNodeIds,
  formatDurationSeconds,
  getNodeStyle,
  getNodeTimeRange,
  getTimelineRange,
  getTimelineRows,
  isTimelineTreeControl,
  TIMELINE_AXIS_HEIGHT,
  TIMELINE_LEFT_WIDTH,
  TIMELINE_MAX_LEFT_WIDTH,
  TIMELINE_MIN_BLOCK_WIDTH,
  TIMELINE_MIN_LEFT_WIDTH,
  TIMELINE_ROW_HEIGHT,
  TIMELINE_SCALE_PX,
  TIMELINE_TREE_MAX_PAN,
} from './utils'

interface TimelineViewProps {
  data: TreeNode[]
  selectedNodeId?: string
  nodeStyles?: Partial<Record<string, NodeStyle>>
  onSelectedNodeChange?: (nodeId: string) => void
  onNodeClick?: LLMTraceChainProps['onNodeClick']
}

export function TimelineView({
  data,
  selectedNodeId,
  nodeStyles,
  onSelectedNodeChange,
  onNodeClick,
}: TimelineViewProps) {
  const [openNodeIds, setOpenNodeIds] = useState<Set<string>>(
    () => new Set(collectExpandableNodeIds(data))
  )
  const [treePaneWidth, setTreePaneWidth] = useState(TIMELINE_LEFT_WIDTH)
  const [isTreePaneResizing, setIsTreePaneResizing] = useState(false)
  const [treePanX, setTreePanX] = useState(0)
  const treePaneResizeRef = useRef({
    startX: 0,
    startWidth: TIMELINE_LEFT_WIDTH,
  })
  const panStateRef = useRef({
    startX: 0,
    startPanX: 0,
    isDragging: false,
    didDrag: false,
  })

  const effectiveOpenNodeIds = useMemo(() => {
    const availableIds = new Set(collectExpandableNodeIds(data))
    const next = new Set<string>()

    availableIds.forEach((id) => {
      if (openNodeIds.has(id)) next.add(id)
    })

    if (!next.size) {
      availableIds.forEach((id) => next.add(id))
    }

    return next
  }, [data, openNodeIds])

  const rows = useMemo(() => getTimelineRows(data, effectiveOpenNodeIds), [
    data,
    effectiveOpenNodeIds,
  ])
  const timelineRange = useMemo(() => getTimelineRange(rows), [rows])
  const timelineWidth = Math.ceil(timelineRange.totalSeconds) * TIMELINE_SCALE_PX
  const tickCount = Math.ceil(timelineRange.totalSeconds) + 1
  const tickValues = Array.from({ length: tickCount }, (_, index) => index)

  useEffect(() => {
    if (!isTreePaneResizing) return

    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth =
        treePaneResizeRef.current.startWidth +
        event.clientX -
        treePaneResizeRef.current.startX

      setTreePaneWidth(
        Math.min(
          Math.max(nextWidth, TIMELINE_MIN_LEFT_WIDTH),
          TIMELINE_MAX_LEFT_WIDTH
        )
      )
    }

    const handlePointerUp = () => {
      setIsTreePaneResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isTreePaneResizing])

  const toggleNode = useCallback((nodeId: string) => {
    setOpenNodeIds((current) => {
      const next = new Set(current)

      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }

      return next
    })
  }, [])

  const handleTimelineNodeClick = useCallback(
    (
      node: TreeNode,
      context: {
        depth: number
        hasChildren: boolean
        isOpen: boolean
        event: MouseEvent<HTMLDivElement>
      }
    ) => {
      if (panStateRef.current.didDrag) return

      onSelectedNodeChange?.(node.id)
      onNodeClick?.(node, context)
    },
    [onNodeClick, onSelectedNodeChange]
  )

  const handleTreePanePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isTreePaneResizing) return
      if (isTimelineTreeControl(event.target)) return

      panStateRef.current = {
        startX: event.clientX,
        startPanX: treePanX,
        isDragging: true,
        didDrag: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [isTreePaneResizing, treePanX]
  )

  const handleTreePanePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!panStateRef.current.isDragging) return

      const deltaX = panStateRef.current.startX - event.clientX
      panStateRef.current.didDrag = Math.abs(deltaX) > 3
      const nextPanX = Math.min(
        Math.max(panStateRef.current.startPanX + deltaX, 0),
        TIMELINE_TREE_MAX_PAN
      )

      setTreePanX(nextPanX)
    },
    []
  )

  const handleTreePanePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      panStateRef.current.isDragging = false
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    []
  )

  const handleTreePaneResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      treePaneResizeRef.current = {
        startX: event.clientX,
        startWidth: treePaneWidth,
      }
      panStateRef.current.isDragging = false
      event.preventDefault()
      event.stopPropagation()
      setIsTreePaneResizing(true)
    },
    [treePaneWidth]
  )

  if (!rows.length) {
    return (
      <div className='flex flex-1 items-center justify-center text-[13px] text-slate-400'>
        No timeline data
      </div>
    )
  }

  return (
    <div className='min-h-0 flex-1 overflow-y-auto bg-white'>
      <div className='flex min-w-0'>
        <div
          className='sticky left-0 z-10 shrink-0 overflow-hidden border-r border-border bg-white'
          style={{ width: treePaneWidth }}
          onPointerDown={handleTreePanePointerDown}
          onPointerMove={handleTreePanePointerMove}
          onPointerUp={handleTreePanePointerUp}
          onPointerCancel={handleTreePanePointerUp}
        >
          <div
            className='sticky top-0 z-10 flex items-center border-b border-border bg-slate-50 px-3 text-[11px] font-medium text-slate-400'
            style={{ height: TIMELINE_AXIS_HEIGHT }}
          >
            Tree
          </div>
          <div
            className='cursor-grab active:cursor-grabbing'
            style={{
              minWidth: treePaneWidth + TIMELINE_TREE_MAX_PAN,
              transform: `translateX(-${treePanX}px)`,
            }}
          >
            {rows.map(({ node, depth, hasChildren }) => {
              const style = getNodeStyle(node.type, nodeStyles)
              const isOpen = effectiveOpenNodeIds.has(node.id)
              const isSelected = selectedNodeId === node.id

              return (
                <div
                  key={node.id}
                  data-timeline-tree-control='true'
                  className={`flex items-center gap-1.5 border-b border-slate-100 pr-3 text-[12px] text-slate-700 transition-colors ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                  style={{
                    height: TIMELINE_ROW_HEIGHT,
                    paddingLeft: 10 + depth * 18,
                  }}
                  onClick={(event) => {
                    handleTimelineNodeClick(node, {
                      depth,
                      hasChildren,
                      isOpen,
                      event,
                    })
                  }}
                >
                  <button
                    type='button'
                    aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.title}`}
                    aria-expanded={hasChildren ? isOpen : undefined}
                    className='flex h-full w-5 shrink-0 cursor-pointer items-center justify-center text-slate-400 transition-colors hover:text-slate-600'
                    onPointerDown={(event) => {
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectedNodeChange?.(node.id)
                      if (hasChildren) {
                        toggleNode(node.id)
                      }
                    }}
                  >
                    {hasChildren ? (
                      isOpen ? (
                        <ChevronDown size={13} strokeWidth={1.6} />
                      ) : (
                        <ChevronRight size={13} strokeWidth={1.6} />
                      )
                    ) : null}
                  </button>
                  <span
                    className={`inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[3px] ${style.bgCls} ${style.textCls}`}
                  >
                    {style.icon}
                  </span>
                  <span className='whitespace-nowrap font-medium'>
                    {node.title}
                  </span>
                </div>
              )
            })}
          </div>
          <div
            role='separator'
            aria-orientation='vertical'
            aria-label='Resize timeline tree'
            title='Resize timeline tree'
            onPointerDown={handleTreePaneResizePointerDown}
            className={`absolute top-0 right-0 bottom-0 z-20 w-2 cursor-col-resize touch-none transition-colors ${
              isTreePaneResizing ? 'bg-blue-400/30' : 'hover:bg-blue-400/20'
            }`}
          />
        </div>

        <div className='min-w-0 flex-1 overflow-x-auto'>
          <div
            className='relative'
            style={{ width: Math.max(timelineWidth, TIMELINE_SCALE_PX * 4) }}
          >
            <div
              className='sticky top-0 z-10 border-b border-border bg-slate-50'
              style={{ height: TIMELINE_AXIS_HEIGHT }}
            >
              {tickValues.map((tick) => (
                <div
                  key={tick}
                  className='absolute top-0 bottom-0 border-l border-slate-200 pl-1 pt-1 font-mono text-[10px] text-slate-400'
                  style={{ left: tick * TIMELINE_SCALE_PX }}
                >
                  {tick}s
                </div>
              ))}
            </div>
            <div className='relative'>
              {tickValues.map((tick) => (
                <div
                  key={tick}
                  className='pointer-events-none absolute top-0 bottom-0 border-l border-slate-100'
                  style={{
                    left: tick * TIMELINE_SCALE_PX,
                    height: rows.length * TIMELINE_ROW_HEIGHT,
                  }}
                />
              ))}
              {rows.map(({ node }) => {
                const range = getNodeTimeRange(node)
                const startPx =
                  (range.start - timelineRange.minStart) * TIMELINE_SCALE_PX
                const widthPx = Math.max(
                  range.blockDuration * TIMELINE_SCALE_PX,
                  TIMELINE_MIN_BLOCK_WIDTH
                )
                const style = getNodeStyle(node.type, nodeStyles)

                return (
                  <div
                    key={node.id}
                    className='relative border-b border-slate-100'
                    style={{ height: TIMELINE_ROW_HEIGHT }}
                  >
                    <div
                      className={`absolute top-[7px] h-4 rounded-[3px] ${style.bgCls}`}
                      style={{
                        left: startPx,
                        width: widthPx,
                      }}
                      title={`${node.title}: ${formatDurationSeconds(
                        range.blockDuration
                      )}`}
                    />
                    <span
                      className='absolute top-[7px] font-mono text-[10px] text-slate-400'
                      style={{ left: startPx + widthPx + 6 }}
                    >
                      {formatDurationSeconds(range.blockDuration)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
