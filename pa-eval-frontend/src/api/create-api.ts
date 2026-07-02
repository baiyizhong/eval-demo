import { AxiosHeaders, type AxiosRequestConfig } from 'axios'
import { request } from './request'
import type {
  ApiCallOptions,
  ApiClient,
  ApiEndpointConfig,
  ApiHeaders,
  ApiQueryParams,
  ApiRegistry,
} from './types'

const PATH_PARAM_RE = /:([A-Za-z0-9_]+)/g
const STRUCTURED_PAYLOAD_KEYS = ['path', 'query', 'body'] as const
const STRUCTURED_CONTROL_KEYS = new Set(['headers', 'config'])
type AxiosHeaderSource = Parameters<typeof AxiosHeaders.concat>[number]

const hasOwnKey = (keys: string[], target: string) => keys.includes(target)

const isStructuredOptions = (value: unknown): value is ApiCallOptions => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const keys = Object.keys(value)
  const hasPayloadKey = STRUCTURED_PAYLOAD_KEYS.some((key) =>
    hasOwnKey(keys, key)
  )
  const onlyHasControlKeys =
    keys.length > 0 && keys.every((key) => STRUCTURED_CONTROL_KEYS.has(key))

  return hasPayloadKey || onlyHasControlKeys
}

const mergeHeaders = (...headers: ApiHeaders[]) => {
  return AxiosHeaders.concat(
    ...(headers.filter(Boolean) as AxiosHeaderSource[])
  )
}

const buildUrl = (url: string, path?: ApiCallOptions['path']) => {
  return url.replace(PATH_PARAM_RE, (_, key: string) => {
    const value = path?.[key]

    if (value === undefined || value === null) {
      throw new Error(`Missing path parameter: ${key}`)
    }

    return encodeURIComponent(String(value))
  })
}

const normalizeOptions = (
  endpoint: ApiEndpointConfig,
  input?: ApiCallOptions | ApiQueryParams
) => {
  if (!input) {
    return {}
  }

  if (isStructuredOptions(input)) {
    return input
  }

  if (endpoint.method.toUpperCase() === 'GET') {
    return { query: input }
  }

  return { body: input }
}

export function createAPI<TRegistry extends ApiRegistry>(
  registry: TRegistry
): ApiClient<TRegistry> {
  return Object.entries(registry).reduce((client, [alias, endpoint]) => {
    return {
      ...client,
      [alias]: async (input?: ApiCallOptions | ApiQueryParams) => {
        const options = normalizeOptions(endpoint, input)
        const url = buildUrl(endpoint.url, options.path)

        const config: AxiosRequestConfig = {
          ...endpoint,
          ...options.config,
          url,
          method: endpoint.method,
          params: options.query,
          data: options.body,
          headers: mergeHeaders(
            endpoint.headers,
            options.headers,
            options.config?.headers
          ),
        }

        return request.request(config)
      },
    }
  }, {} as ApiClient<TRegistry>)
}
