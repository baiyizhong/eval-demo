export type RedirectAuthProvider = 'github' | 'oidc'

export function buildAuthLoginUrl(
  provider: RedirectAuthProvider,
  apiBaseURL: string,
  authBaseURL?: string
) {
  const baseUrl = (authBaseURL?.trim() || apiBaseURL).replace(/\/+$/, '')
  return `${baseUrl}/auth/${provider}/login`
}
