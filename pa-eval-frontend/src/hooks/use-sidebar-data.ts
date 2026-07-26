import { useQuery } from '@tanstack/react-query'
import type { PermissionScope } from '@/types/permission'
import { useParams } from 'react-router'
import { useSessionStore } from '@/stores/session.store'
import { matchPermission } from '@/lib/permission'
import {
  buildSidebarDataFromProjects,
  type PaginatedSidebarProjects,
} from '@/lib/sidebar-data'
import { useAPI } from '@/hooks/use-api'
import { checkPermissionAccessRule } from '@/components/common/route-access'
import type { SidebarData, NavItem, NavGroup } from '@/components/layout/types'

function filterNavItemsByPermission(
  items: NavItem[],
  getPermissionsForScope: (scope?: PermissionScope) => string[],
  superAdmin: boolean
): NavItem[] {
  return items
    .map((item) => {
      if (item.superAccess && !superAdmin) {
        return null
      }

      if (item.accessRules?.length) {
        const allowed = item.accessRules.some((rule) =>
          checkPermissionAccessRule(rule)
        )

        if (!allowed) {
          return null
        }
      } else if (item.access) {
        const codes = Array.isArray(item.access) ? item.access : [item.access]
        const effectiveCodes = getPermissionsForScope(item.scope)
        const allowed = codes.some((code) =>
          matchPermission(code, effectiveCodes)
        )

        if (!allowed) {
          return null
        }
      }

      if ('items' in item && item.items) {
        const filteredItems = filterNavItemsByPermission(
          item.items,
          getPermissionsForScope,
          superAdmin
        )

        if (filteredItems.length === 0) {
          return null
        }

        return {
          ...item,
          items: filteredItems,
        } as NavItem
      }

      return item
    })
    .filter((item): item is NavItem => item !== null)
}

function filterNavGroupsByPermission(
  menuGroups: NavGroup[],
  getPermissionsForScope: (scope?: PermissionScope) => string[],
  superAdmin: boolean
): NavGroup[] {
  return menuGroups
    .map((group) => ({
      ...group,
      items: filterNavItemsByPermission(
        group.items,
        getPermissionsForScope,
        superAdmin
      ),
    }))
    .filter((group) => group.items.length > 0)
}

function getSidebarPermissionsForScope(scope?: PermissionScope) {
  return useSessionStore.getState().getPermissionsForScope(scope)
}

function getSidebarSuperAdmin() {
  return useSessionStore.getState().superAdmin
}

export function useSidebarData(): {
  data: SidebarData | undefined
  isLoading: boolean
} {
  const $api = useAPI()
  const { projectId } = useParams()
  const store = useSessionStore()

  const { data, isLoading } = useQuery({
    queryKey: ['sidebar-projects', $api] as const,
    queryFn: () =>
      $api.getProjects<PaginatedSidebarProjects>({
        query: {
          page: 1,
          pageSize: 200,
        },
      }),
  })

  if (!data) {
    return { data: undefined, isLoading }
  }

  const sidebarData = buildSidebarDataFromProjects(data.datas, projectId)
  const filteredNavGroups = filterNavGroupsByPermission(
    sidebarData.menuGroups,
    store.getPermissionsForScope,
    store.superAdmin
  )

  return {
    data: { ...sidebarData, menuGroups: filteredNavGroups },
    isLoading,
  }
}

export {
  filterNavItemsByPermission,
  filterNavGroupsByPermission,
  getSidebarPermissionsForScope,
  getSidebarSuperAdmin,
}
