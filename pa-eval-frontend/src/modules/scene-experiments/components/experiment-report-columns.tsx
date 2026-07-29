import type { ColumnDef } from '@tanstack/react-table'
import { formatDateTime } from '@/modules/app-evaluation/components/format'
import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTableColumnHeader } from '@/components/common/data-table'
import {
  buildExperimentReportHref,
  type ExperimentNavigationSource,
} from '../lib/experiment-navigation'
import {
  findMatchingBaseline,
  isCurrentBaselineReport,
} from '../lib/experiment-rules'
import type { ExperimentReport, ExperimentReportBaseline } from '../types'
import { ExperimentStatusBadge } from './experiment-status-badge'

type ExperimentReportColumnOptions<TReport extends ExperimentReport> = {
  projectId: string
  source: ExperimentNavigationSource
  baselines: ExperimentReportBaseline[]
  showDataset?: boolean
  getDatasetName?: (report: TReport) => string
  getBaselineUnavailableReason?: (report: TReport) => string | undefined
  onSetBaseline: (report: TReport) => void
  onCompareBaseline: (
    report: TReport,
    baseline: ExperimentReportBaseline
  ) => void
}

export function createExperimentReportColumns<TReport extends ExperimentReport>(
  options: ExperimentReportColumnOptions<TReport>
): ColumnDef<TReport>[] {
  const columns = createBaseExperimentReportColumns(options)

  if (options.showDataset) {
    columns.splice(2, 0, {
      id: 'datasetName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='数据集' />
      ),
      cell: ({ row }) => options.getDatasetName?.(row.original) ?? '-',
    })
  }

  return columns
}

function createBaseExperimentReportColumns<TReport extends ExperimentReport>(
  options: ExperimentReportColumnOptions<TReport>
): ColumnDef<TReport>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          aria-label='选择本页已完成报告'
          onCheckedChange={(value) =>
            table.getRowModel().rows.forEach((row) => {
              if (row.original.status === 'COMPLETED') {
                row.toggleSelected(Boolean(value))
              }
            })
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={row.original.status !== 'COMPLETED'}
          aria-label={`选择报告 ${row.original.name}`}
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        />
      ),
      enableHiding: false,
      enableSorting: false,
      meta: { thClassName: 'w-10', tdClassName: 'w-10' },
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='试验名称' />
      ),
      cell: ({ row }) => (
        <div className='flex max-w-80 flex-col gap-1'>
          <Link
            className='truncate font-medium underline-offset-4 hover:underline'
            to={buildExperimentReportHref({
              projectId: options.projectId,
              datasetId: row.original.datasetId,
              reportId: row.original.id,
              source: options.source,
            })}
          >
            {row.original.name}
          </Link>
          <span className='text-muted-foreground truncate text-xs'>
            {row.original.experimentName}
          </span>
        </div>
      ),
      enableHiding: false,
    },
    {
      id: 'service',
      header: 'Webhook 服务',
      cell: ({ row }) => (
        <div className='flex flex-col gap-1'>
          <span className='font-medium'>
            {row.original.webhookSnapshot.name}
          </span>
          <span className='text-muted-foreground text-xs'>
            {row.original.webhookSnapshot.serviceFamily} · v
            {row.original.webhookSnapshot.version}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <div className='flex min-w-28 flex-col gap-2'>
          <ExperimentStatusBadge status={row.original.status} />
          {row.original.status === 'RUNNING' ||
          row.original.status === 'SCORING' ? (
            <div
              className='bg-muted h-1.5 overflow-hidden rounded-full'
              role='progressbar'
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={row.original.progress}
            >
              <div
                className='bg-primary h-full rounded-full transition-[width]'
                style={{ width: `${row.original.progress}%` }}
              />
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: 'rounds',
      header: '执行轮次',
      cell: ({ row }) => `${row.original.runParameters.rounds} 轮`,
    },
    {
      id: 'scores',
      header: '评分结果',
      cell: ({ row }) =>
        row.original.scoreResults.length ? (
          <div className='flex max-w-96 flex-wrap gap-1.5'>
            {row.original.scoreResults.slice(0, 3).map((score) => (
              <Badge key={score.key} variant='outline'>
                {score.scoreName} {score.value.toFixed(3)}
              </Badge>
            ))}
            {row.original.scoreResults.length > 3 ? (
              <Badge variant='secondary'>
                +{row.original.scoreResults.length - 3}
              </Badge>
            ) : null}
          </div>
        ) : (
          <span className='text-muted-foreground text-xs'>等待评分</span>
        ),
    },
    {
      accessorKey: 'completedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='完成时间' />
      ),
      cell: ({ row }) =>
        row.original.completedAt
          ? formatDateTime(row.original.completedAt)
          : '-',
    },
    {
      id: 'actions',
      header: () => <div className='text-center'>操作</div>,
      cell: ({ row }) => {
        const report = row.original
        if (report.status !== 'COMPLETED') return null

        const unavailableReason = options.getBaselineUnavailableReason?.(report)
        const baseline = findMatchingBaseline(options.baselines, report)
        if (isCurrentBaselineReport(report.id, baseline)) {
          return (
            <div className='flex justify-center'>
              <Button
                type='button'
                size='sm'
                variant='secondary'
                className='h-[30px] w-[94px]'
                disabled
              >
                当前基线
              </Button>
            </div>
          )
        }

        return baseline && !unavailableReason ? (
          <div className='flex justify-center'>
            <div className='flex h-[30px] w-[94px] overflow-hidden rounded-md shadow-xs'>
              <Button
                type='button'
                size='sm'
                className='h-[30px] min-w-0 flex-1 rounded-e-none px-2'
                onClick={() => options.onCompareBaseline(report, baseline)}
              >
                对比基线
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type='button'
                    size='sm'
                    className='border-primary-foreground/25 h-[30px] w-7 rounded-s-none border-s px-0'
                    aria-label={`更多基线操作 ${report.name}`}
                  >
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem
                    onSelect={() => options.onSetBaseline(report)}
                  >
                    设为新基线
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : (
          <div className='flex justify-center'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              className='h-[30px] w-[94px]'
              disabled={Boolean(unavailableReason)}
              onClick={() => options.onSetBaseline(report)}
            >
              {unavailableReason ?? '设为基线'}
            </Button>
          </div>
        )
      },
      enableHiding: false,
      enableSorting: false,
      meta: {
        thClassName: 'w-[118px]',
        tdClassName: 'w-[118px]',
      },
    },
  ]
}
