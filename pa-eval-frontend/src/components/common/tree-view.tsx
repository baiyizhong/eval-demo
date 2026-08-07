import { useEffect, useMemo, useState } from 'react'
import {
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from '@headless-tree/core'
import { useTree } from '@headless-tree/react'
import {
  ChevronRight,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  Plus,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tree, TreeItem, TreeItemLabel } from '@/components/reui/tree'

export type TreeViewNode = {
  id: string
  parentId: string | null
  name: string
  kind: 'folder' | 'item'
  order: number
  disabled?: boolean
}

export type TreeViewMoveInput = {
  id: string
  parentId: string | null
  order: number
}

type TreeViewProps<TNode extends TreeViewNode> = {
  nodes: TNode[]
  title?: React.ReactNode
  selectedId?: string | null
  expandedIds?: string[]
  searchable?: boolean
  editable?: boolean
  draggable?: boolean
  allowDeselect?: boolean
  searchPlaceholder?: string
  clearable?: boolean
  createLabel?: string
  createIconOnly?: boolean
  emptyText?: string
  selectableKinds?: TNode['kind'][]
  editingId?: string | null
  onEditingIdChange?: (id: string | null) => void
  onSelect?: (node: TNode) => void
  onDeselect?: () => void
  onExpandedIdsChange?: (ids: string[]) => void
  onCreate?: (parentId: string | null) => void
  onRename?: (node: TNode, name: string) => Promise<void> | void
  onDelete?: (node: TNode) => void
  onMove?: (moves: TreeViewMoveInput[]) => Promise<void> | void
  canDrag?: (node: TNode) => boolean
  canDrop?: (args: {
    node: TNode
    targetNode: TNode
    parentId: string | null
  }) => boolean
  renderItemIcon?: (node: TNode) => React.ReactNode
  renderActions?: (node: TNode) => React.ReactNode
}

export function TreeView<TNode extends TreeViewNode>({
  nodes,
  title,
  selectedId,
  expandedIds,
  searchable = false,
  editable = false,
  draggable = false,
  allowDeselect = false,
  searchPlaceholder = '搜索名称',
  clearable = true,
  createLabel,
  createIconOnly = false,
  emptyText = '暂无数据',
  selectableKinds,
  editingId,
  onEditingIdChange,
  onSelect,
  onDeselect,
  onExpandedIdsChange,
  onCreate,
  onRename,
  onDelete: _onDelete,
  onMove,
  canDrag,
  canDrop,
  renderItemIcon,
  renderActions,
}: TreeViewProps<TNode>) {
  const [searchValue, setSearchValue] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const normalizedSearch = searchValue.trim().toLowerCase()
  const filteredNodes = useMemo(
    () => filterNodesWithAncestors(nodes, normalizedSearch),
    [nodes, normalizedSearch]
  )
  const searchExpandedIds = useMemo(() => {
    if (!normalizedSearch) return []
    return getAncestorFolderIds(filteredNodes)
  }, [filteredNodes, normalizedSearch])
  const resolvedExpandedIds = useMemo(
    () => [...new Set([...(expandedIds ?? []), ...searchExpandedIds])],
    [expandedIds, searchExpandedIds]
  )
  const data = useMemo(() => toHeadlessTreeData(filteredNodes), [filteredNodes])
  const dataSignature = useMemo(
    () =>
      filteredNodes
        .map(
          (node) =>
            `${node.id}:${node.parentId ?? ''}:${node.order}:${node.kind}:${node.name}`
        )
        .join('|'),
    [filteredNodes]
  )
  const tree = useTree<TNode>({
    rootItemId: 'root',
    ...(resolvedExpandedIds.length
      ? { state: { expandedItems: resolvedExpandedIds } }
      : {}),
    ...(onExpandedIdsChange
      ? {
          setExpandedItems: (updaterOrValue) => {
            const currentIds = expandedIds ?? []
            const nextIds =
              typeof updaterOrValue === 'function'
                ? updaterOrValue(currentIds)
                : updaterOrValue
            onExpandedIdsChange(nextIds)
          },
        }
      : {}),
    getItemName: (item) => data.items[item.getId()]?.name ?? '',
    isItemFolder: (item) => data.items[item.getId()]?.kind === 'folder',
    dataLoader: {
      getItem: (itemId) => data.items[itemId],
      getChildren: (itemId) => data.children[itemId] ?? [],
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  })
  useEffect(() => {
    tree.rebuildTree()
  }, [dataSignature, tree])
  const dragDisabled = !draggable || Boolean(normalizedSearch)

  const moveNode = async (draggedNode: TNode, targetNode: TNode) => {
    if (dragDisabled || !onMove || draggedNode.id === targetNode.id) return
    const parentId =
      targetNode.kind === 'folder' ? targetNode.id : targetNode.parentId
    if (canDrop && !canDrop({ node: draggedNode, targetNode, parentId })) {
      return
    }
    const siblings = nodes.filter(
      (node) => (node.parentId ?? null) === (parentId ?? null)
    )
    const order =
      targetNode.kind === 'folder' ? siblings.length : targetNode.order

    await onMove([{ id: draggedNode.id, parentId, order }])
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-2'>
      {title ? (
        <div
          className='text-foreground text-sm font-medium'
          title={typeof title === 'string' ? title : undefined}
        >
          {title}
        </div>
      ) : null}
      {(searchable || createLabel) && (
        <div className='flex items-center gap-2'>
          {searchable ? (
            <div className='relative min-w-0 flex-1'>
              <Input
                value={searchValue}
                placeholder={searchPlaceholder}
                className={cn(clearable && 'pe-8')}
                onChange={(event) => setSearchValue(event.target.value)}
              />
              {clearable && searchValue ? (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='absolute top-1/2 right-1 size-6 -translate-y-1/2'
                  aria-label='清空搜索'
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setSearchValue('')}
                >
                  <X />
                </Button>
              ) : null}
            </div>
          ) : null}
          {createLabel ? (
            <Button
              size={createIconOnly ? 'icon' : 'sm'}
              className={cn(createIconOnly && 'size-9')}
              title={createLabel}
              aria-label={createLabel}
              onClick={() => onCreate?.(selectedId ?? null)}
            >
              {createIconOnly ? <Plus className='size-4' /> : createLabel}
            </Button>
          ) : null}
        </div>
      )}
      <Tree
        className={cn(
          'min-h-0 overflow-auto',
          dragDisabled && 'cursor-default'
        )}
      >
        {tree.getItems().length > 0 ? (
          tree.getItems().map((item) => {
            const node = data.items[item.getId()] as TNode | undefined
            if (!node) return null
            const isSelected = selectedId === node.id
            const canSelect =
              !node.disabled &&
              (!selectableKinds || selectableKinds.includes(node.kind))
            const isEditing = editable && editingId === node.id
            const rowDraggable =
              !dragDisabled && (!canDrag || canDrag(node)) && !node.disabled
            return (
              <TreeViewRow
                key={node.id}
                node={node}
                selected={isSelected}
                editing={isEditing}
                depth={getNodeDepth(node, data.items)}
                expanded={item.isExpanded()}
                canSelect={canSelect}
                hasChildren={(data.children[node.id] ?? []).length > 0}
                onToggle={() => {
                  if (item.isExpanded()) {
                    item.collapse()
                  } else {
                    item.expand()
                  }
                }}
                onSelect={() => {
                  if (node.kind === 'folder' && !canSelect) {
                    if (!((data.children[node.id] ?? []).length > 0)) return
                    if (item.isExpanded()) {
                      item.collapse()
                    } else {
                      item.expand()
                    }
                    return
                  }
                  if (!canSelect) return
                  if (allowDeselect && selectedId === node.id) {
                    onDeselect?.()
                    return
                  }
                  onSelect?.(node)
                }}
                onRename={async (name) => {
                  if (!name.trim()) {
                    toast.error('名称不能为空')
                    return
                  }
                  await onRename?.(node, name.trim())
                  onEditingIdChange?.(null)
                }}
                onCancelEdit={() => onEditingIdChange?.(null)}
                itemIcon={renderItemIcon?.(node)}
                actions={renderActions?.(node)}
                draggable={rowDraggable}
                onDragStart={() => setDraggedId(node.id)}
                onDragEnd={() => setDraggedId(null)}
                onDragOver={(event) => {
                  if (!draggedId || draggedId === node.id) return
                  event.preventDefault()
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const draggedNode = draggedId
                    ? data.items[draggedId]
                    : undefined
                  setDraggedId(null)
                  if (draggedNode) void moveNode(draggedNode, node)
                }}
              />
            )
          })
        ) : (
          <div className='text-muted-foreground px-2 py-6 text-center text-sm'>
            {emptyText}
          </div>
        )}
      </Tree>
    </div>
  )
}

function TreeViewRow<TNode extends TreeViewNode>({
  node,
  selected,
  editing,
  depth,
  expanded,
  canSelect,
  hasChildren,
  onToggle,
  onSelect,
  onRename,
  onCancelEdit,
  itemIcon,
  actions,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  node: TNode
  selected: boolean
  editing: boolean
  depth: number
  expanded: boolean
  canSelect: boolean
  hasChildren: boolean
  onToggle: () => void
  onSelect: () => void
  onRename: (name: string) => void
  onCancelEdit: () => void
  itemIcon?: React.ReactNode
  actions?: React.ReactNode
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: React.DragEventHandler<HTMLDivElement>
  onDrop?: React.DragEventHandler<HTMLDivElement>
}) {
  const [draft, setDraft] = useState(node.name)
  const isFolder = node.kind === 'folder'
  const canToggle = isFolder && hasChildren
  const visibleActions = editing ? null : actions

  return (
    <TreeItem
      selected={selected}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <TreeItemLabel
        style={{ paddingLeft: `${Math.max(depth, 0) * 24 + 12}px` }}
      >
        <button
          type='button'
          className='text-muted-foreground flex size-4 shrink-0 items-center justify-center'
          onClick={(event) => {
            event.stopPropagation()
            if (canToggle) onToggle()
          }}
        >
          {canToggle ? (
            <ChevronRight
              className={cn(
                'size-4 transition-transform',
                expanded && 'rotate-90'
              )}
            />
          ) : null}
        </button>
        {isFolder ? (
          expanded && hasChildren ? (
            <FolderOpenIcon className='fill-tree-folder-fill text-warning size-4 shrink-0' />
          ) : (
            <FolderIcon className='fill-tree-folder-fill text-warning size-4 shrink-0' />
          )
        ) : (
          (itemIcon ?? (
            <FileIcon className='text-muted-foreground size-4 shrink-0' />
          ))
        )}
        {editing ? (
          <Input
            value={draft}
            autoFocus
            className='h-7 min-w-0 flex-1'
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => onRename(draft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onRename(draft)
              if (event.key === 'Escape') onCancelEdit()
            }}
          />
        ) : (
          <button
            type='button'
            className={cn(
              'min-w-0 flex-1 truncate text-left',
              !canSelect && 'cursor-default',
              node.disabled && 'text-muted-foreground opacity-60'
            )}
            disabled={node.disabled}
            title={node.name}
            onClick={onSelect}
          >
            {node.name}
          </button>
        )}
        {visibleActions ? (
          <div className='ml-auto flex shrink-0 items-center gap-1 opacity-0 group-focus-within/tree-item:opacity-100 group-hover/tree-item:opacity-100'>
            {visibleActions}
          </div>
        ) : null}
      </TreeItemLabel>
    </TreeItem>
  )
}

function getNodeDepth<TNode extends TreeViewNode>(
  node: TNode,
  items: Record<string, TNode>
) {
  let depth = 0
  let parentId = node.parentId
  const visitedIds = new Set<string>([node.id])

  while (parentId) {
    if (visitedIds.has(parentId)) break
    const parent = items[parentId]
    if (!parent) break
    depth += 1
    visitedIds.add(parentId)
    parentId = parent.parentId
  }

  return depth
}

function filterNodesWithAncestors<TNode extends TreeViewNode>(
  nodes: TNode[],
  keyword: string
) {
  if (!keyword) return nodes
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const visibleIds = new Set<string>()

  for (const node of nodes) {
    if (!node.name.toLowerCase().includes(keyword)) continue
    let current: TNode | undefined = node
    while (current) {
      visibleIds.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }

  return nodes.filter((node) => visibleIds.has(node.id))
}

function getAncestorFolderIds<TNode extends TreeViewNode>(nodes: TNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const ancestorIds = new Set<string>()

  for (const node of nodes) {
    let parentId = node.parentId
    const visitedIds = new Set<string>([node.id])

    while (parentId) {
      if (visitedIds.has(parentId)) break
      const parent = byId.get(parentId)
      if (!parent) break
      if (parent.kind === 'folder') ancestorIds.add(parent.id)
      visitedIds.add(parentId)
      parentId = parent.parentId
    }
  }

  return [...ancestorIds]
}

function toHeadlessTreeData<TNode extends TreeViewNode>(nodes: TNode[]) {
  const items: Record<string, TNode> = {
    root: {
      id: 'root',
      parentId: null,
      name: 'root',
      kind: 'folder',
      order: -1,
    } as TNode,
  }
  const children: Record<string, string[]> = { root: [] }

  for (const node of nodes) {
    items[node.id] = node
    const parentId = node.parentId ?? 'root'
    children[parentId] = children[parentId] ?? []
    children[parentId].push(node.id)
  }

  for (const childIds of Object.values(children)) {
    childIds.sort((leftId, rightId) => {
      const left = items[leftId]
      const right = items[rightId]
      const nameCompare = (left?.name ?? '').localeCompare(
        right?.name ?? '',
        'zh-Hans-CN'
      )
      return nameCompare || (left?.order ?? 0) - (right?.order ?? 0)
    })
  }

  return { items, children }
}
