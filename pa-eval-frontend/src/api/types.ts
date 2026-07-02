import type { AxiosRequestConfig, Method } from 'axios'

export type ApiPathParams = Record<string, string | number>
export type ApiQueryParams = Record<string, unknown>
export type ApiHeaders = AxiosRequestConfig['headers']
export type ApiRequestConfig = Omit<
  AxiosRequestConfig,
  'url' | 'method' | 'params' | 'data'
>

export type ApiCallOptions<TBody = unknown> = {
  path?: ApiPathParams
  query?: ApiQueryParams
  body?: TBody
  headers?: ApiHeaders
  config?: ApiRequestConfig
}

export type ApiEndpointConfig = Omit<
  AxiosRequestConfig,
  'url' | 'method' | 'params' | 'data'
> & {
  method: Method
  url: string
}

export type ApiRegistry = Record<string, ApiEndpointConfig>

export type ApiMethod = <TResponse = unknown, TBody = unknown>(
  options?: ApiCallOptions<TBody> | ApiQueryParams
) => Promise<TResponse>

export type ApiClient<TRegistry extends ApiRegistry> = {
  [Key in keyof TRegistry]: ApiMethod
}

export type ApiErrorPayload = {
  message: string
  status?: number
  code?: string
  details?: unknown
}
