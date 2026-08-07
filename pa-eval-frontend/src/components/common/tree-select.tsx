import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, FileIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TreeView, type TreeViewNode } from './tree-view'

export type TreeSelectNode = TreeViewNode

type TreeSelectProps<TNode extends TreeSelectNode> = {
  nodes: TNode[]
  value?: string | null
  onValueChange: (node: TNode) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  selectableKinds?: TNode['kind'][]
  disabled?: boolean
  className?: string
  popoverClassName?: string
  getDisplayValue?: (node: TNode, path: TNode[]) => React.ReactNode
  renderIcon?: (node: TNode) => React.ReactNode
  renderNodeMeta?: (node: TNode) => React.ReactNode
}

export function TreeSelect<TNode extends TreeSelectNode>({
  nodes,
  value,
  onValueChange,
  placeholder = '请选择',
  searchPlaceholder = '搜索名称',
  emptyText = '暂无数据',
  selectableKinds,
  disabled,
  className,
  popoverClassName,
  getDisplayValue,
  renderIcon,
  renderNodeMeta,
}: TreeSelectProps<TNode>) {
  const [open, setOpen] = useState(false)
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === value) ?? null,
    [nodes, value]
  )
  const selectedPath = useMemo(
    () => (selectedNode ? getNodePath(nodes, selectedNode.id) : []),
    [nodes, selectedNode]
  )
  const displayValue = selectedNode
    ? (getDisplayValue?.(selectedNode, selectedPath) ??
      selectedPath.map((node) => node.name).join(' / '))
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between', className)}
        >
          <span
            className={cn(
              'min-w-0 truncate',
              !selectedNode && 'text-muted-foreground'
            )}
          >
            {displayValue}
          </span>
          <ChevronsUpDown data-icon='inline-end' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className={cn(
          'w-[var(--radix-popover-trigger-width)] p-2',
          popoverClassName
        )}
      >
        <ScrollArea className='max-h-90'>
          <TreeView
            nodes={nodes}
            selectedId={value}
            searchable
            searchPlaceholder={searchPlaceholder}
            selectableKinds={selectableKinds}
            emptyText={emptyText}
            renderItemIcon={(node) =>
              renderIcon?.(node) ?? (
                <FileIcon className='text-muted-foreground size-4 shrink-0' />
              )
            }
            renderActions={(node) => (
              <span className='flex shrink-0 items-center gap-1'>
                {renderNodeMeta?.(node)}
                {value === node.id ? (
                  <Check className='text-primary size-4' />
                ) : null}
              </span>
            )}
            onSelect={(node) => {
              if (node.disabled) return
              onValueChange(node)
              setOpen(false)
            }}
          />
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function getNodePath<TNode extends TreeSelectNode>(
  nodes: TNode[],
  nodeId: string
) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const path: TNode[] = []
  const visitedIds = new Set<string>()
  let current = byId.get(nodeId)

  while (current && !visitedIds.has(current.id)) {
    path.unshift(current)
    visitedIds.add(current.id)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return path
}
