type RouteLocationLike = {
  pathname: string
  search?: string
  hash?: string
}

export function buildRouteErrorUrl(location: RouteLocationLike): string {
  return `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`
}

export function logRouteError({
  status,
  route,
  reason,
}: {
  status: 403 | 404
  route: string
  reason: string
}) {
  console.warn(`[RouteError] ${status} ${reason}:`, route)
}
