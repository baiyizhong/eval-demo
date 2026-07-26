function copyTextWithExecCommand(text: string) {
  if (typeof document === 'undefined') {
    return false
  }

  const textarea = document.createElement('textarea')
  const activeElement = document.activeElement
  const selection = document.getSelection()
  const selectedRange = selection?.rangeCount
    ? selection.getRangeAt(0).cloneRange()
    : null

  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.inset = '0 auto auto 0'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  try {
    return document.execCommand('copy')
  } finally {
    textarea.remove()

    if (selection && selectedRange) {
      selection.removeAllRanges()
      selection.addRange(selectedRange)
    }

    if (activeElement instanceof HTMLElement) {
      activeElement.focus({ preventScroll: true })
    }
  }
}

/**
 * 复制文本到剪贴板。
 *
 * 非安全上下文（例如 HTTP）中 Clipboard API 可能不存在或拒绝调用，
 * 此时自动降级到仍受主流浏览器支持的 execCommand 方案。
 */
export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Clipboard API may be blocked outside a secure context. Use the fallback.
    }
  }

  if (!copyTextWithExecCommand(text)) {
    throw new Error('无法访问剪贴板，请手动复制')
  }
}
