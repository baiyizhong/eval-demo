import { Navigate, Outlet, useLocation, useParams } from 'react-router'

export function AppEvaluation() {
  return <Outlet />
}

export function AppEvaluationIndexRedirect() {
  const { projectId = 'project_customer_agent' } = useParams()

  return <Navigate to={`/projects/${projectId}/evaluation/reports`} replace />
}

export function AppEvaluationLegacyDatasetsRedirect() {
  const location = useLocation()
  const { projectId = 'project_customer_agent' } = useParams()
  const legacyPathMarker = '/evaluation/datasets'
  const legacyPathIndex = location.pathname.indexOf(legacyPathMarker)
  const suffix =
    legacyPathIndex >= 0
      ? location.pathname.slice(legacyPathIndex + legacyPathMarker.length)
      : ''

  return (
    <Navigate
      to={`/projects/${encodeURIComponent(projectId)}/datasets${suffix}${location.search}`}
      replace
    />
  )
}
