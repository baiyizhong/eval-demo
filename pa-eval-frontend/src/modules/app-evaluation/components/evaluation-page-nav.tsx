import { Database } from 'lucide-react'
import { useLocation, useParams } from 'react-router'
import { PageNav } from '@/components/common/page-nav'

type EvaluationPageNavProps = {
  buttonGroups?: React.ComponentProps<typeof PageNav>['buttonGroups']
}

export function EvaluationPageNav({ buttonGroups }: EvaluationPageNavProps) {
  const location = useLocation()
  const { projectId = 'project_customer_agent' } = useParams()
  const basePath = `/projects/${projectId}/evaluation`

  return (
    <PageNav
      topNav={{
        variant: 'underline',
        links: [
          {
            title: '数据集',
            href: `${basePath}/datasets`,
            icon: Database,
            isActive: location.pathname.startsWith(`${basePath}/datasets`),
          },
        ],
      }}
      buttonGroups={buttonGroups}
    />
  )
}
