import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getProjectDataset } from '@/modules/app-evaluation/api/dataset-api'
import { DatasetTypeBadge } from '@/modules/app-evaluation/components/dataset-type-badge'
import { formatDateTime } from '@/modules/app-evaluation/components/format'
import { Power, PowerOff, SquarePen } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import {
  getProjectScene,
  patchProjectScene,
  saveProjectScene,
} from '../api/scene-experiment-api'
import { SceneFormDrawer } from '../components/scene-form-drawer'
import { SceneStatusBadge } from '../components/scene-status-badge'
import { buildProjectScenesHref } from '../lib/experiment-run'
import { listProjectEvaluators } from '../lib/project-evaluators'
import type { SceneFormInput } from '../types'

export function ProjectSceneDetail() {
  const navigate = useNavigate()
  const { projectId = 'proj_a', sceneId = '' } = useParams()
  const $api = useAPI()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditScene = can('project:dataset:edit')
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const sceneQuery = useQuery({
    queryKey: ['project-scene', $api, projectId, sceneId],
    queryFn: () => getProjectScene($api, projectId, sceneId),
    enabled: Boolean(sceneId),
  })
  const datasetQuery = useQuery({
    queryKey: [
      'scene-default-dataset',
      $api,
      projectId,
      sceneQuery.data?.datasetId,
    ],
    queryFn: () =>
      getProjectDataset($api, projectId, sceneQuery.data!.datasetId),
    enabled: Boolean(sceneQuery.data?.datasetId),
  })
  const evaluatorsQuery = useQuery({
    queryKey: ['scene-detail-evaluators', $api, projectId],
    queryFn: () => listProjectEvaluators($api, projectId),
    enabled: Boolean(sceneQuery.data),
  })
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['project-scene', $api, projectId, sceneId],
    })
  const saveMutation = useMutation({
    mutationFn: (input: SceneFormInput) =>
      saveProjectScene($api, projectId, input, sceneId),
    onSuccess: async () => {
      await invalidate()
      await queryClient.invalidateQueries({
        queryKey: ['project-scenes', $api, projectId],
      })
      setEditOpen(false)
      toast.success('场景已更新')
    },
  })
  const toggleMutation = useMutation({
    mutationFn: () =>
      patchProjectScene($api, projectId, sceneId, {
        enabled: !sceneQuery.data?.enabled,
      }),
    onSuccess: async (scene) => {
      await invalidate()
      toast.success(scene.enabled ? '场景已启用' : '场景已停用')
    },
  })

  const scene = sceneQuery.data
  const defaultEvaluators = (evaluatorsQuery.data ?? []).filter((evaluator) =>
    scene?.evaluatorIds?.includes(evaluator.id)
  )
  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() => navigate(buildProjectScenesHref(projectId))}
          actions={
            scene && canEditScene ? (
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => void toggleMutation.mutateAsync()}
                >
                  {scene.enabled ? (
                    <PowerOff data-icon='inline-start' />
                  ) : (
                    <Power data-icon='inline-start' />
                  )}
                  {scene.enabled ? '停用' : '启用'}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  onClick={() => setEditOpen(true)}
                >
                  <SquarePen data-icon='inline-start' />
                  编辑场景
                </Button>
              </div>
            ) : null
          }
        >
          <span className='font-medium'>场景详情</span>
        </PageAction>
        {sceneQuery.isLoading ? <Loading text='加载场景详情中...' /> : null}
        {scene ? (
          <>
            <section className='bg-card rounded-lg border p-5'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <h1 className='truncate text-xl font-semibold'>
                    {scene.name}
                  </h1>
                  <p className='text-muted-foreground mt-1'>
                    {scene.description || '暂无描述'}
                  </p>
                </div>
                <SceneStatusBadge enabled={scene.enabled} />
              </div>
              <dl className='mt-5 grid gap-4 text-sm sm:grid-cols-3'>
                <Detail
                  label='创建时间'
                  value={formatDateTime(scene.createdAt)}
                />
                <Detail
                  label='最近更新'
                  value={formatDateTime(scene.updatedAt)}
                />
                <Detail
                  label='配置规模'
                  value={`${scene.webhooks.length} 个服务`}
                />
              </dl>
            </section>
            <section className='bg-card rounded-lg border p-5'>
              <h2 className='text-sm font-semibold'>默认试验配置</h2>
              <dl className='mt-3 grid gap-4 text-sm sm:grid-cols-2'>
                <Detail
                  label='默认数据集'
                  value={datasetQuery.data?.name ?? scene.datasetId}
                />
                <Detail
                  label='数据集类型'
                  value={
                    datasetQuery.data ? (
                      <DatasetTypeBadge type={datasetQuery.data.type} />
                    ) : (
                      '-'
                    )
                  }
                />
                <Detail
                  label='默认评估器'
                  value={
                    defaultEvaluators.map((item) => item.name).join('、') || '-'
                  }
                />
                <Detail
                  label='评估器数量'
                  value={`${scene.evaluatorIds?.length ?? 0} 个`}
                />
              </dl>
            </section>
            <section className='bg-card rounded-lg border p-5'>
              <h2 className='text-sm font-semibold'>
                远程运行服务（{scene.webhooks.length}）
              </h2>
              <div className='mt-3 overflow-x-auto'>
                <table className='w-full min-w-[760px] text-sm'>
                  <thead className='text-muted-foreground border-b text-left text-xs'>
                    <tr>
                      <th className='py-2'>服务</th>
                      <th>URL</th>
                      <th>鉴权</th>
                      <th>系列 / 版本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scene.webhooks.map((webhook) => (
                      <tr key={webhook.id} className='border-b last:border-0'>
                        <td className='py-3'>
                          <div className='font-medium'>{webhook.name}</div>
                          <div className='text-muted-foreground text-xs'>
                            {webhook.description}
                          </div>
                        </td>
                        <td className='max-w-96 truncate'>{webhook.url}</td>
                        <td>
                          <Badge variant='secondary'>{webhook.authType}</Badge>
                        </td>
                        <td>
                          {webhook.serviceFamily} / {webhook.version}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className='bg-card rounded-lg border p-5'>
              <h2 className='text-sm font-semibold'>默认运行参数</h2>
              <dl className='mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
                <Metric
                  label='并发数'
                  value={String(scene.runParameters.concurrency)}
                />
                <Metric
                  label='超时时间'
                  value={`${scene.runParameters.timeoutSeconds} 秒`}
                />
                <Metric
                  label='重试次数'
                  value={`${scene.runParameters.retryCount} 次`}
                />
                <Metric
                  label='默认执行轮次'
                  value={`${scene.runParameters.rounds} 轮`}
                />
              </dl>
            </section>
          </>
        ) : null}
      </div>
      <SceneFormDrawer
        open={canEditScene && editOpen}
        projectId={projectId}
        scene={scene}
        onOpenChange={setEditOpen}
        onSubmit={(input) =>
          canEditScene
            ? saveMutation.mutateAsync(input).then(() => undefined)
            : Promise.resolve()
        }
      />
    </Page>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className='mt-1 font-medium'>{value}</dd>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className='bg-muted/40 rounded-md border p-4'>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className='mt-1 text-lg font-semibold'>{value}</dd>
    </div>
  )
}
