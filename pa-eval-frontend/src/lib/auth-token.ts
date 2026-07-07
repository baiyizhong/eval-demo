import type { TopNavUser } from '@/components/layout/top-nav'

export type AuthTokenPayload = {
  provider?: string
  sub?: string
  login?: string
  langfuseUserId?: string
  email?: string
  name?: string | null
  iat?: number
}

export function readAccessToken(value: string | undefined): string {
  if (!value) return ''

  try {
    return JSON.parse(value) as string
  } catch {
    return value
  }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  )
  const binary = globalThis.atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function parseAuthTokenPayload(
  accessToken: string
): AuthTokenPayload | null {
  if (!accessToken.startsWith('pa.')) {
    return null
  }

  const [, encodedPayload] = accessToken.split('.')
  if (!encodedPayload) {
    return null
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload))
    return payload && typeof payload === 'object'
      ? (payload as AuthTokenPayload)
      : null
  } catch {
    return null
  }
}

function firstPresentString(...values: Array<unknown>) {
  return values.find((value): value is string => {
    return typeof value === 'string' && value.trim().length > 0
  })
}

function getInitial(value: string) {
  return value.trim().charAt(0).toUpperCase()
}

export function getDisplayUserFromAccessToken(
  accessToken: string
): TopNavUser | null {
  const payload = parseAuthTokenPayload(accessToken)
  const email = firstPresentString(payload?.email)

  if (!payload || !email) {
    return null
  }

  const fallbackName = email.split('@')[0]
  const name =
    firstPresentString(payload.name, payload.login, fallbackName) ?? email

  return {
    name,
    email,
    initials: getInitial(name),
  }
}
