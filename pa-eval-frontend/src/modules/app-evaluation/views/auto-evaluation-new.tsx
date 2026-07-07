import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { confirm } from '@/lib/confirm'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import { AutoEvaluationTaskForm } from '../components/auto-evaluation-task-form'

export function ProjectAutoEvaluationNew() {
  const { projectId = 'project_customer_agent' } = useParams()
  const navigate = useNavigate()
  const [dirty, setDirty] = useState(false)

  const backToList = () =>
    navigate(`/projects/${projectId}/evaluation/auto-evaluations`)

  const handleBack = async () => {
    if (!dirty) {
      backToList()
      return
    }
    const confirmed = await confirm({
      title: '离开新建自动评测？',
      desc: '当前自动评测任务尚未保存，离开后已填写内容将丢失。',
      confirmText: '离开',
    })
    if (confirmed) {
      setDirty(false)
      backToList()
    }
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto'>
        <PageAction showBackButton onBack={() => void handleBack()} />
        <AutoEvaluationTaskForm
          projectId={projectId}
          onDirtyChange={setDirty}
          onCancel={backToList}
        />
      </div>
    </Page>
  )
}
