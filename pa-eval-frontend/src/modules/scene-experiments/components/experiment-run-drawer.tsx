import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  getProjectDataset,
  getProjectDatasetMetricSummary,
} from '@/modules/app-evaluation/api/dataset-api'
import type { DatasetRecord } from '@/modules/app-evaluation/types'
import type { TaskEvaluatorRecord } from '@/modules/tasks/api/evaluator-api'
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  ServerCog,
  TriangleAlert,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Drawer } from '@/components/common/drawer'
import { Loading } from '@/components/common/loading'
import { Stepper } from '@/components/common/stepper'
import {
  createDatasetExperiment,
  listAvailableScenes,
} from '../api/scene-experiment-api'
import { estimateExperimentCalls } from '../lib/experiment-rules'
import {
  applyExperimentDatasetSelection,
  applyExperimentSceneSelection,
  buildProjectDatasetsHref,
  buildProjectScenesHref,
  clearExperimentDatasetPickerParams,
  getDatasetSubmitBlockReason,
  type DatasetMetricStatus,
} from '../lib/experiment-run'
import {
  filterSceneBoundEvaluators,
  listActiveProjectEvaluators,
} from '../lib/project-evaluators'
import type {
  CreateExperimentInput,
  ExperimentReport,
  SceneRecord,
  SceneRunParameters,
  SceneWebhookService,
} from '../types'
import {
  ExperimentDatasetStep,
  type LockedExperimentDataset,
} from './experiment-dataset-step'
import {
  ExperimentRunParametersStep,
  ExperimentWebhookStep,
} from './experiment-execution-step'
import { ExperimentSelectableCard } from './experiment-selectable-card'

const experimentSteps = [
  { id: 'scene', title: '选择场景', description: '试验信息与模板' },
  { id: 'dataset', title: '选择数据集', description: '确定试验数据' },
  { id: 'webhook', title: 'Webhook 服务配置', description: '选择执行服务' },
  { id: 'evaluator', title: '选择评估器', description: '评分维度' },
  { id: 'parameters', title: '运行参数配置', description: '本次执行参数' },
  { id: 'summary', title: '确认执行', description: '汇总并提交' },
]

const defaultParameters: SceneRunParameters = {
  concurrency: 5,
  timeoutSeconds: 30,
  retryCount: 2,
  rounds: 1,
}

type DetailTarget =
  | { type: 'webhook'; value: SceneWebhookService }
  | { type: 'evaluator'; value: TaskEvaluatorRecord }
  | null

type ExperimentRunDrawerProps = {
  open: boolean
  projectId: string
  lockedDataset?: LockedExperimentDataset
  onOpenChange: (open: boolean) => void
  onCreated: (reports: ExperimentReport[]) => void | Promise<void>
}

export function ExperimentRunDrawer({
  open,
  ...props
}: ExperimentRunDrawerProps) {
  if (!open) return null

  return <ExperimentRunDrawerContent open {...props} />
}

function ExperimentRunDrawerContent({
  open,
  projectId,
  lockedDataset,
  onOpenChange,
  onCreated,
}: ExperimentRunDrawerProps) {
  const $api = useAPI()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sceneId, setSceneId] = useState('')
  const [selectedDataset, setSelectedDataset] = useState<DatasetRecord | null>(
    lockedDataset?.dataset ?? null
  )
  const [selectedWebhookIds, setSelectedWebhookIds] = useState<string[]>([])
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<string[]>([])
  const [runParameters, setRunParameters] =
    useState<SceneRunParameters>(defaultParameters)
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null)
  const sceneSelectionRef = useRef(0)

  const scenesQuery = useQuery({
    queryKey: ['available-scenes', $api, projectId],
    queryFn: () => listAvailableScenes($api, projectId),
    enabled: open,
  })
  const evaluatorsQuery = useQuery({
    queryKey: ['experiment-evaluators', $api, projectId],
    queryFn: () => listActiveProjectEvaluators($api, projectId),
    enabled: open,
  })
  const metricQuery = useQuery({
    queryKey: [
      'experiment-dataset-metrics',
      $api,
      projectId,
      selectedDataset?.id,
    ],
    queryFn: () =>
      getProjectDatasetMetricSummary($api, projectId, selectedDataset!.id),
    enabled: open && !lockedDataset && Boolean(selectedDataset),
  })
  const scenes = scenesQuery.data?.datas ?? []
  const selectedScene = scenes.find((scene) => scene.id === sceneId)
  const projectEvaluators = evaluatorsQuery.data ?? []
  const sceneEvaluators = filterSceneBoundEvaluators(
    projectEvaluators,
    selectedScene?.evaluatorIds ?? []
  )
  const sceneEvaluatorIds = new Set(sceneEvaluators.map((item) => item.id))
  const validSelectedEvaluatorIds = selectedEvaluatorIds.filter((id) =>
    sceneEvaluatorIds.has(id)
  )
  const metricStatus: DatasetMetricStatus = lockedDataset
    ? 'ready'
    : !selectedDataset
      ? 'idle'
      : metricQuery.isPending
        ? 'pending'
        : metricQuery.isError
          ? 'error'
          : 'ready'
  const activeItemCount =
    lockedDataset?.activeItemCount ?? metricQuery.data?.active

  useEffect(() => {
    if (scenesQuery.isError) toast.error('场景加载失败，请重试')
  }, [scenesQuery.isError])

  useEffect(() => {
    if (evaluatorsQuery.isError) toast.error('评估器加载失败，请重试')
  }, [evaluatorsQuery.isError])

  useEffect(() => {
    if (metricQuery.isError) toast.error('所选数据集指标加载失败，请重试')
  }, [metricQuery.isError])

  useEffect(() => {
    setSearchParams((current) => clearExperimentDatasetPickerParams(current), {
      replace: true,
    })
  }, [setSearchParams])

  const createMutation = useMutation({
    mutationFn: (input: CreateExperimentInput) =>
      createDatasetExperiment($api, projectId, selectedDataset!.id, input),
    onSuccess: async (result) => {
      toast.success(`试验已提交，已创建 ${result.reports.length} 份服务级报告`)
      await onCreated(result.reports)
      closeDrawer(true)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, '试验提交失败'))
    },
  })

  const handleSceneChange = async (nextSceneId: string) => {
    const nextScene = scenes.find((scene) => scene.id === nextSceneId)
    if (!nextScene) return
    const selectionRequestId = sceneSelectionRef.current + 1
    sceneSelectionRef.current = selectionRequestId
    const nextState = applyExperimentSceneSelection(
      {
        sceneId,
        selectedDatasetId: selectedDataset?.id ?? '',
        selectedWebhookIds,
        selectedEvaluatorIds,
        runParameters,
      },
      nextSceneId,
      {
        datasetId: nextScene.datasetId ?? '',
        runParameters: nextScene.runParameters ?? defaultParameters,
      },
      { lockDataset: Boolean(lockedDataset) }
    )
    setSceneId(nextState.sceneId)
    setSelectedWebhookIds(nextState.selectedWebhookIds)
    setSelectedEvaluatorIds(nextState.selectedEvaluatorIds)
    setRunParameters(nextState.runParameters)
    if (lockedDataset) return
    if (!nextState.selectedDatasetId) {
      setSelectedDataset(null)
      return
    }
    setSelectedDataset(null)
    try {
      const dataset = await getProjectDataset(
        $api,
        projectId,
        nextState.selectedDatasetId
      )
      if (sceneSelectionRef.current === selectionRequestId) {
        setSelectedDataset(dataset)
      }
    } catch {
      if (sceneSelectionRef.current === selectionRequestId) {
        toast.error('场景默认数据集加载失败，请手动选择数据集')
      }
    }
  }

  const handleDatasetChange = (dataset: DatasetRecord) => {
    const nextState = applyExperimentDatasetSelection(
      {
        sceneId,
        selectedDatasetId: selectedDataset?.id ?? '',
        selectedWebhookIds,
        selectedEvaluatorIds,
        runParameters,
      },
      dataset.id
    )
    setSelectedDataset(dataset)
    setSceneId(nextState.sceneId)
    setSelectedWebhookIds(nextState.selectedWebhookIds)
    setSelectedEvaluatorIds(nextState.selectedEvaluatorIds)
    setRunParameters(nextState.runParameters)
  }

  const validateStep = (targetStep: number) => {
    if (targetStep <= step) return true
    if (targetStep > 0 && (!name.trim() || !sceneId)) {
      toast.error('请输入试验名称并选择场景')
      setStep(0)
      return false
    }
    if (targetStep > 1 && !selectedDataset) {
      toast.error('请选择一个数据集')
      setStep(1)
      return false
    }
    if (targetStep > 2 && selectedWebhookIds.length === 0) {
      toast.error('请至少选择一个 Webhook 服务')
      setStep(2)
      return false
    }
    if (targetStep > 3 && validSelectedEvaluatorIds.length === 0) {
      toast.error('请至少选择一个评估器')
      setStep(3)
      return false
    }
    if (targetStep > 4 && !parametersAreValid(runParameters)) {
      toast.error('请检查本次试验的运行参数范围')
      setStep(4)
      return false
    }
    if (targetStep >= experimentSteps.length) {
      const blockReason = getDatasetSubmitBlockReason({
        hasSelectedDataset: Boolean(selectedDataset),
        metricStatus,
        activeItemCount,
      })
      if (blockReason) {
        toast.error(blockReason)
        setStep(1)
        return false
      }
    }
    return true
  }

  const handleSubmit = () => {
    if (
      createMutation.isPending ||
      !validateStep(experimentSteps.length) ||
      !selectedScene ||
      !selectedDataset
    ) {
      return
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      sceneId: selectedScene.id,
      webhookIds: selectedWebhookIds,
      evaluatorIds: validSelectedEvaluatorIds,
      runParameters,
    })
  }

  const selectedWebhooks =
    selectedScene?.webhooks.filter((webhook) =>
      selectedWebhookIds.includes(webhook.id)
    ) ?? []
  const selectedEvaluators = sceneEvaluators.filter((evaluator) =>
    validSelectedEvaluatorIds.includes(evaluator.id)
  )
  const estimatedCalls = estimateExperimentCalls(
    activeItemCount ?? 0,
    selectedWebhookIds.length,
    runParameters.rounds
  )
  const closeDrawer = (allowPending = false) => {
    if (createMutation.isPending && !allowPending) return
    setSearchParams((current) => clearExperimentDatasetPickerParams(current), {
      replace: true,
    })
    onOpenChange(false)
  }
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true)
      return
    }
    closeDrawer()
  }
  const handleOpenDatasetManagement = () => {
    if (createMutation.isPending) return
    setSearchParams((current) => clearExperimentDatasetPickerParams(current), {
      replace: true,
    })
    onOpenChange(false)
    navigate(buildProjectDatasetsHref(projectId))
  }

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={handleOpenChange}
        title='运行试验'
        mode='enhanced'
        showCancel={false}
        showConfirm={false}
        actions={
          <div className='flex items-center gap-2'>
            {step > 0 ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={createMutation.isPending}
                onClick={() => setStep((current) => current - 1)}
              >
                上一步
              </Button>
            ) : null}
            {step < experimentSteps.length - 1 ? (
              <Button
                type='button'
                size='sm'
                disabled={createMutation.isPending}
                onClick={() => {
                  const nextStep = step + 1
                  if (validateStep(nextStep)) setStep(nextStep)
                }}
              >
                下一步
              </Button>
            ) : (
              <Button
                type='button'
                size='sm'
                disabled={createMutation.isPending}
                onClick={handleSubmit}
              >
                {createMutation.isPending ? '提交中...' : '确认执行'}
              </Button>
            )}
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={createMutation.isPending}
              onClick={() => closeDrawer()}
            >
              取消
            </Button>
          </div>
        }
      >
        <div className='flex flex-col gap-5 p-4'>
          <Stepper
            items={experimentSteps}
            currentStep={step}
            onStepChange={(nextStep) => {
              if (createMutation.isPending) return
              if (validateStep(nextStep)) setStep(nextStep)
            }}
          />

          {scenesQuery.isLoading || evaluatorsQuery.isLoading ? (
            <Loading text='加载场景与评估器中...' className='min-h-80' />
          ) : null}

          {step === 0 && !scenesQuery.isLoading ? (
            <div className='grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]'>
              <section className='flex flex-col gap-4 rounded-lg border p-4'>
                <Field label='试验名称' htmlFor='experiment-name'>
                  <Input
                    id='experiment-name'
                    value={name}
                    maxLength={60}
                    placeholder='例如：客服 Agent 2.4 发布回归'
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field label='试验描述' htmlFor='experiment-description'>
                  <Textarea
                    id='experiment-description'
                    value={description}
                    maxLength={300}
                    placeholder='说明本次试验目标、版本与验收重点'
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
                <Field label='选择场景'>
                  {scenes.length ? (
                    <Select
                      value={sceneId}
                      onValueChange={(value) => void handleSceneChange(value)}
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='选择可用场景' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {scenes.map((scene) => (
                            <SelectItem key={scene.id} value={scene.id}>
                              {scene.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Alert>
                      <ServerCog />
                      <AlertTitle>暂无可用场景</AlertTitle>
                      <AlertDescription>
                        <span>请先完成场景配置并设置为可用。</span>
                        <Button
                          type='button'
                          size='sm'
                          variant='outline'
                          onClick={() =>
                            navigate(buildProjectScenesHref(projectId))
                          }
                        >
                          <ExternalLink data-icon='inline-start' />
                          前往场景管理
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                </Field>
              </section>
              <SceneSummary scene={selectedScene} />
            </div>
          ) : null}

          {step === 1 ? (
            <div className='flex flex-col gap-4'>
              <ExperimentDatasetStep
                projectId={projectId}
                selectedDatasetId={selectedDataset?.id ?? ''}
                lockedDataset={lockedDataset}
                onSelect={handleDatasetChange}
                onNavigateToDatasetManagement={handleOpenDatasetManagement}
              />
              {!lockedDataset && selectedDataset ? (
                <DatasetMetricStatusAlert
                  status={metricStatus}
                  activeItemCount={activeItemCount}
                />
              ) : null}
            </div>
          ) : null}

          {step === 2 && selectedScene ? (
            <ExperimentWebhookStep
              scene={selectedScene}
              selectedWebhookIds={selectedWebhookIds}
              onWebhookIdsChange={setSelectedWebhookIds}
              onViewWebhook={(webhook) =>
                setDetailTarget({ type: 'webhook', value: webhook })
              }
            />
          ) : null}

          {step === 3 && selectedScene ? (
            <SelectionGrid
              title='选择评估器'
              description='仅展示当前场景绑定且状态有效的评估器。'
            >
              {sceneEvaluators.length ? (
                sceneEvaluators.map((evaluator) => (
                  <ExperimentSelectableCard
                    key={evaluator.id}
                    checked={validSelectedEvaluatorIds.includes(evaluator.id)}
                    title={evaluator.name}
                    description={`${evaluator.type} · v${evaluator.version}`}
                    meta={
                      (evaluator.outputVariableMappings ?? [])
                        .map(
                          (mapping) =>
                            `${mapping.variableName} → ${mapping.scoreConfigName}`
                        )
                        .join('；') || '暂无评分变量映射'
                    }
                    onCheckedChange={(checked) =>
                      setSelectedEvaluatorIds((current) =>
                        checked
                          ? [...current, evaluator.id]
                          : current.filter((id) => id !== evaluator.id)
                      )
                    }
                    onView={() =>
                      setDetailTarget({ type: 'evaluator', value: evaluator })
                    }
                  />
                ))
              ) : (
                <Alert className='lg:col-span-2'>
                  <Bot />
                  <AlertTitle>当前场景暂无有效评估器</AlertTitle>
                  <AlertDescription>
                    请先在场景管理中绑定至少一个状态有效的评估器。
                  </AlertDescription>
                </Alert>
              )}
            </SelectionGrid>
          ) : null}

          {step === 4 && selectedScene ? (
            <ExperimentRunParametersStep
              runParameters={runParameters}
              onRunParametersChange={setRunParameters}
            />
          ) : null}

          {step === 5 && selectedScene && selectedDataset ? (
            <div className='flex flex-col gap-4'>
              {metricStatus === 'ready' && (activeItemCount ?? 0) > 0 ? (
                <Alert variant='success'>
                  <CheckCircle2 />
                  <AlertTitle>配置已就绪</AlertTitle>
                  <AlertDescription>
                    确认后将创建 {selectedWebhooks.length}{' '}
                    份服务级报告，并进入排队状态。
                  </AlertDescription>
                </Alert>
              ) : (
                <DatasetMetricStatusAlert
                  status={metricStatus}
                  activeItemCount={activeItemCount}
                />
              )}
              <section className='grid gap-4 lg:grid-cols-2'>
                <SummarySection title='试验与场景'>
                  <SummaryRow label='试验名称' value={name} />
                  <SummaryRow label='场景' value={selectedScene.name} />
                  <SummaryRow label='数据集' value={selectedDataset.name} />
                  <SummaryRow
                    label='有效数据项'
                    value={
                      metricStatus === 'ready'
                        ? `${activeItemCount ?? 0} 条`
                        : '尚未就绪'
                    }
                  />
                </SummarySection>
                <SummarySection title='运行参数'>
                  <SummaryRow
                    label='并发 / 超时'
                    value={`${runParameters.concurrency} / ${runParameters.timeoutSeconds} 秒`}
                  />
                  <SummaryRow
                    label='重试 / 轮次'
                    value={`${runParameters.retryCount} 次 / ${runParameters.rounds} 轮`}
                  />
                  <SummaryRow
                    label='预计调用量'
                    value={`${estimatedCalls} 次`}
                    emphasis
                  />
                </SummarySection>
                <SummarySection
                  title={`Webhook 服务（${selectedWebhooks.length}）`}
                >
                  {selectedWebhooks.map((webhook) => (
                    <SummaryRow
                      key={webhook.id}
                      label={webhook.name}
                      value={`${name.trim()} - ${webhook.name}`}
                    />
                  ))}
                </SummarySection>
                <SummarySection
                  title={`评估器（${selectedEvaluators.length}）`}
                >
                  {selectedEvaluators.map((evaluator) => (
                    <SummaryRow
                      key={evaluator.id}
                      label={evaluator.name}
                      value={
                        (evaluator.outputVariables ?? []).join('、') || '-'
                      }
                    />
                  ))}
                </SummarySection>
              </section>
            </div>
          ) : null}
        </div>
      </Drawer>

      <DetailDialog
        target={detailTarget}
        onOpenChange={() => setDetailTarget(null)}
      />
    </>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className='flex flex-col gap-2'>
      <label className='text-sm font-medium' htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SceneSummary({ scene }: { scene?: SceneRecord }) {
  return (
    <aside className='bg-muted/40 flex min-h-64 flex-col gap-4 rounded-lg border p-5'>
      <div>
        <p className='text-sm font-semibold'>场景摘要</p>
        <p className='text-muted-foreground mt-1 text-xs'>
          选择后带出默认数据集与运行参数，评估器和 Webhook 需手动选择
        </p>
      </div>
      {scene ? (
        <>
          <div>
            <p className='font-medium'>{scene.name}</p>
            <p className='text-muted-foreground mt-1 text-sm'>
              {scene.description}
            </p>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <Metric label='Webhook' value={`${scene.webhooks.length} 个`} />
            <Metric
              label='评估器'
              value={`${scene.evaluatorIds?.length ?? 0} 个`}
            />
            <Metric
              label='并发数'
              value={String(scene.runParameters.concurrency)}
            />
            <Metric
              label='执行轮次'
              value={`${scene.runParameters.rounds} 轮`}
            />
          </div>
        </>
      ) : (
        <p className='text-muted-foreground text-sm'>尚未选择场景</p>
      )}
    </aside>
  )
}

function SelectionGrid({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className='flex flex-col gap-4'>
      <div>
        <h3 className='font-semibold'>{title}</h3>
        <p className='text-muted-foreground text-sm'>{description}</p>
      </div>
      <div className='grid gap-3 lg:grid-cols-2'>{children}</div>
    </section>
  )
}

function DatasetMetricStatusAlert({
  status,
  activeItemCount,
}: {
  status: DatasetMetricStatus
  activeItemCount?: number
}) {
  if (status === 'pending') {
    return <Loading text='加载所选数据集指标中...' className='min-h-24' />
  }

  if (status === 'error') {
    return (
      <Alert variant='destructive'>
        <TriangleAlert />
        <AlertTitle>数据集指标加载失败</AlertTitle>
        <AlertDescription>
          暂时无法确认有效数据项，请重新选择数据集或稍后重试。
        </AlertDescription>
      </Alert>
    )
  }

  if (status === 'ready' && activeItemCount === 0) {
    return (
      <Alert variant='destructive'>
        <TriangleAlert />
        <AlertTitle>当前数据集暂无有效数据项</AlertTitle>
        <AlertDescription>
          请先补充有效数据项，再发起场景试验。
        </AlertDescription>
      </Alert>
    )
  }

  if (status === 'ready') {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>数据集指标已就绪</AlertTitle>
        <AlertDescription>
          当前包含 {activeItemCount ?? 0} 条有效数据项。
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

function SummarySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className='bg-card rounded-lg border p-4'>
      <h3 className='text-sm font-semibold'>{title}</h3>
      <dl className='mt-3 flex flex-col gap-3'>{children}</dl>
    </section>
  )
}

function SummaryRow({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className='flex items-start justify-between gap-4 text-sm'>
      <dt className='text-muted-foreground min-w-0'>{label}</dt>
      <dd
        className={
          emphasis
            ? 'text-primary shrink-0 font-semibold'
            : 'max-w-[65%] text-right font-medium'
        }
      >
        {value}
      </dd>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className='bg-card rounded-md border p-3'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className='mt-1 font-semibold'>{value}</p>
    </div>
  )
}

function DetailDialog({
  target,
  onOpenChange,
}: {
  target: DetailTarget
  onOpenChange: () => void
}) {
  const isWebhook = target?.type === 'webhook'
  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => !open && onOpenChange()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isWebhook ? 'Webhook 服务详情' : '评估器详情'}
          </DialogTitle>
          <DialogDescription>
            {isWebhook
              ? '查看本次试验将使用的服务快照。'
              : '查看评分能力与输出变量。'}
          </DialogDescription>
        </DialogHeader>
        {target?.type === 'webhook' ? (
          <div className='flex flex-col gap-3 text-sm'>
            <DetailRow
              icon={<ServerCog />}
              label='服务名称'
              value={target.value.name}
            />
            <DetailRow label='URL' value={target.value.url} />
            <DetailRow
              label='方法 / 鉴权'
              value={`${target.value.method} / ${target.value.authType}`}
            />
            <DetailRow
              label='服务系列 / 版本'
              value={`${target.value.serviceFamily} / ${target.value.version}`}
            />
            <DetailRow
              label='凭证'
              value={target.value.maskedCredential || '无'}
            />
          </div>
        ) : null}
        {target?.type === 'evaluator' ? (
          <div className='flex flex-col gap-3 text-sm'>
            <DetailRow
              icon={<Bot />}
              label='评估器名称'
              value={target.value.name}
            />
            <DetailRow
              label='类型 / 提供方'
              value={`${target.value.type} / ${target.value.provider}`}
            />
            <DetailRow label='版本' value={target.value.version} />
            <DetailRow
              label='输入变量'
              value={(target.value.inputVariables ?? []).join('、') || '-'}
            />
            <DetailRow
              label='输出变量'
              value={(target.value.outputVariables ?? []).join('、') || '-'}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className='grid gap-1 border-b pb-3 last:border-0 last:pb-0'>
      <span className='text-muted-foreground flex items-center gap-2 text-xs'>
        {icon}
        {label}
      </span>
      <span className='font-medium break-all'>{value}</span>
    </div>
  )
}

function parametersAreValid(parameters: SceneRunParameters) {
  return (
    parameters.concurrency >= 1 &&
    parameters.concurrency <= 50 &&
    parameters.timeoutSeconds >= 1 &&
    parameters.timeoutSeconds <= 600 &&
    parameters.retryCount >= 0 &&
    parameters.retryCount <= 10 &&
    parameters.rounds >= 1 &&
    parameters.rounds <= 20
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return error.message
  }
  return fallback
}
