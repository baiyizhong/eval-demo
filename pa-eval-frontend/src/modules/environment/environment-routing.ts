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
