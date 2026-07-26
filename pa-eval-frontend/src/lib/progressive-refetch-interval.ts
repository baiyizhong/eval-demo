export type ProgressiveRefetchIntervalOptions = {
  initialInterval?: number
  multiplier?: number
  maxAttempts?: number
}

type ProgressiveRefetchQuery = {
  state: {
    dataUpdateCount: number
    errorUpdateCount: number
  }
}

export function createProgressiveRefetchInterval({
  initialInterval = 2_000,
  multiplier = 2,
  maxAttempts = 5,
}: ProgressiveRefetchIntervalOptions = {}) {
  return (query: ProgressiveRefetchQuery): number | false => {
    const completedRequestCount =
      query.state.dataUpdateCount + query.state.errorUpdateCount
    const completedPollingCount = Math.max(0, completedRequestCount - 1)

    if (completedPollingCount >= maxAttempts) return false

    return initialInterval * multiplier ** completedPollingCount
  }
}
