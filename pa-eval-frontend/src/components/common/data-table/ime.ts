export type SearchInputCommitEvent = {
  eventType: 'change' | 'compositionend'
  value: string
  isComposing: boolean
}

export function getSearchInputCommitValue({
  eventType,
  value,
  isComposing,
}: SearchInputCommitEvent) {
  if (eventType === 'change' && isComposing) {
    return null
  }

  return value
}
