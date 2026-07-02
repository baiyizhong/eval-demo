import { useMemo } from 'react'
import { api } from '@/api'

export function useAPI() {
  return useMemo(() => api, [])
}
