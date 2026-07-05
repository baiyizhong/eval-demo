import { type MouseEvent, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { useEnvironmentStore } from '@/stores/environment-store'
import { authMenuActions } from '@/lib/auth-menu'
import { getDisplayUserFromAccessToken } from '@/lib/auth-token'

type AuthMenuEvent = MouseEvent<HTMLAnchorElement | HTMLButtonElement>
type AuthMenuCompatibleAction = {
  id: string
}

export function useAuthProfileMenu() {
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  const resetEnvironment = useEnvironmentStore(
    (state) => state.resetEnvironment
  )
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
    resetEnvironment()
    navigate('/login', { replace: true })
  }

  return {
    user,
    menuActions: authMenuActions,
    handleAuthMenuAction,
  }
}
