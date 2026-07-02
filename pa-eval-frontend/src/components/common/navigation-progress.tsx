import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { RouterProviderProps } from 'react-router'
import LoadingBar, { type LoadingBarRef } from 'react-top-loading-bar'

type NavigationProgressProps = {
  router: RouterProviderProps['router']
}

export function NavigationProgress({ router }: NavigationProgressProps) {
  const ref = useRef<LoadingBarRef>(null)
  const state = useSyncExternalStore(
    router.subscribe,
    () => router.state,
    () => router.state
  )

  const isLoading =
    !state.initialized ||
    state.navigation.state === 'loading' ||
    state.revalidation === 'loading'

  useEffect(() => {
    if (isLoading) {
      ref.current?.start()
      return
    }

    ref.current?.complete()
  }, [
    isLoading,
    state.initialized,
    state.navigation.state,
    state.revalidation,
  ])

  return (
    <LoadingBar
      ref={ref}
      color='var(--primary)'
      shadow={false}
      height={2}
    />
  )
}
