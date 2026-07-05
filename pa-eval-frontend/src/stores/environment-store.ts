import {
  type EnvironmentCode,
  isEnvironmentCode,
} from '@/modules/environment/environment-options'
import { create } from 'zustand'

const STORAGE_KEY = 'pa_eval_environment'

type EnvironmentStoreState = {
  environmentCode: EnvironmentCode | null
  setEnvironmentCode: (environmentCode: EnvironmentCode) => void
  resetEnvironment: () => void
}

function readStoredEnvironment() {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(STORAGE_KEY)
  return isEnvironmentCode(storedValue) ? storedValue : null
}

export const useEnvironmentStore = create<EnvironmentStoreState>((set) => ({
  environmentCode: readStoredEnvironment(),
  setEnvironmentCode: (environmentCode) =>
    set(() => {
      window.localStorage.setItem(STORAGE_KEY, environmentCode)
      return { environmentCode }
    }),
  resetEnvironment: () =>
    set(() => {
      window.localStorage.removeItem(STORAGE_KEY)
      return { environmentCode: null }
    }),
}))
