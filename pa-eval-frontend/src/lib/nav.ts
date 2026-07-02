export type ActiveMatch = 'exact' | 'prefix'

type RouteActiveItem = {
  href: string
  active?: boolean
  activeMatch?: ActiveMatch
}

export function isRouteActive(
  pathname: string,
  href: string,
  match: ActiveMatch = 'exact'
) {
  if (match === 'exact') {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function getRouteActiveState(pathname: string, item: RouteActiveItem) {
  return item.active ?? isRouteActive(pathname, item.href, item.activeMatch)
}
