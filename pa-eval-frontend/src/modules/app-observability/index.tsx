import { Navigate, Outlet, useParams } from 'react-router'

export function AppObservability() {
  return <Outlet />
}

export function AppObservabilityIndexRedirect() {
  const { projectId = 'project_customer_agent' } = useParams()

  return (
    <Navigate to={`/projects/${projectId}/observability/traces/logs`} replace />
  )
}
