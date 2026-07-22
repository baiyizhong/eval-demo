export type SearchInputCommitEvent = {
  eventType: 'change' | 'compositionend' | 'keydown' | 'submit' | 'clear'
  key?: string
  value: string
  isComposing: boolean
}

export function getSearchInputCommitValue({
  eventType,
  key,
  value,
  isComposing,
}: SearchInputCommitEvent) {
  if (isComposing) {
    return null
  }

  if (eventType === 'keydown') {
    return key === 'Enter' ? value : null
  }

  if (eventType === 'submit') {
    return value
  }

  if (eventType === 'clear') {
    return ''
  }

  return null
}
