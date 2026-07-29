import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Page } from '@/components/common/page'
import { PageNav } from '@/components/common/page-nav'
import { ExperimentRunDrawer } from '../components/experiment-run-drawer'
import { ProjectExperimentReports } from '../components/project-experiment-reports'
import { SceneManagementTable } from '../components/scene-management-table'
import { normalizeSceneExperimentTab } from '../lib/experiment-navigation'
import {
  consumeSceneCreateRequest,
  createInitialSceneCreateRequestState,
  requestSceneCreate,
} from '../lib/scene-management'

export function ProjectScenes() {
  const { projectId = 'proj_a' } = useParams()
  const [searchParams] = useSearchParams()
  const $api = useAPI()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditScenes = can('project:dataset:edit')
  const queryClient = useQueryClient()
  const tab = normalizeSceneExperimentTab(searchParams.get('tab'))
  const encodedProjectId = encodeURIComponent(projectId)
  const [experimentDrawerOpen, setExperimentDrawerOpen] = useState(false)
  const [createSceneRequest, setCreateSceneRequest] = useState(
    createInitialSceneCreateRequestState
  )
  const [refreshing, setRefreshing] = useState(false)

  const handleRefreshExperiments = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries({
        queryKey: ['project-experiment-source', $api, projectId],
      })
      toast.success('场景试验已刷新')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageNav
          topNav={{
            variant: 'underline',
            links: [
              {
                title: '试验报告',
                href: `/projects/${encodedProjectId}/scenes?tab=experiments`,
                isActive: tab === 'experiments',
              },
              {
                title: '场景管理',
                href: `/projects/${encodedProjectId}/scenes?tab=management`,
                isActive: tab === 'management',
              },
            ],
          }}
          buttonGroups={{
            buttons:
              tab === 'management'
                ? canEditScenes
                  ? [
                      {
                        id: 'create-scene',
                        label: '新增场景',
                        icon: Plus,
                        iconPosition: 'start',
                        size: 'sm',
                        onClick: () =>
                          setCreateSceneRequest(requestSceneCreate),
                      },
                    ]
                  : []
                : [
                    {
                      id: 'refresh-experiments',
                      label: '刷新',
                      icon: RefreshCw,
                      iconPosition: 'start',
                      variant: 'outline',
                      size: 'sm',
                      disabled: refreshing,
                      onClick: () => void handleRefreshExperiments(),
                    },
                    ...(canEditScenes
                      ? [
                          {
                            id: 'create-experiment',
                            label: '运行试验',
                            icon: Plus,
                            iconPosition: 'start' as const,
                            size: 'sm' as const,
                            onClick: () => setExperimentDrawerOpen(true),
                          },
                        ]
                      : []),
                  ],
          }}
        />
        {tab === 'management' ? (
          <SceneManagementTable
            projectId={projectId}
            canEdit={canEditScenes}
            createRequestId={createSceneRequest.pendingRequestId}
            onCreateRequestConsumed={(requestId) =>
              setCreateSceneRequest((current) =>
                consumeSceneCreateRequest(current, requestId)
              )
            }
          />
        ) : (
          <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
            <ProjectExperimentReports projectId={projectId} />
          </section>
        )}
      </div>
      <ExperimentRunDrawer
        open={canEditScenes && experimentDrawerOpen}
        projectId={projectId}
        onOpenChange={setExperimentDrawerOpen}
        onCreated={async () => {
          await queryClient.invalidateQueries({
            queryKey: ['project-experiment-source', $api, projectId],
          })
        }}
      />
    </Page>
  )
}
