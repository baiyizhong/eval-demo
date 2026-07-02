import { useQuery } from '@tanstack/react-query'
import { usePermissionStore } from '@/stores/permission.store'
import { matchPermission } from '@/lib/permission'
import { useAPI } from '@/hooks/use-api'
import type { SidebarData, NavItem, NavGroup } from '@/components/layout/types'

function filterNavItemsByPermission(
  items: NavItem[],
  getPermissions: () => string[]
): NavItem[] {
  return items
    .filter((item) => {
      if (item.superAccess && !usePermissionStore.getState().superAdmin) {
        return false
      }
      if (item.access) {
        const codes = Array.isArray(item.access) ? item.access : [item.access]
        const effectiveCodes = getPermissions()
        return codes.some((code) => matchPermission(code, effectiveCodes))
      }
      return true
    })
    .map((item) => {
      if ('items' in item && item.items) {
        return {
          ...item,
          items: filterNavItemsByPermission(item.items, getPermissions),
        } as NavItem
      }
      return item
    })
}

function filterNavGroupsByPermission(
  menuGroups: NavGroup[],
  getPermissions: () => string[]
): NavGroup[] {
  return menuGroups
    .map((group) => ({
      ...group,
      items: filterNavItemsByPermission(group.items, getPermissions),
    }))
    .filter((group) => group.items.length > 0)
}

export function useSidebarData(): {
  data: SidebarData | undefined
  isLoading: boolean
} {
  const $api = useAPI()
  const store = usePermissionStore()

  const { data, isLoading } = useQuery({
    queryKey: ['sidebar', $api] as const,
    queryFn: () => $api.getSidebar<SidebarData>(),
  })

  if (!data) {
    return { data: undefined, isLoading }
  }

  const getPermissions = () => store.getPermissionsForProject('')
  const filteredNavGroups = filterNavGroupsByPermission(
    data.menuGroups,
    getPermissions
  )

  return {
    data: { ...data, menuGroups: filteredNavGroups },
    isLoading,
  }
}

export { filterNavItemsByPermission, filterNavGroupsByPermission }
