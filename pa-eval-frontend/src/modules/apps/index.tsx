import { useQuery } from '@tanstack/react-query'
import { Boxes, FolderKanban } from 'lucide-react'
import { useNavigate } from 'react-router'
import { AppList } from '@/components/business/app-list'
import type { AppCardListItem } from '@/components/business/app-card-list'
import { Main } from '@/components/layout/main'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAPI } from '@/hooks/use-api'
import { useOrganizations } from '@/modules/organization-management/hooks/use-organizations'
import { getProjectEntryPath } from '@/modules/apps/project-routes'

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
  const { currentOrganization, isPending: organizationsPending } =
    useOrganizations()
  const currentOrganizationId = currentOrganization?.id ?? null
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

  return (
    <>
      <Main fixed>
        {organizationsPending || projectsQuery.isLoading ? (
          <div className='flex h-40 items-center justify-center text-sm text-muted-foreground'>
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
          <div className='flex h-40 flex-col items-center justify-center gap-2 rounded-lg border text-sm text-muted-foreground'>
            <FolderKanban className='size-5' />
            暂无项目
          </div>
        ) : null}
        {projectCards.length > 0 ? (
          <AppList
            apps={projectCards}
            onActionClick={openProject}
            onCardClick={openProject}
          />
        ) : null}
      </Main>
    </>
  )
}
