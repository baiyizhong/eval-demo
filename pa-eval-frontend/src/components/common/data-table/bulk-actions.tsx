import { useState, useEffect, useRef } from 'react'
import { type Table } from '@tanstack/react-table'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { DataTableSelectionState } from './data-table'

type DataTableBulkActionsProps<TData> = {
  table: Table<TData>
  entityName: string
  selection?: DataTableSelectionState<TData>
  children: React.ReactNode
}

/**
 * 行被选中时展示的批量操作工具栏。
 *
 * @template TData 表格数据类型。
 * @param {object} props 组件属性。
 * @param {Table<TData>} props.table react-table 实例。
 * @param {string} props.entityName 当前操作的实体名称，例如“任务”或“用户”。
 * @param {React.ReactNode} props.children 工具栏中的操作按钮。
 * @returns {React.ReactNode | null} 有选中行时渲染工具栏，否则返回 null。
 */
export function DataTableBulkActions<TData>({
  table,
  entityName,
  selection,
  children,
}: DataTableBulkActionsProps<TData>): React.ReactNode | null {
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedCount = selection?.selectedRowCount ?? selectedRows.length
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [announcement, setAnnouncement] = useState('')

  // 向屏幕阅读器播报选中状态变化
  useEffect(() => {
    if (selectedCount > 0) {
      const message = `已选择 ${selectedCount} 个${entityName}，可使用批量操作工具栏。`

      // 延迟状态更新，避免级联渲染
      queueMicrotask(() => {
        setAnnouncement(message)
      })

      // 延迟清空播报内容
      const timer = setTimeout(() => setAnnouncement(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [selectedCount, entityName])

  const handleClearSelection = () => {
    if (selection) {
      selection.clearSelection()
      return
    }

    table.resetRowSelection()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const buttons = toolbarRef.current?.querySelectorAll('button')
    if (!buttons) return

    const currentIndex = Array.from(buttons).findIndex(
      (button) => button === document.activeElement
    )

    switch (event.key) {
      case 'ArrowRight': {
        event.preventDefault()
        const nextIndex = (currentIndex + 1) % buttons.length
        buttons[nextIndex]?.focus()
        break
      }
      case 'ArrowLeft': {
        event.preventDefault()
        const prevIndex =
          currentIndex === 0 ? buttons.length - 1 : currentIndex - 1
        buttons[prevIndex]?.focus()
        break
      }
      case 'Home':
        event.preventDefault()
        buttons[0]?.focus()
        break
      case 'End':
        event.preventDefault()
        buttons[buttons.length - 1]?.focus()
        break
      case 'Escape': {
        // 检查 Escape 是否来自下拉菜单触发器或内容
        // Radix UI 会先关闭下拉菜单，因此这里不能依赖下拉状态
        const target = event.target as HTMLElement
        const activeElement = document.activeElement as HTMLElement

        // 检查事件目标或当前焦点是否在下拉菜单触发器内
        const isFromDropdownTrigger =
          target?.getAttribute('data-slot') === 'dropdown-menu-trigger' ||
          activeElement?.getAttribute('data-slot') ===
            'dropdown-menu-trigger' ||
          target?.closest('[data-slot="dropdown-menu-trigger"]') ||
          activeElement?.closest('[data-slot="dropdown-menu-trigger"]')

        // 检查焦点是否在通过 portal 渲染的下拉内容内
        const isFromDropdownContent =
          activeElement?.closest('[data-slot="dropdown-menu-content"]') ||
          target?.closest('[data-slot="dropdown-menu-content"]')

        if (isFromDropdownTrigger || isFromDropdownContent) {
          // Escape 属于下拉菜单操作，不清除选择
          return
        }

        // Escape 属于工具栏操作，清除选择
        event.preventDefault()
        handleClearSelection()
        break
      }
    }
  }

  if (selectedCount === 0) {
    return null
  }

  return (
    <>
      {/* 屏幕阅读器播报区域 */}
      <div
        aria-live='polite'
        aria-atomic='true'
        className='sr-only'
        role='status'
      >
        {announcement}
      </div>

      <div
        ref={toolbarRef}
        role='toolbar'
        aria-label={`${selectedCount} 个已选择${entityName}的批量操作`}
        aria-describedby='bulk-actions-description'
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl',
          'transition-all delay-100 duration-300 ease-out hover:scale-105',
          'focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none'
        )}
      >
        <div
          className={cn(
            'p-2 shadow-xl',
            'rounded-xl border',
            'bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur-lg',
            'flex items-center gap-x-2'
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='outline'
                size='icon'
                onClick={handleClearSelection}
                className='size-6 rounded-full'
                aria-label='清除选择'
                title='清除选择（Escape）'
              >
                <X />
                <span className='sr-only'>清除选择</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>清除选择（Escape）</p>
            </TooltipContent>
          </Tooltip>

          <Separator
            className='h-5'
            orientation='vertical'
            aria-hidden='true'
          />

          <div
            className='flex items-center gap-x-1 text-sm'
            id='bulk-actions-description'
          >
            <Badge
              variant='default'
              className='min-w-8 rounded-lg'
              aria-label={`已选择 ${selectedCount} 个`}
            >
              {selectedCount}
            </Badge>{' '}
            <span className='hidden sm:inline'>个{entityName}</span> 已选择
          </div>

          <Separator
            className='h-5'
            orientation='vertical'
            aria-hidden='true'
          />

          {children}
        </div>
      </div>
    </>
  )
}
