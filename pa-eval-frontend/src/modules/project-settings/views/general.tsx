import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { updateProject } from '@/modules/apps/api/project-api'
import { Save } from 'lucide-react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ContentSection } from '@/components/common/content-section'
import { Loading } from '@/components/common/loading'
import { type ProjectListResponse, toProjectInfo } from '../project-info'
import type { ProjectInfo } from '../types'

const PROJECT_NAME_MAX_LENGTH = 40
const PROJECT_DESCRIPTION_MAX_LENGTH = 200

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function ProjectGeneralSettings() {
  const { projectId = '' } = useParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditSettings = can('project:settings:edit')
  const projectQuery = useQuery({
    queryKey: ['project-settings-info', $api, projectId],
    queryFn: async () => {
      const response = await $api.getProjects<ProjectListResponse>({
        query: { page: 1, pageSize: 200 },
      })
      const project = response.datas.find((item) => item.id === projectId)
      return project ? toProjectInfo(project) : null
    },
    enabled: Boolean(projectId),
  })
  const currentProject = useMemo(() => projectQuery.data, [projectQuery.data])
  const updateMutation = useMutation({
    mutationFn: (input: {
      name: string
      description: string
      retentionDays: number
    }) => updateProject($api, projectId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-settings-info'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
      ])
      toast.success('项目基础信息已保存')
    },
  })

  return (
    <ContentSection
      title='通用设置'
      desc='查看项目基础信息，维护项目名称和项目描述。'
    >
      <div className='flex flex-col gap-4'>
        {projectQuery.isLoading ? (
          <Loading text='加载项目设置中...' className='min-h-24' />
        ) : null}
        {currentProject ? (
          <ProjectGeneralSettingsForm
            key={currentProject.id}
            initialProject={currentProject}
            readOnly={!canEditSettings}
            submitting={updateMutation.isPending}
            onSubmit={(input) => updateMutation.mutateAsync(input)}
          />
        ) : null}
        {!projectQuery.isLoading && !currentProject ? (
          <div className='text-muted-foreground rounded-lg border p-4 text-sm'>
            当前项目不存在或无访问权限。
          </div>
        ) : null}
      </div>
    </ContentSection>
  )
}

function ProjectGeneralSettingsForm({
  initialProject,
  readOnly,
  submitting,
  onSubmit,
}: {
  initialProject: ProjectInfo
  readOnly?: boolean
  submitting: boolean
  onSubmit: (input: {
    name: string
    description: string
    retentionDays: number
  }) => Promise<unknown>
}) {
  const [project, setProject] = useState(initialProject)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [retentionDays, setRetentionDays] = useState(
    String(project.retentionDays)
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (readOnly) return

    if (name.length > PROJECT_NAME_MAX_LENGTH) {
      toast.error('项目名称不能超过30个字')
      return
    }

    if (description.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
      toast.error('项目描述不能超过200个字')
      return
    }

    const nextProject = {
      name: name.trim() || project.name,
      description: description.trim(),
      retentionDays: clampRetentionDays(retentionDays),
    }
    await onSubmit(nextProject)
    setProject((current) => ({
      ...current,
      ...nextProject,
      updatedAt: new Date().toISOString(),
    }))
  }

  return (
    <form className='flex flex-col gap-6' onSubmit={handleSubmit}>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='project-name'>项目名称</Label>
        <Input
          id='project-name'
          value={name}
          disabled={readOnly}
          maxLength={PROJECT_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          placeholder='输入项目名称'
        />
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='project-description'>项目描述</Label>
        <Textarea
          id='project-description'
          value={description}
          disabled={readOnly}
          maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => setDescription(event.target.value)}
          placeholder='输入项目描述'
          rows={4}
        />
      </div>
      <div className='flex max-w-md flex-col gap-2'>
        <Label htmlFor='project-retention-days'>项目数据保留天数</Label>
        <Input
          id='project-retention-days'
          type='number'
          min={1}
          max={30}
          value={retentionDays}
          disabled={readOnly}
          onChange={(event) => setRetentionDays(event.target.value)}
          placeholder='1-30'
        />
        <p className='text-muted-foreground text-xs'>
          项目数据包括
          traces、observations、scores、events，超过保留天数后会被后台清理，请谨慎修改。新建项目默认保留
          14 天，支持自定义 1-30 天。
        </p>
      </div>
      <dl className='grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2'>
        <div className='flex min-w-0 flex-col gap-1'>
          <dt className='text-muted-foreground'>项目 ID</dt>
          <dd className='font-mono text-xs break-all'>{project.id}</dd>
        </div>
        <div className='flex min-w-0 flex-col gap-1'>
          <dt className='text-muted-foreground'>所属组织</dt>
          <dd className='break-words'>{project.organizationName}</dd>
        </div>
        <div className='flex flex-col gap-1'>
          <dt className='text-muted-foreground'>创建时间</dt>
          <dd>{formatDateTime(project.createdAt)}</dd>
        </div>
        <div className='flex flex-col gap-1'>
          <dt className='text-muted-foreground'>更新时间</dt>
          <dd>{formatDateTime(project.updatedAt)}</dd>
        </div>
      </dl>
      {!readOnly ? (
        <div>
          <Button type='submit' disabled={submitting}>
            <Save data-icon='inline-start' />
            保存设置
          </Button>
        </div>
      ) : null}
    </form>
  )
}

function clampRetentionDays(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 14
  return Math.min(30, Math.max(1, Math.round(parsed)))
}
