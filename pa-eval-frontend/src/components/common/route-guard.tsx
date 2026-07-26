import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { buildRouteErrorUrl, logRouteError } from '@/lib/route-error-logging'
import { checkRouteAccess, type RouteAccessConfig } from './route-access'

export function RouteGuard({
  children,
  accessConfig,
}: {
  children: ReactNode
  accessConfig?: RouteAccessConfig
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const lastDeniedRouteRef = useRef<string | null>(null)
  const currentRoute = useMemo(() => buildRouteErrorUrl(location), [location])

  useEffect(() => {
    if (!checkRouteAccess(accessConfig)) {
      if (lastDeniedRouteRef.current !== currentRoute) {
        logRouteError({
          status: 403,
          route: currentRoute,
          reason: 'route guard denied access',
        })
        lastDeniedRouteRef.current = currentRoute
      }
      navigate('/403', { replace: true })
    }
  }, [accessConfig, currentRoute, navigate])

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
