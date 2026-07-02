import axios, { type AxiosError } from 'axios'
import { toast } from 'sonner'
import { env } from '@/config/env'
import type { ApiErrorPayload } from './types'

export const request = axios.create({
  baseURL: env.apiBaseURL,
  timeout: env.apiTimeout,
  withCredentials: env.apiWithCredentials,
})

request.interceptors.request.use((config) => {
  return config
})

request.interceptors.response.use(
  (response) => {
    const data = response.data

    if (
      data &&
      typeof data === 'object' &&
      'code' in data &&
      'message' in data &&
      'data' in data
    ) {
      if (data.code !== 0) {
        const message = data.message || '数据错误'
        toast.error(message, { id: `biz-${message}` })
        const error: ApiErrorPayload = {
          message,
          status: response.status,
          code: String(data.code),
        }
        return Promise.reject(error)
      }
      return data.data
    }

    return data
  },
  (error: AxiosError) => {
    const status = error.response?.status

    if (!error.response && !error.request) {
      // 网络异常（无 response 也无 request，可能是拦截器中断或 Cancel）
      const message = error.message || '网络异常'
      toast.error(message, { id: `network-${message}` })
    } else if (!error.response) {
      // 请求已发出但无响应（断网、超时、CORS 等）
      toast.error('网络连接失败，请检查网络后重试', {
        id: 'network-error',
        duration: Infinity,
      })
    } else if (status) {
      const statusMessages: Record<number, string> = {
        400: '请求参数错误',
        401: '登录已失效，请重新登录',
        403: '无访问权限',
        404: '请求资源不存在',
        500: '服务器内部错误',
        502: '服务暂不可用，请稍后重试',
        503: '服务维护中，请稍后重试',
        504: '网关超时，请稍后重试',
      }
      const id = `http-${status}` as string
      const serverMessage = (error.response?.data as Record<string, unknown>)?.message
      const msg = serverMessage
        ? String(serverMessage)
        : statusMessages[status] || `网络失败 (${status})`
      toast.error(msg, { id })
    }

    const payload: ApiErrorPayload = {
      message: error.message || 'Request failed',
      status: error.response?.status,
      code: error.code,
        details: error.response?.data as Record<string, unknown>,
    }

    return Promise.reject(payload)
  }
)
