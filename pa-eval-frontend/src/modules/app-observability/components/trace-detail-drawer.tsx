import { useState, type CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createProjectAnnotationQueue,
  createTraceAnnotationTask,
} from '@/modules/app-evaluation/api/annotation-api'
import type { AnnotationQueueFormInput } from '@/modules/app-evaluation/types'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Button } from '@/components/ui/button'
import { LLMTraceChain } from '@/components/business/llm-trace-chain'
import { Drawer } from '@/components/common/drawer'
import { Loading } from '@/components/common/loading'
import { MixEditor } from '@/components/common/MixEditor'
import {
  addProjectTracesToDatasetTarget,
  type TraceDatasetTargetInput,
} from '../api/trace-dataset-api'
import { formatDateTime, formatLatency } from '../lib/format'
import type { TraceDetail, TraceObservationDetail } from '../types'
import { CopyableText } from './copyable-text'
import { StatusBadge } from './status-badge'
import { TraceAnnotationDialog } from './trace-annotation-dialog'
import {
  TraceDatasetDialog,
  type TraceDatasetSubmitValues,
} from './trace-dataset-dialog'

const TRACE_CHAIN_DRAWER_WIDTH = 500
const TRACE_CHAIN_COLLAPSED_WIDTH = 40

type TraceDetailDrawerProps = {
  projectId: string
  traceId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TraceDetailDrawer({
  projectId,
  traceId,
  open,
  onOpenChange,
}: TraceDetailDrawerProps) {
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditTrace = can('project:trace:edit')
  const [traceChainCollapsed, setTraceChainCollapsed] = useState(false)
  const [traceChainWidth, setTraceChainWidth] = useState(
    TRACE_CHAIN_DRAWER_WIDTH
  )
  const [selectedObservationTarget, setSelectedObservationTarget] = useState<{
    traceId: string
    observationId: string
  } | null>(null)
  const selectedObservationId =
    selectedObservationTarget?.traceId === traceId
      ? selectedObservationTarget.observationId
      : null
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false)
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false)
  const queryKey = ['trace-detail', $api, projectId, traceId]
  const detailQuery = useQuery({
    queryKey,
    queryFn: () =>
      $api.getProjectTrace<TraceDetail>({
        path: { projectId, traceId: traceId ?? '' },
      }),
    enabled: open && Boolean(traceId),
  })
  const observationQuery = useQuery({
    queryKey: [
      'trace-observation-detail',
      $api,
      projectId,
      traceId,
      selectedObservationId,
    ],
    queryFn: () =>
      $api.getProjectTraceObservation<TraceObservationDetail>({
        path: {
          projectId,
          traceId: traceId ?? '',
          observationId: selectedObservationId ?? '',
        },
      }),
    enabled: open && Boolean(traceId) && Boolean(selectedObservationId),
  })
  const detail = detailQuery.data
  const selectedObservationDetail = observationQuery.data
  const showDetailLoading = open && (detailQuery.isLoading || !detail)
  const selectedPayload = selectedObservationDetail ?? detail
  const showObservationLoading =
    Boolean(selectedObservationId) && observationQuery.isFetching

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
  }

  const handleAddToDataset = async (values: TraceDatasetSubmitValues) => {
    if (!canEditTrace) return
    if (!detail) return
    const input: TraceDatasetTargetInput =
      values.mode === 'existing'
        ? {
            mode: 'existing',
            datasetId: values.datasetId,
            traceIds: [detail.traceId],
          }
        : {
            mode: 'create',
            name: values.name,
            description: values.description,
            datasetType: values.datasetType,
            traceIds: [detail.traceId],
          }
    const result = await addProjectTracesToDatasetTarget($api, projectId, input)
    await queryClient.invalidateQueries({ queryKey: ['project-datasets'] })
    toast.success(`已加入 ${result.successCount} 条 Trace`)
  }

  const handleCreateAnnotationTask = async (queueId: string) => {
    if (!canEditTrace) return
    if (!detail) return
    const result = await createTraceAnnotationTask($api, projectId, [
      detail.traceId,
    ], { queueId })
    await queryClient.invalidateQueries({
      queryKey: ['project-annotation-queues', projectId],
    })
    toast.success(
      `已加入人工标注队列：新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`
    )
  }

  const handleCreateAnnotationQueueAndTask = async (
    input: AnnotationQueueFormInput
  ) => {
    if (!canEditTrace) return
    if (!detail) return
    const queue = await createProjectAnnotationQueue($api, projectId, input)
    const result = await createTraceAnnotationTask($api, projectId, [
      detail.traceId,
    ], { queueId: queue.id })
    await queryClient.invalidateQueries({
      queryKey: ['project-annotation-queues', projectId],
    })
    toast.success(
      `已创建标注任务：新增 ${result.createdCount} 条，跳过 ${result.skippedCount} 条`
    )
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        void close(nextOpen)
      }}
      width='clamp(64rem, 70vw, 96rem)'
      showOverlay={false}
      mode='enhanced'
      title={detail ? `Trace 详情：${detail.traceId}` : 'Trace 详情'}
      showConfirm={false}
      cancelText='关闭'
      actions={
        <div className='flex items-center gap-2'>
          {canEditTrace ? (
            <>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={!detail}
                onClick={() => setDatasetDialogOpen(true)}
              >
                加入数据集
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={!detail}
                onClick={() => setAnnotationDialogOpen(true)}
              >
                加入标注任务
              </Button>
            </>
          ) : null}
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => {
              close(false)
            }}
          >
            关闭
          </Button>
        </div>
      }
      contentProps={{
        className: 'overflow-y-auto',
      }}
    >
      {!open ? null : showDetailLoading ? (
        <div className='p-4'>
          <Loading text='加载 Trace 详情中...' className='min-h-[520px]' />
        </div>
      ) : detail ? (
        <div className='flex flex-col gap-4 p-4'>
          <TraceOverview detail={detail} />

          <div
            className='grid items-stretch gap-4 xl:grid-cols-[var(--trace-chain-current-column-width)_minmax(0,1fr)]'
            style={
              {
                '--trace-chain-current-column-width': traceChainCollapsed
                  ? `${TRACE_CHAIN_COLLAPSED_WIDTH}px`
                  : `${traceChainWidth}px`,
              } as CSSProperties
            }
          >
            <LLMTraceChain
              data={detail.callChain}
              width={traceChainWidth}
              collapsedWidth={TRACE_CHAIN_COLLAPSED_WIDTH}
              height='100%'
              isCollapsed={traceChainCollapsed}
              onCollapsedChange={setTraceChainCollapsed}
              onWidthChange={setTraceChainWidth}
              onNodeClick={(node) => {
                if (!traceId) return
                setSelectedObservationTarget({
                  traceId,
                  observationId: node.id,
                })
              }}
              summary={{ duration: formatLatency(detail.latency) }}
            />
            <div className='min-w-0 flex h-full flex-col gap-3'>
              {showObservationLoading ? (
                <Loading
                  text='加载节点详情中...'
                  className='min-h-24 border bg-transparent'
                />
              ) : null}
              <MixEditor
                title='Input'
                value={selectedPayload?.input ?? ''}
                readOnly
              />
              <MixEditor
                title='Output'
                value={selectedPayload?.output ?? ''}
                readOnly
              />
              <MixEditor
                title='Metadata'
                value={selectedPayload?.metadata ?? {}}
                readOnly
              />
              <MixEditor
                title='Scores'
                value={selectedPayload?.scores ?? []}
                readOnly
              />
            </div>
          </div>
        </div>
      ) : null}
      {detail ? (
        <>
          <TraceDatasetDialog
            open={canEditTrace && datasetDialogOpen}
            projectId={projectId}
            projectName={detail.projectName || projectId}
            traces={[detail]}
            onOpenChange={setDatasetDialogOpen}
            onSubmit={handleAddToDataset}
          />
          <TraceAnnotationDialog
            open={canEditTrace && annotationDialogOpen}
            projectId={projectId}
            projectName={detail.projectName || projectId}
            traces={[detail]}
            onOpenChange={setAnnotationDialogOpen}
            onSubmitExisting={handleCreateAnnotationTask}
            onSubmitNew={handleCreateAnnotationQueueAndTask}
          />
        </>
      ) : null}
    </Drawer>
  )
}

function TraceOverview({ detail }: { detail: TraceDetail }) {
  return (
    <div className='grid gap-3 rounded-lg border p-3 text-sm md:grid-cols-2 xl:grid-cols-4'>
      <div>
        <p className='text-muted-foreground text-sm'>Trace ID</p>
        <CopyableText value={detail.traceId} className='text-sm' />
      </div>
      <div>
        <p className='text-muted-foreground text-sm'>状态</p>
        <StatusBadge status={detail.status} className='text-sm' />
      </div>
      <div>
        <p className='text-muted-foreground text-sm'>环境</p>
        <p className='text-sm'>{detail.environment}</p>
      </div>
      <div>
        <p className='text-muted-foreground text-sm'>延迟</p>
        <p className='text-sm tabular-nums'>{formatLatency(detail.latency)}</p>
      </div>
      <div>
        <p className='text-muted-foreground text-sm'>Session ID</p>
        <CopyableText value={detail.sessionId} className='text-sm' />
      </div>
      <div>
        <p className='text-muted-foreground text-sm'>创建时间</p>
        <p className='text-sm'>{formatDateTime(detail.createdAt)}</p>
      </div>
      <div>
        <p className='text-muted-foreground text-sm'>更新时间</p>
        <p className='text-sm'>{formatDateTime(detail.updatedAt)}</p>
      </div>
    </div>
  )
}
