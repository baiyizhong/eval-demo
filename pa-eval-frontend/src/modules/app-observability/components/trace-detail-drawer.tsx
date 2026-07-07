import { useMemo, useState, type CSSProperties } from 'react'
import { z } from 'zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { JsonData } from 'json-edit-react'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { LLMTraceChain } from '@/components/business/llm-trace-chain'
import { Drawer } from '@/components/common/drawer'
import { JsonEditorPanel } from '@/components/common/json-editor'
import { Loading } from '@/components/common/loading'
import { MarkdownEditorPanel } from '@/components/common/markdown-editor'
import { formatDateTime, formatLatency } from '../lib/format'
import type { TraceDetail } from '../types'
import { CopyableText } from './copyable-text'
import { StatusBadge } from './status-badge'
import { TRACE_METADATA_JSON_EDITOR_CONFIG } from './trace-detail-drawer-config'

const metadataSchema = z.record(z.string(), z.unknown())
const TRACE_CHAIN_DRAWER_WIDTH = 400
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
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [metadataData, setMetadataData] = useState<JsonData>({})
  const [traceChainCollapsed, setTraceChainCollapsed] = useState(false)
  const queryKey = ['trace-detail', $api, projectId, traceId]
  const detailQuery = useQuery({
    queryKey,
    queryFn: () =>
      $api.getProjectTrace<TraceDetail>({
        path: { projectId, traceId: traceId ?? '' },
      }),
    enabled: open && Boolean(traceId),
  })
  const detail = detailQuery.data
  const showDetailLoading = open && (detailQuery.isLoading || !detail)
  const dirty = useMemo(() => {
    if (!detail) return false

    return (
      input !== detail.input ||
      output !== detail.output ||
      JSON.stringify(metadataData) !== JSON.stringify(detail.metadata)
    )
  }, [detail, input, metadataData, output])

  const startEdit = () => {
    if (!detail) return

    setInput(detail.input)
    setOutput(detail.output)
    setMetadataData(detail.metadata)
    setEditing(true)
  }

  const cancelEdit = async () => {
    if (
      dirty &&
      !(await confirm({
        title: '放弃未保存修改',
        desc: '当前 Trace 编辑内容尚未保存，确认放弃这些修改吗？',
        confirmText: '放弃修改',
        destructive: true,
      }))
    ) {
      return
    }

    if (detail) {
      setInput(detail.input)
      setOutput(detail.output)
      setMetadataData(detail.metadata)
    }
    setEditing(false)
  }

  const save = async () => {
    if (!detail) return

    if (
      !metadataData ||
      typeof metadataData !== 'object' ||
      Array.isArray(metadataData)
    ) {
      toast.error('metadata 必须是合法 JSON 对象')
      return
    }

    const result = metadataSchema.safeParse(metadataData)
    if (!result.success) {
      toast.error('metadata 必须是合法 JSON 对象')
      return
    }

    setSaving(true)
    try {
      const nextDetail = await $api.patchProjectTrace<TraceDetail>({
        path: { projectId, traceId: detail.traceId },
        body: {
          input,
          output,
          metadata: result.data,
        },
      })
      queryClient.setQueryData(queryKey, nextDetail)
      setMetadataData(nextDetail.metadata)
      setEditing(false)
      toast.success('Trace 已保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const close = async (nextOpen: boolean) => {
    if (
      !nextOpen &&
      editing &&
      dirty &&
      !(await confirm({
        title: '关闭 Trace 详情',
        desc: '当前 Trace 编辑内容尚未保存，确认关闭抽屉并放弃修改吗？',
        confirmText: '关闭并放弃',
        destructive: true,
      }))
    ) {
      return
    }

    if (!nextOpen) {
      setEditing(false)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        void close(nextOpen)
      }}
      mode='enhanced'
      title={detail ? `Trace 详情：${detail.traceId}` : 'Trace 详情'}
      showConfirm={false}
      cancelText='关闭'
      actions={
        <div className='flex items-center gap-2'>
          {editing ? (
            <>
              <Button type='button' size='sm' disabled={saving} onClick={save}>
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => {
                  void cancelEdit()
                }}
              >
                取消
              </Button>
            </>
          ) : (
            <>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={!detail}
                onClick={startEdit}
              >
                编辑
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => {
                  void close(false)
                }}
              >
                关闭
              </Button>
            </>
          )}
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

          {editing ? (
            <div className='grid gap-4 xl:grid-cols-2'>
              <MarkdownEditorPanel
                title='Input'
                value={input}
                onValueChange={setInput}
                defaultMode='edit'
                readOnly={false}
                height={260}
              />
              <MarkdownEditorPanel
                title='Output'
                value={output}
                onValueChange={setOutput}
                defaultMode='edit'
                readOnly={false}
                height={260}
              />
              <JsonEditorPanel
                {...TRACE_METADATA_JSON_EDITOR_CONFIG}
                data={metadataData}
                onDataChange={setMetadataData}
                height={360}
                className='xl:col-span-2'
              />
            </div>
          ) : (
            <div
              className='grid items-stretch gap-4 xl:grid-cols-[var(--trace-chain-current-column-width)_minmax(0,1fr)]'
              style={
                {
                  '--trace-chain-current-column-width': traceChainCollapsed
                    ? `${TRACE_CHAIN_COLLAPSED_WIDTH}px`
                    : `${TRACE_CHAIN_DRAWER_WIDTH}px`,
                } as CSSProperties
              }
            >
              <LLMTraceChain
                data={detail.callChain}
                width={TRACE_CHAIN_DRAWER_WIDTH}
                collapsedWidth={TRACE_CHAIN_COLLAPSED_WIDTH}
                height='100%'
                isCollapsed={traceChainCollapsed}
                onCollapsedChange={setTraceChainCollapsed}
                summary={{ duration: formatLatency(detail.latency) }}
              />
              <div className='flex h-full flex-col gap-3'>
                <MarkdownEditorPanel
                  title='Input'
                  value={detail.input}
                  mode='preview'
                  readOnly
                  height={180}
                />
                <MarkdownEditorPanel
                  title='Output'
                  value={detail.output}
                  mode='preview'
                  readOnly
                  height={180}
                />
                <JsonEditorPanel
                  {...TRACE_METADATA_JSON_EDITOR_CONFIG}
                  data={detail.metadata}
                  readOnly
                  height={220}
                />
              </div>
            </div>
          )}
        </div>
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
