const readBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined || value === '') {
    return fallback
  }

  return value === 'true'
}

const readNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const readBasePath = (value: string | undefined) => {
  if (!value) {
    return '/'
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  const normalized = withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash

  return normalized || '/'
}

const viteEnv = import.meta.env ?? {}

export const env = {
  appTitle: viteEnv.VITE_APP_TITLE || 'AEP Admin',
  appBasePath: readBasePath(viteEnv.VITE_APP_BASE_PATH),
  apiBaseURL: viteEnv.VITE_API_BASE_URL || '/api',
  authBaseURL: viteEnv.VITE_AUTH_BASE_URL || '',
  apiTimeout: readNumber(viteEnv.VITE_API_TIMEOUT, 20000),
  authCookieName: viteEnv.VITE_AUTH_COOKIE_NAME || 'thisisjustarandomstring',
  apiWithCredentials: readBoolean(viteEnv.VITE_API_WITH_CREDENTIALS, false),
  enableMock: readBoolean(viteEnv.VITE_ENABLE_MOCK, false),
  buildSourcemap: readBoolean(viteEnv.VITE_BUILD_SOURCEMAP, false),
}
