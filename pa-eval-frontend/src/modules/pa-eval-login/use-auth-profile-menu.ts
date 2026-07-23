import { type MouseEvent, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { useEnvironmentStore } from '@/stores/environment-store'
import { useSessionStore } from '@/stores/session.store'
import { authMenuActions } from '@/lib/auth-menu'

type AuthMenuEvent = MouseEvent<HTMLAnchorElement | HTMLButtonElement>
type AuthMenuCompatibleAction = {
  id: string
}

function getInitial(value: string) {
  return value.trim().charAt(0).toUpperCase()
}

export function useAuthProfileMenu() {
  const navigate = useNavigate()
  const resetAuth = useAuthStore((state) => state.auth.reset)
  const sessionUser = useSessionStore((state) => state.user)
  const resetEnvironment = useEnvironmentStore(
    (state) => state.resetEnvironment
  )
  const user = useMemo(() => {
    if (!sessionUser) {
      return null
    }

    return {
      name: sessionUser.name,
      email: sessionUser.email,
      initials: getInitial(sessionUser.name || sessionUser.email),
    }
  }, [sessionUser])

  const handleAuthMenuAction = (
    action: AuthMenuCompatibleAction,
    event: AuthMenuEvent
  ) => {
    if (action.id !== 'logout') {
      return
    }

    event.preventDefault()
    resetAuth()
    resetEnvironment()
    navigate('/login', { replace: true })
  }

  return {
    user,
    menuActions: authMenuActions,
    handleAuthMenuAction,
  }
}
