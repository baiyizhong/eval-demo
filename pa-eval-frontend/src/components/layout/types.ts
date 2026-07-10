import type { PermissionAccessRule, PermissionScope } from '@/types/permission'
import { type LinkProps } from 'react-router'
import { type ActiveMatch } from '@/lib/nav'

type Team = {
  id?: string
  organizationId?: string
  name: string
  logo: string
  plan: string
}

type BaseNavItem = {
  title: string
  badge?: string
  icon?: string
  activeMatch?: ActiveMatch
  /** 权限码，匹配任意一个即有权限 */
  access?: string | string[]
  /** 多组权限规则，匹配任意一组即有权限 */
  accessRules?: PermissionAccessRule[]
  /** 仅超管可访问 */
  superAccess?: boolean
  /** 权限作用域 */
  scope?: PermissionScope
  /** 项目 ID，用于多项目权限场景 */
  projectId?: string
}

type NavLink = BaseNavItem & {
  url: LinkProps['to'] | (string & {})
  items?: never
}

type NavCollapsible = BaseNavItem & {
  items: (BaseNavItem & { url: LinkProps['to'] | (string & {}) })[]
  url?: never
}

type NavItem = NavCollapsible | NavLink

type NavGroup = {
  title: string
  items: NavItem[]
}

type SidebarData = {
  teams: Team[]
  menuGroups: NavGroup[]
}

export type { SidebarData, NavGroup, NavItem, NavCollapsible, NavLink }
