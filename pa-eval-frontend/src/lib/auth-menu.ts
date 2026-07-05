import { LogOut, type LucideIcon } from 'lucide-react'

export type AuthMenuAction = {
  id: 'logout'
  label: string
  icon: LucideIcon
  title: string
  ariaLabel: string
  href?: string
}

export const authMenuActions: AuthMenuAction[] = [
  {
    id: 'logout',
    label: '退出登录',
    icon: LogOut,
    title: '退出登录',
    ariaLabel: '退出登录',
  },
]
