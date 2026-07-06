import type { EnvironmentCode } from './environment-options'

const publicPaths = new Set([
  '/login',
  '/environment',
  '/401',
  '/403',
  '/404',
  '/500',
  '/503',
])

export function getEnvironmentRedirectPath(
  pathname: string,
  environmentCode: EnvironmentCode | null
) {
  if (environmentCode || publicPaths.has(pathname)) {
    return null
  }

  return '/environment'
}

export function getProtectedRouteRedirectPath(
  pathname: string,
  accessToken: string,
  environmentCode: EnvironmentCode | null
) {
  if (publicPaths.has(pathname)) {
    return null
  }

  if (!accessToken) {
    return '/login'
  }

  return getEnvironmentRedirectPath(pathname, environmentCode)
}

export function getEnvironmentPageRedirectPath(accessToken: string) {
  return accessToken ? null : '/login'
}
