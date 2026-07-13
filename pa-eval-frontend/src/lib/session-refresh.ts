import type { ApiMethod } from '@/api/types'
import { useSessionStore } from '@/stores/session.store'
import type { UserSessionPayload } from '@/types/permission'

type SessionApiClient = {
  getSession: ApiMethod
}

export async function refreshSessionStore(api: SessionApiClient) {
  const payload = await api.getSession<UserSessionPayload>()
  useSessionStore.getState().setSession(payload)
  return payload
}
