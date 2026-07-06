import { type FormEvent, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ContentSection } from '@/components/common/content-section'
import { Loading } from '@/components/common/loading'
import { useAPI } from '@/hooks/use-api'
import { mockProjectInfo } from '../data/mock'
import {
  type ProjectListResponse,
  toProjectInfo,
} from '../project-info'
import type { ProjectInfo } from '../types'

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
  const { projectId = mockProjectInfo.id } = useParams()
  const $api = useAPI()
  const projectQuery = useQuery({
    queryKey: ['project-settings-info', $api, projectId],
    queryFn: async () => {
      const response = await $api.getProjects<ProjectListResponse>({
        query: { page: 1, pageSize: 200 },
      })
      const project = response.datas.find((item) => item.id === projectId)
      return project ? toProjectInfo(project) : null
    },
  })
  const currentProject = useMemo(
    () => projectQuery.data ?? mockProjectInfo,
    [projectQuery.data]
  )

  return (
    <ContentSection
      title='通用设置'
      desc='查看项目基础信息，维护项目名称和项目描述。'
    >
      <div className='flex flex-col gap-4'>
        {projectQuery.isLoading ? (
          <Loading text='加载项目设置中...' className='min-h-24' />
        ) : null}
        <ProjectGeneralSettingsForm
          key={currentProject.id}
          initialProject={currentProject}
        />
      </div>
    </ContentSection>
  )
}

function ProjectGeneralSettingsForm({
  initialProject,
}: {
  initialProject: ProjectInfo
}) {
  const [project, setProject] = useState(initialProject)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProject((current) => ({
      ...current,
      name: name.trim() || current.name,
      description: description.trim(),
      updatedAt: new Date().toISOString(),
    }))
    toast.success('项目基础信息已保存')
  }

  return (
      <form className='flex flex-col gap-6' onSubmit={handleSubmit}>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='project-name'>项目名称</Label>
          <Input
            id='project-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder='输入项目名称'
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='project-description'>项目描述</Label>
          <Textarea
            id='project-description'
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder='输入项目描述'
            rows={4}
          />
        </div>
        <dl className='grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2'>
          <div className='flex flex-col gap-1'>
            <dt className='text-muted-foreground'>项目 ID</dt>
            <dd className='font-mono text-xs'>{project.id}</dd>
          </div>
          <div className='flex flex-col gap-1'>
            <dt className='text-muted-foreground'>所属组织</dt>
            <dd>{project.organizationName}</dd>
          </div>
          <div className='flex flex-col gap-1'>
            <dt className='text-muted-foreground'>数据保留</dt>
            <dd>
              <Badge variant='secondary'>{project.retentionDays} 天</Badge>
            </dd>
          </div>
          <div className='flex flex-col gap-1'>
            <dt className='text-muted-foreground'>创建时间</dt>
            <dd>{formatDateTime(project.createdAt)}</dd>
          </div>
          <div className='flex flex-col gap-1 sm:col-span-2'>
            <dt className='text-muted-foreground'>更新时间</dt>
            <dd>{formatDateTime(project.updatedAt)}</dd>
          </div>
        </dl>
        <div>
          <Button type='submit'>
            <Save data-icon='inline-start' />
            保存设置
          </Button>
        </div>
      </form>
  )
}
