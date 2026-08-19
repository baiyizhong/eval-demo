import { Database, Hammer } from 'lucide-react'
import { useLocation, useParams } from 'react-router'
import { PageNav } from '@/components/common/page-nav'

export function DatasetsPageNav({
  buttonGroups,
}: {
  buttonGroups?: React.ComponentProps<typeof PageNav>['buttonGroups']
}) {
  const location = useLocation()
  const { projectId = 'project_customer_agent' } = useParams()
  const basePath = `/projects/${projectId}/datasets`
  const isBadcaseWorkbench = location.pathname.startsWith(
    `${basePath}/badcase-workbench`
  )

  return (
    <PageNav
      topNav={{
        variant: 'underline',
        links: [
          {
            title: '数据集',
            href: basePath,
            icon: Database,
            isActive:
              location.pathname === basePath ||
              (location.pathname.startsWith(`${basePath}/`) &&
                !isBadcaseWorkbench),
          },
          {
            title: 'badcase工作台',
            href: `${basePath}/badcase-workbench`,
            icon: Hammer,
            isActive: isBadcaseWorkbench,
          },
        ],
      }}
      buttonGroups={buttonGroups}
    />
  )
}
