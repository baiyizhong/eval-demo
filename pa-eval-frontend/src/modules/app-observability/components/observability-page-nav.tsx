import { Activity, ListTree, RefreshCw } from 'lucide-react'
import { useLocation, useParams } from 'react-router'
import { PageNav } from '@/components/common/page-nav'
import { ProjectContextSwitcher } from '@/modules/project-context/project-context-switcher'

export function ObservabilityPageNav() {
  const location = useLocation()
  const { projectId = 'project_customer_agent' } = useParams()
  const basePath = `/projects/${projectId}/observability`

  return (
    <PageNav
      topNav={{
        variant: 'underline',
        links: [
          {
            title: 'Trace 看板',
            href: `${basePath}/traces/dashboard`,
            icon: Activity,
            isActive: location.pathname.endsWith('/traces/dashboard'),
          },
          {
            title: 'Trace 日志',
            href: `${basePath}/traces/logs`,
            icon: ListTree,
            isActive: location.pathname.endsWith('/traces/logs'),
          },
        ],
      }}
      trailing={
        <ProjectContextSwitcher
          currentProjectId={projectId}
          moduleSegment='observability'
          defaultSubPath='/traces/dashboard'
          queryKeyScope='observability'
          ariaLabel='切换观测项目'
        />
      }
      buttonGroups={{
        buttons: [
          {
            id: 'refresh',
            label: '刷新',
            icon: RefreshCw,
            iconPosition: 'start',
            variant: 'outline',
            size: 'sm',
            onClick: () => window.location.reload(),
          },
        ],
      }}
    />
  )
}
