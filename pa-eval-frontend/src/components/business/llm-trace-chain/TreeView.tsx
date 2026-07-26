import { useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import type { LLMTraceChainProps, MetadataVisibility, NodeStyle, NodeType, TreeNode } from './types'
import { getDurationLabel, getNodeStyle, matchesSearch, subtreeVisible } from './utils'

export function LegendItem({
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
      <span className='text-[12px] text-slate-500'>{s.label ?? type}</span>
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
  selectedNodeId?: string
  nodeStyles?: Partial<Record<string, NodeStyle>>
  onSelectedNodeChange?: (nodeId: string) => void
  onNodeClick?: LLMTraceChainProps['onNodeClick']
}

function TreeRow({
  node,
  depth,
  searchQuery,
  metadataVisibility,
  hideLeafNodes,
  leafCollapseVersion,
  selectedNodeId,
  nodeStyles,
  onSelectedNodeChange,
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
  const isSelected = selectedNodeId === node.id
  const revealLeafChildren =
    leafRevealState.version === leafCollapseVersion && leafRevealState.reveal
  const shouldHideLeafChildren = hideLeafNodes && !revealLeafChildren
  const visibleChildren = (node.children ?? []).filter(
    (child) => !(shouldHideLeafChildren && !child.children?.length)
  )
  const isEffectivelyOpen = open && visibleChildren.length > 0
  const durationLabel = getDurationLabel(node)

  if (hideLeafNodes && !hasChildren) return null
  if (!isVisible) return null

  const INDENT_PX = 20
  const BASE_PX = 16
  const rowPaddingLeft = BASE_PX + depth * INDENT_PX

  return (
    <div>
      {/* Main row */}
      <div
        className={`group flex cursor-pointer items-center gap-2 py-[6px] pr-3 transition-colors duration-75 select-none ${
          isSelected
            ? 'bg-blue-50'
            : isDirectMatch
              ? 'bg-amber-50 hover:bg-amber-100'
              : 'hover:bg-slate-50'
        } `}
        style={{ paddingLeft: `${rowPaddingLeft}px` }}
        onClick={(event) => {
          onSelectedNodeChange?.(node.id)
          onNodeClick?.(node, {
            depth,
            hasChildren,
            isOpen: open,
            event,
          })
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
          className={`min-w-0 flex-1 truncate text-[12px] leading-snug ${isDirectMatch ? 'font-semibold text-amber-900' : 'font-medium text-slate-800'} `}
        >
          {node.title}
        </span>

        {/* Right-side metadata */}
        <div className='ml-1 flex shrink-0 items-center gap-3'>
          {metadataVisibility.tokens && node.tokensIn !== undefined && (
            <span className='font-mono text-[12px] whitespace-nowrap text-violet-500'>
              {node.tokensIn} → {node.tokensOut}&nbsp;(Σ {node.tokensTotal})
            </span>
          )}
          {metadataVisibility.cost && node.cost && (
            <span className='font-mono text-[12px] whitespace-nowrap text-red-500'>
              Σ {node.cost}
            </span>
          )}
          {metadataVisibility.duration && durationLabel && (
            <span className='font-mono text-[12px] whitespace-nowrap text-slate-400'>
              {durationLabel}
            </span>
          )}
        </div>

        {/* Expand / collapse chevron */}
        <button
          type='button'
          className='flex w-[16px] shrink-0 items-center justify-center text-slate-400 transition-colors hover:text-slate-600'
          onClick={(event) => {
            event.stopPropagation()
            onSelectedNodeChange?.(node.id)

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
          {hasChildren ? (
            isEffectivelyOpen ? (
              <ChevronDown size={14} strokeWidth={1.5} />
            ) : (
              <ChevronRight size={14} strokeWidth={1.5} />
            )
          ) : null}
        </button>
      </div>

      {/* Tags detail line */}
      {node.tags?.length ? (
        <div
          className='flex flex-wrap items-center gap-1.5 pb-1 text-[12px]'
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
              selectedNodeId={selectedNodeId}
              nodeStyles={nodeStyles}
              onSelectedNodeChange={onSelectedNodeChange}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface TreeViewProps {
  data: TreeNode[]
  searchQuery: string
  metadataVisibility: MetadataVisibility
  hideLeafNodes: boolean
  leafCollapseVersion: number
  selectedNodeId?: string
  nodeStyles?: Partial<Record<string, NodeStyle>>
  onSearchClear: () => void
  onSelectedNodeChange?: (nodeId: string) => void
  onNodeClick?: LLMTraceChainProps['onNodeClick']
}

export function TreeView({
  data,
  searchQuery,
  metadataVisibility,
  hideLeafNodes,
  leafCollapseVersion,
  selectedNodeId,
  nodeStyles,
  onSearchClear,
  onSelectedNodeChange,
  onNodeClick,
}: TreeViewProps) {
  const hasResults =
    !searchQuery || data.some((node) => subtreeVisible(node, searchQuery))

  return (
    <div className='min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden'>
      {hasResults ? (
        <div className='py-1'>
          {data.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              searchQuery={searchQuery}
              metadataVisibility={metadataVisibility}
              hideLeafNodes={hideLeafNodes}
              leafCollapseVersion={leafCollapseVersion}
              selectedNodeId={selectedNodeId}
              nodeStyles={nodeStyles}
              onSelectedNodeChange={onSelectedNodeChange}
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
            onClick={onSearchClear}
            className='mt-3 text-[12px] text-blue-500 underline underline-offset-2 transition-colors hover:text-blue-700'
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  )
}
