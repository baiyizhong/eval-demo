import { Navigate, Outlet, useParams } from 'react-router'

export function AppEvaluation() {
  return <Outlet />
}

export function AppEvaluationIndexRedirect() {
  const { projectId = 'project_customer_agent' } = useParams()

  return (
    <Navigate
      to={`/projects/${projectId}/evaluation/scenario-evaluations`}
      replace
    />
  )
}
