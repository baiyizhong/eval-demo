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

export const env = {
  appTitle: import.meta.env.VITE_APP_TITLE || 'AEP Admin',
  appBasePath: readBasePath(import.meta.env.VITE_APP_BASE_PATH),
  apiBaseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  apiTimeout: readNumber(import.meta.env.VITE_API_TIMEOUT, 20000),
  apiWithCredentials: readBoolean(
    import.meta.env.VITE_API_WITH_CREDENTIALS,
    false
  ),
  enableMock: readBoolean(import.meta.env.VITE_ENABLE_MOCK, false),
  buildSourcemap: readBoolean(import.meta.env.VITE_BUILD_SOURCEMAP, false),
}
