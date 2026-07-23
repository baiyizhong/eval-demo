import { request } from '@/api/request'

export type AuthProviderType = 'form' | 'redirect'
export type AuthProviderId = 'enterprise_password' | 'oidc' | 'github'

export interface AuthProviderOption {
  id: AuthProviderId
  label: string
  type: AuthProviderType
}

export interface AuthOptions {
  providers: AuthProviderOption[]
}

export interface EnterprisePasswordLoginPayload {
  username: string
  password: string
}

export interface EnterprisePasswordLoginResult {
  redirectTo: string
}

export async function getAuthOptions() {
  return request.get<unknown, AuthOptions>('/auth/options')
}

export async function loginWithEnterprisePassword(
  payload: EnterprisePasswordLoginPayload
) {
  return request.post<unknown, EnterprisePasswordLoginResult>(
    '/auth/enterprise-password/login',
    payload
  )
}
