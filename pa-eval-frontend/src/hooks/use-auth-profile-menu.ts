import { type MouseEvent, useMemo } from 'react'
import { useNavigate } from 'react-router'

import { authMenuActions } from '@/lib/auth-menu'
import { getDisplayUserFromAccessToken } from '@/lib/auth-token'
import { useAuthStore } from '@/stores/auth-store'

type AuthMenuEvent = MouseEvent<HTMLAnchorElement | HTMLButtonElement>
type AuthMenuCompatibleAction = {
  id: string
}

export function useAuthProfileMenu() {
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  const user = useMemo(
    () => getDisplayUserFromAccessToken(auth.accessToken),
    [auth.accessToken]
  )

  const handleAuthMenuAction = (
    action: AuthMenuCompatibleAction,
    event: AuthMenuEvent
  ) => {
    if (action.id !== 'logout') {
      return
    }

    event.preventDefault()
    auth.reset()
    navigate('/login', { replace: true })
  }

  return {
    user,
    menuActions: authMenuActions,
    handleAuthMenuAction,
  }
}
