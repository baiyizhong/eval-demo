import { ForbiddenError } from '@/modules/errors/forbidden'
import { GeneralError } from '@/modules/errors/general-error'
import { MaintenanceError } from '@/modules/errors/maintenance-error'
import { NotFoundError } from '@/modules/errors/not-found-error'
import { UnauthorisedError } from '@/modules/errors/unauthorized-error'
import { buildRouteErrorUrl, logRouteError } from '@/lib/route-error-logging'
import { useEffect } from 'react'
import { useLocation, useRouteError, isRouteErrorResponse } from 'react-router'

export function RootErrorBoundary() {
  const error = useRouteError()
  const location = useLocation()
  const route = buildRouteErrorUrl(location)
  const status = isRouteErrorResponse(error) ? error.status : undefined

  useEffect(() => {
    if (status === 403 || status === 404) {
      logRouteError({
        status,
        route,
        reason: 'route error boundary matched',
      })
    }
  }, [route, status])

  // 404 - 路由未找到
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundError />
  }

  // 401 - 未授权
  if (isRouteErrorResponse(error) && error.status === 401) {
    return <UnauthorisedError />
  }

  // 403 - 禁止访问
  if (isRouteErrorResponse(error) && error.status === 403) {
    return <ForbiddenError />
  }

  // 503/502 - 维护中
  if (
    isRouteErrorResponse(error) &&
    (error.status === 503 || error.status === 502)
  ) {
    return <MaintenanceError />
  }

  // 其他错误（包括普通 500 错误）
  return <GeneralError />
}
