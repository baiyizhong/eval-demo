export function buildGithubLoginUrl(apiBaseURL: string, authBaseURL?: string) {
  const baseUrl = (authBaseURL?.trim() || apiBaseURL).replace(/\/+$/, '')
  return `${baseUrl}/auth/github/login`
}
