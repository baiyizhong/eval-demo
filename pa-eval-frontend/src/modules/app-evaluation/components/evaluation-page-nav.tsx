import { useLocation, useParams } from 'react-router'
import { PageNav } from '@/components/common/page-nav'
import { buildEvaluationTopNavLinks } from './evaluation-page-nav-utils'

type EvaluationPageNavProps = {
  buttonGroups?: React.ComponentProps<typeof PageNav>['buttonGroups']
}

export function EvaluationPageNav({ buttonGroups }: EvaluationPageNavProps) {
  const location = useLocation()
  const { projectId = 'project_customer_agent' } = useParams()

  return (
    <PageNav
      topNav={{
        variant: 'underline',
        links: buildEvaluationTopNavLinks({
          pathname: location.pathname,
          projectId,
        }),
      }}
      buttonGroups={buttonGroups}
    />
  )
}
