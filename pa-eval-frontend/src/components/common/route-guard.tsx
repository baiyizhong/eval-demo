import { useEffect, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { checkRouteAccess, type RouteAccessConfig } from './route-access'

export function RouteGuard({
  children,
  accessConfig,
}: {
  children: ReactNode
  accessConfig?: RouteAccessConfig
}) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!checkRouteAccess(accessConfig)) {
      navigate('/403', { replace: true })
    }
  }, [accessConfig, navigate])

  if (!checkRouteAccess(accessConfig)) return null
  return <>{children}</>
}

export function ProjectRouteGuard({
  access,
  children,
}: {
  access: string | string[]
  children: ReactNode
}) {
  const { projectId } = useParams()

  return (
    <RouteGuard
      accessConfig={{ scope: { type: 'project', projectId }, access }}
    >
      {children}
    </RouteGuard>
  )
}
