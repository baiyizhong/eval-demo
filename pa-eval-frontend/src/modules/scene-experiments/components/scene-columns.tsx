import type { ColumnDef } from '@tanstack/react-table'
import { formatDateTime } from '@/modules/app-evaluation/components/format'
import {
  MoreHorizontal,
  Power,
  PowerOff,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTableColumnHeader } from '@/components/common/data-table'
import type { SceneRecord } from '../types'
import { SceneStatusBadge } from './scene-status-badge'

type SceneColumnOptions = {
  projectId: string
  readOnly?: boolean
  pendingSceneAction?: {
    sceneId: string
    action: 'toggle' | 'delete'
  } | null
  onEdit: (scene: SceneRecord) => void
  onToggle: (scene: SceneRecord) => void
  onDelete: (scene: SceneRecord) => void
}

export function createSceneColumns({
  projectId,
  readOnly = false,
  pendingSceneAction,
  onEdit,
  onToggle,
  onDelete,
}: SceneColumnOptions): ColumnDef<SceneRecord>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='场景名称' />
      ),
      cell: ({ row }) => (
        <div className='flex max-w-72 flex-col gap-1'>
          <Link
            className='truncate font-medium underline-offset-4 hover:underline'
            to={`/projects/${projectId}/scenes/${row.original.id}`}
          >
            {row.original.name}
          </Link>
          <SceneStatusBadge enabled={row.original.enabled} />
        </div>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='描述' />
      ),
      cell: ({ row }) => (
        <span className='text-muted-foreground block max-w-80 truncate text-xs'>
          {row.original.description || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'enabled',
      header: '状态',
      cell: ({ row }) => <SceneStatusBadge enabled={row.original.enabled} />,
      enableHiding: true,
    },
    {
      id: 'webhooks',
      header: '远程运行',
      cell: ({ row }) => `${row.original.webhooks.length} 个服务`,
    },
    {
      id: 'runParameters',
      header: '运行参数',
      cell: ({ row }) => {
        const parameters = row.original.runParameters
        return (
          <span className='text-muted-foreground text-xs'>
            并发 {parameters.concurrency} · {parameters.timeoutSeconds}s ·{' '}
            {parameters.rounds} 轮
          </span>
        )
      },
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='更新时间' />
      ),
      cell: ({ row }) => formatDateTime(row.original.updatedAt),
    },
    ...(readOnly
      ? []
      : [
          {
            id: 'actions',
            enableHiding: false,
            cell: ({ row }) => {
              const pending = Boolean(pendingSceneAction)
              return (
                <div className='flex justify-end'>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        aria-label='打开场景操作菜单'
                        disabled={pending}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          disabled={pending}
                          onSelect={() => onEdit(row.original)}
                        >
                          <SquarePen />
                          编辑场景
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={pending}
                          onSelect={() => onToggle(row.original)}
                        >
                          {row.original.enabled ? <PowerOff /> : <Power />}
                          {row.original.enabled ? '停用场景' : '启用场景'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant='destructive'
                          disabled={pending}
                          onSelect={() => onDelete(row.original)}
                        >
                          <Trash2 />
                          删除场景
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            },
          } satisfies ColumnDef<SceneRecord>,
        ]),
  ]
}
