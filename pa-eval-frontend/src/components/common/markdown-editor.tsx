import { type CSSProperties, useState } from 'react'
import MDEditor, { type MDEditorProps } from '@uiw/react-md-editor'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type MarkdownMode = 'edit' | 'preview'

type MarkdownEditorPassthroughProps = Omit<
  MDEditorProps,
  | 'value'
  | 'onChange'
  | 'preview'
  | 'hideToolbar'
  | 'className'
  | 'height'
  | 'data-color-mode'
>

export type MarkdownEditorPanelProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  title?: string
  defaultMode?: MarkdownMode
  mode?: MarkdownMode
  onModeChange?: (mode: MarkdownMode) => void
  height?: number | string
  readOnly?: boolean
  className?: string
  editorClassName?: string
  editorProps?: MarkdownEditorPassthroughProps
}

const DEFAULT_MARKDOWN = ''

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall back for denied permissions or browser-specific clipboard failures.
    }
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.readOnly = true
  textArea.style.position = 'fixed'
  textArea.style.top = '-9999px'
  textArea.style.left = '-9999px'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()
  textArea.setSelectionRange(0, text.length)

  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textArea)
  }
}

export function MarkdownEditorPanel({
  value,
  defaultValue = DEFAULT_MARKDOWN,
  onValueChange,
  title = 'Markdown 文档',
  defaultMode = 'preview',
  mode,
  onModeChange,
  height = 200,
  readOnly = false,
  className,
  editorClassName,
  editorProps,
}: MarkdownEditorPanelProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const [internalMode, setInternalMode] = useState<MarkdownMode>(defaultMode)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  )
  const editorValue = value ?? internalValue
  const resolvedMode = mode ?? internalMode

  function handleValueChange(nextValue?: string) {
    const resolvedValue = nextValue ?? ''

    if (value === undefined) {
      setInternalValue(resolvedValue)
    }

    onValueChange?.(resolvedValue)
  }

  function handleModeChange(nextMode: string) {
    if (nextMode !== 'edit' && nextMode !== 'preview') {
      return
    }

    if (mode === undefined) {
      setInternalMode(nextMode)
    }

    onModeChange?.(nextMode)
  }

  async function handleCopyMarkdown() {
    try {
      const copied = await copyTextToClipboard(editorValue)
      setCopyStatus(copied ? 'copied' : 'failed')
    } catch {
      setCopyStatus('failed')
    }

    window.setTimeout(() => setCopyStatus('idle'), 1600)
  }

  const copyLabel =
    copyStatus === 'copied'
      ? '已复制'
      : copyStatus === 'failed'
        ? '复制失败'
        : '复制全部 Markdown'
  const CopyIcon = copyStatus === 'copied' ? Check : Copy
  const readOnlyBackgroundStyle = readOnly
    ? ({
        '--md-editor-background-color': 'var(--color-gray-100)',
        '--color-canvas-default': 'var(--color-gray-100)',
        backgroundColor: 'var(--color-gray-100)',
      } as CSSProperties)
    : undefined
  const previewOptions = {
    ...editorProps?.previewOptions,
    style: {
      fontSize: 14,
      ...editorProps?.previewOptions?.style,
      ...(readOnly ? { backgroundColor: 'var(--color-gray-100)' } : {}),
    },
  }

  return (
    <section
      className={cn(
        'markdown-editor-panel flex min-w-0 flex-col gap-3',
        className
      )}
    >
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex min-w-0 items-center gap-2'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type='button'
                variant='outline'
                size='icon'
                className='size-7 rounded-md'
                aria-label={copyLabel}
                title={copyLabel}
                onClick={handleCopyMarkdown}
              >
                <CopyIcon data-icon='inline-start' />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>复制全部</TooltipContent>
          </Tooltip>
          <h2 className='min-w-0 truncate text-sm font-medium'>{title}</h2>
          <span className='sr-only' aria-live='polite'>
            {copyStatus === 'idle' ? '' : copyLabel}
          </span>
        </div>

        {!readOnly ? (
          <ToggleGroup
            type='single'
            value={resolvedMode}
            onValueChange={handleModeChange}
            variant='outline'
            size='sm'
            spacing={0}
            className='shrink-0'
            aria-label='切换 Markdown 模式'
          >
            <ToggleGroupItem value='edit' aria-label='编辑 Markdown'>
              编辑
            </ToggleGroupItem>
            <ToggleGroupItem value='preview' aria-label='预览 Markdown'>
              预览
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </div>

      <div
        className={cn(
          'min-h-[200px] overflow-auto rounded-md border',
          readOnly ? 'bg-gray-100' : 'bg-white'
        )}
        style={{ height }}
      >
        <MDEditor
          {...editorProps}
          value={editorValue}
          onChange={handleValueChange}
          preview={resolvedMode}
          previewOptions={previewOptions}
          hideToolbar
          height='100%'
          style={{
            ...editorProps?.style,
            ...readOnlyBackgroundStyle,
          }}
          className={cn(
            'w-full text-sm',
            readOnly &&
              'bg-gray-100 [&_.w-md-editor-input]:bg-gray-100 [&_.wmde-markdown]:bg-gray-100 [&_.wmde-markdown pre]:bg-gray-100',
            editorClassName
          )}
          textareaProps={{
            ...editorProps?.textareaProps,
            readOnly,
            style: {
              fontSize: 14,
              ...editorProps?.textareaProps?.style,
            },
          }}
        />
      </div>
    </section>
  )
}
