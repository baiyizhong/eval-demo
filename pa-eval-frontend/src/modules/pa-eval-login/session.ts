import type { UserSessionPayload } from '@/types/permission'
import { useSessionStore } from '@/stores/session.store'

export const defaultSession: UserSessionPayload = {
  user: { name: 'Guest', email: '' },
  superAdmin: false,
  permissions: [],
  orgs: [],
}

export async function loadCurrentSession(
  fetcher: typeof fetch = globalThis.fetch
) {
  try {
    const res = await fetcher('/api/user/session', { credentials: 'include' })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const result = await res.json()
    const payload = result.data ?? result
    useSessionStore.getState().setSession(payload)
    return payload as UserSessionPayload
  } catch (err) {
    console.error(
      '[SessionInitializer] 会话数据加载失败，将以默认最小权限继续运行:',
      err
    )
    useSessionStore.getState().setSession(defaultSession)
    return defaultSession
  }
}
