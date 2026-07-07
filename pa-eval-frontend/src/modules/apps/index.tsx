import { type MouseEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveProject,
  createProject,
  restoreProject,
  type ProjectPayload,
} from '@/modules/apps/api/project-api'
import { ProjectFormDrawer } from '@/modules/apps/components/project-form-drawer'
import { getProjectEntryPath } from '@/modules/apps/project-routes'
import { useOrganizations } from '@/modules/organization-management/hooks/use-organizations'
import { Boxes, FolderKanban } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { AppCardListItem } from '@/components/business/app-card-list'
import { AppList } from '@/components/business/app-list'
import { Main } from '@/components/layout/main'

type ProjectListItem = {
  id: string
  name: string
  organizationId: string
  organizationName: string
  description: string | null
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

type PaginatedResult<T> = {
  total: number
  datas: T[]
}

type ProjectCardItem = AppCardListItem & {
  id: string
  organizationId: string
  organizationName: string
}

const projectsQueryKey = ['projects'] as const

const formatDateTime = (value: string) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const toProjectCard = (project: ProjectListItem): ProjectCardItem => ({
  id: project.id,
  organizationId: project.organizationId,
  organizationName: project.organizationName,
  name: project.name,
  status: project.status,
  desc: project.description || `所属组织：${project.organizationName}`,
  createdAt: formatDateTime(project.createdAt),
})

export function Apps() {
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const { currentOrganization, isPending: organizationsPending } =
    useOrganizations()
  const currentOrganizationId = currentOrganization?.id ?? null
  const invalidateProjects = () =>
    queryClient.invalidateQueries({ queryKey: projectsQueryKey })
  const projectsQuery = useQuery({
    queryKey: [...projectsQueryKey, currentOrganizationId, $api],
    enabled: Boolean(currentOrganizationId),
    queryFn: () =>
      $api.getProjects<PaginatedResult<ProjectListItem>>({
        query: {
          page: 1,
          pageSize: 200,
          organizationId: currentOrganizationId,
        },
      }),
  })

  const projectCards = (projectsQuery.data?.datas ?? []).map(toProjectCard)
  const openProject = (project: AppCardListItem) => {
    const projectCard = project as ProjectCardItem
    navigate(getProjectEntryPath(projectCard.id))
  }
  const openCreateProject = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!currentOrganizationId) {
      toast.error('请先选择组织')
      return
    }
    setFormOpen(true)
  }
  const openProjectSettings = (project: AppCardListItem) => {
    const projectCard = project as ProjectCardItem
    navigate(`/projects/${projectCard.id}/settings/general`)
  }

  const createMutation = useMutation({
    mutationFn: (input: ProjectPayload) => {
      if (!currentOrganizationId) {
        throw new Error('请先选择组织')
      }
      return createProject($api, {
        organizationId: currentOrganizationId,
        ...input,
      })
    },
    onSuccess: async () => {
      await invalidateProjects()
      toast.success('项目创建成功')
      setFormOpen(false)
    },
  })
  const archiveMutation = useMutation({
    mutationFn: (project: ProjectCardItem) =>
      project.status === 'archived'
        ? restoreProject($api, project.id)
        : archiveProject($api, project.id),
    onSuccess: async (_, project) => {
      await invalidateProjects()
      toast.success(project.status === 'archived' ? '项目已恢复' : '项目已归档')
    },
  })

  const handleSubmitProject = async (values: ProjectPayload) => {
    await createMutation.mutateAsync(values)
  }
  const handleArchiveProject = async (project: AppCardListItem) => {
    const projectCard = project as ProjectCardItem
    const archived = projectCard.status === 'archived'
    const confirmed = await confirm({
      title: archived ? '恢复项目' : '归档项目',
      desc: archived
        ? `确定恢复「${projectCard.name}」吗？恢复后可重新进入项目。`
        : `确定归档「${projectCard.name}」吗？归档后项目数据保留，但默认不再作为活跃项目使用。`,
      confirmText: archived ? '恢复' : '归档',
      destructive: !archived,
    })
    if (!confirmed) return
    await archiveMutation.mutateAsync(projectCard)
  }

  return (
    <>
      <Main fixed>
        {organizationsPending || projectsQuery.isLoading ? (
          <div className='text-muted-foreground flex h-40 items-center justify-center text-sm'>
            加载项目中...
          </div>
        ) : null}
        {projectsQuery.isError ? (
          <Alert variant='destructive' className='my-4'>
            <Boxes className='size-4' />
            <AlertTitle>项目加载失败</AlertTitle>
            <AlertDescription>
              请确认后端服务和 Langfuse 数据库连接正常。
            </AlertDescription>
          </Alert>
        ) : null}
        {!projectsQuery.isLoading &&
        !projectsQuery.isError &&
        projectCards.length === 0 ? (
          <div className='text-muted-foreground flex h-40 flex-col items-center justify-center gap-2 rounded-lg border text-sm'>
            <FolderKanban className='size-5' />
            暂无项目
          </div>
        ) : null}
        {!projectsQuery.isLoading && !projectsQuery.isError ? (
          <AppList
            apps={projectCards}
            onActionClick={openProject}
            onCardClick={openProject}
            onAddClick={openCreateProject}
            onEditClick={undefined}
            onDeleteClick={(project) => void handleArchiveProject(project)}
            onSettingsClick={openProjectSettings}
          />
        ) : null}
        <ProjectFormDrawer
          open={formOpen}
          mode='create'
          submitting={createMutation.isPending}
          onOpenChange={setFormOpen}
          onSubmit={handleSubmitProject}
        />
      </Main>
    </>
  )
}
