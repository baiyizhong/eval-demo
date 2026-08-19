import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { Page } from '@/components/common/page'
import { BadcaseDatasetSelection } from '../components/badcase-workbench/badcase-dataset-selection'
import {
  BadcaseItemDrawer,
  type BadcaseItemFormValues,
} from '../components/badcase-workbench/badcase-item-drawer'
import { BadcaseLifecycleTrack } from '../components/badcase-workbench/badcase-lifecycle-track'
import { BadcaseListPanel } from '../components/badcase-workbench/badcase-list-panel'
import { DatasetsPageNav } from '../components/datasets-page-nav'
import {
  badcaseItems as initialBadcaseItems,
  datasetCandidates as initialDatasetCandidates,
  type BadcaseDatasetCandidate,
  type BadcaseItem,
  type BadcaseStage,
} from '../lib/badcase-workbench-prototype'

export function ProjectBadcaseWorkbench() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { projectId = 'project_customer_agent' } = useParams()
  const datasetId = searchParams.get('datasetId')
  const [datasets, setDatasets] = useState(initialDatasetCandidates)
  const [items, setItems] = useState(initialBadcaseItems)
  const [previewDatasetId, setPreviewDatasetId] = useState(
    datasetId ?? initialDatasetCandidates[0]?.id ?? ''
  )
  const [activeStage, setActiveStage] = useState<BadcaseStage | 'all'>('all')
  const [selectedDrawerItemId, setSelectedDrawerItemId] = useState('')

  const activeDataset =
    datasets.find((dataset) => dataset.id === datasetId) ?? null
  const invalidDatasetId = datasetId && !activeDataset ? datasetId : null
  const previewDataset =
    datasets.find((dataset) => dataset.id === previewDatasetId) ?? datasets[0]

  const datasetItems = useMemo(
    () =>
      activeDataset
        ? items.filter((item) => item.datasetId === activeDataset.id)
        : [],
    [activeDataset, items]
  )
  const drawerItem = items.find((item) => item.id === selectedDrawerItemId)

  const resetGovernanceState = () => {
    setActiveStage('all')
    setSelectedDrawerItemId('')
  }

  const enterDataset = (nextDatasetId: string) => {
    navigate(
      `/projects/${projectId}/datasets/badcase-workbench?datasetId=${nextDatasetId}`
    )
    resetGovernanceState()
  }

  const switchDataset = () => {
    navigate(`/projects/${projectId}/datasets/badcase-workbench`)
    resetGovernanceState()
  }

  const handleStageChange = (stage: BadcaseStage | 'all') => {
    setActiveStage((current) =>
      stage === 'all' || current === stage ? 'all' : stage
    )
    setSelectedDrawerItemId('')
  }

  const handleBatchAction = async (action: string, itemIds: string[]) => {
    const confirmed = await confirm({
      title: `${action} ${itemIds.length} 条 badcase？`,
      desc: '批量治理动作需要填写变更原因并写入审计历史。当前演示仅更新前端状态。',
      confirmText: action,
    })

    if (!confirmed) return
    toast.success(`${action}已应用到 ${itemIds.length} 条 badcase`)
  }

  const handleRetestAction = async (item: BadcaseItem) => {
    const confirmed = await confirm({
      title: `发起复测 ${item.id}？`,
      desc: '当前演示仅触发前端状态提示，不会调用后端复测任务。',
      confirmText: '发起复测',
    })

    if (!confirmed) return
    toast.success('已发起复测', { description: item.id })
  }

  const handleDrawerSave = (itemId: string, values: BadcaseItemFormValues) => {
    const previousItem = items.find((item) => item.id === itemId)
    if (!previousItem) return

    const nextItem = applyDrawerFormValues(previousItem, values)

    setItems((current) =>
      current.map((item) => (item.id === itemId ? nextItem : item))
    )
    setDatasets((current) =>
      current.map((dataset) =>
        dataset.id === nextItem.datasetId
          ? updateDatasetSummaryAfterDrawerSave(dataset, previousItem, nextItem)
          : dataset
      )
    )
    toast.success('Badcase 表单已保存')
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-3'>
        <DatasetsPageNav />
        {activeDataset ? (
          <section className='bg-card text-card-foreground flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border'>
            <BadcaseLifecycleTrack
              dataset={activeDataset}
              activeStage={activeStage}
              onStageChange={handleStageChange}
              onSwitchDataset={switchDataset}
            />
            <BadcaseListPanel
              dataset={activeDataset}
              items={datasetItems}
              activeStage={activeStage}
              selectedItemId={drawerItem?.id ?? ''}
              onItemSelect={(itemId) => {
                setSelectedDrawerItemId(itemId)
              }}
              onRetestAction={handleRetestAction}
              onBatchAction={handleBatchAction}
            />
            <BadcaseItemDrawer
              item={drawerItem}
              projectId={projectId}
              open={Boolean(drawerItem)}
              onSave={handleDrawerSave}
              onOpenChange={(open) => {
                if (!open) setSelectedDrawerItemId('')
              }}
            />
          </section>
        ) : (
          <BadcaseDatasetSelection
            datasets={datasets}
            selectedDataset={previewDataset}
            invalidDatasetId={invalidDatasetId}
            onSelect={setPreviewDatasetId}
            onEnter={enterDataset}
          />
        )}
      </div>
    </Page>
  )
}

function applyDrawerFormValues(
  item: BadcaseItem,
  values: BadcaseItemFormValues
): BadcaseItem {
  return {
    ...item,
    stage: values.stage,
    owner: values.owner,
    priority: values.priority,
    failureType: values.failureType,
    rootCause: values.rootCause,
    fixDueAt: values.fixDueAt,
    fixPlan: values.fixPlan,
    retestResult: values.retestResult,
    verifyNote: values.verifyNote,
    lastAction: values.note,
    updatedAt: '刚刚',
  }
}

function updateDatasetSummaryAfterDrawerSave(
  dataset: BadcaseDatasetCandidate,
  previousItem: BadcaseItem,
  nextItem: BadcaseItem
): BadcaseDatasetCandidate {
  if (previousItem.stage === nextItem.stage) {
    return { ...dataset, updatedAt: '2026-08-18 刚刚' }
  }

  const previousClosed = previousItem.stage === 'CLOSED'
  const nextClosed = nextItem.stage === 'CLOSED'

  return {
    ...dataset,
    openCount:
      dataset.openCount +
      (previousClosed && !nextClosed
        ? 1
        : !previousClosed && nextClosed
          ? -1
          : 0),
    updatedAt: '2026-08-18 刚刚',
    stageCounts: {
      ...dataset.stageCounts,
      [previousItem.stage]: Math.max(
        0,
        dataset.stageCounts[previousItem.stage] - 1
      ),
      [nextItem.stage]: dataset.stageCounts[nextItem.stage] + 1,
    },
  }
}
