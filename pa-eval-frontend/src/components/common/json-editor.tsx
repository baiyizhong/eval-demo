import { useMemo, useState } from 'react'
import {
  JsonEditor,
  githubLightTheme,
  type JsonData,
  type JsonEditorProps,
  type ThemeInput,
} from 'json-edit-react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type EditorPassthroughProps = Omit<
  JsonEditorProps,
  | 'data'
  | 'setData'
  | 'theme'
  | 'className'
  | 'rootName'
  | 'viewOnly'
  | 'searchText'
  | 'collapse'
  | 'minWidth'
  | 'maxWidth'
>

export type JsonEditorPanelProps = {
  data?: JsonData
  defaultData?: JsonData
  onDataChange?: (data: JsonData) => void
  title?: string
  rootName?: string
  readOnly?: boolean
  searchable?: boolean
  searchText?: string
  onSearchTextChange?: (searchText: string) => void
  collapse?: JsonEditorProps['collapse']
  height?: number | string
  maxWidth?: JsonEditorProps['maxWidth']
  minWidth?: JsonEditorProps['minWidth']
  className?: string
  editorClassName?: string
  theme?: ThemeInput
  editorProps?: EditorPassthroughProps
}

const DEFAULT_DATA: JsonData = {}

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

const containerTheme = {
  styles: {
    container: {
      backgroundColor: 'transparent',
      borderRadius: 6,
      padding: 12,
    },
  },
} satisfies ThemeInput

export function JsonEditorPanel({
  data,
  defaultData = DEFAULT_DATA,
  onDataChange,
  title = 'JSON 配置',
  rootName = 'config',
  readOnly = false,
  searchable = true,
  searchText,
  onSearchTextChange,
  collapse = false,
  height,
  maxWidth = '100%',
  minWidth = '100%',
  className,
  editorClassName,
  theme,
  editorProps,
}: JsonEditorPanelProps) {
  const [internalData, setInternalData] = useState<JsonData>(defaultData)
  const [internalSearchText, setInternalSearchText] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  )
  const isControlled = data !== undefined
  const editorData = isControlled ? data : internalData
  const resolvedSearchText = searchable
    ? (searchText ?? internalSearchText)
    : undefined
  const resolvedTheme = useMemo<ThemeInput>(() => {
    const themeOverrides = theme ? (Array.isArray(theme) ? theme : [theme]) : []

    return [githubLightTheme, containerTheme, ...themeOverrides]
  }, [theme])

  const setEditorData = (nextData: JsonData) => {
    if (!isControlled) {
      setInternalData(nextData)
    }

    onDataChange?.(nextData)
  }

  function handleSearchTextChange(nextSearchText: string) {
    if (searchText === undefined) {
      setInternalSearchText(nextSearchText)
    }

    onSearchTextChange?.(nextSearchText)
  }

  async function handleCopyJson() {
    try {
      const copied = await copyTextToClipboard(
        JSON.stringify(editorData, null, 2)
      )
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
        : '复制全部 JSON'
  const CopyIcon = copyStatus === 'copied' ? Check : Copy

  return (
    <section
      className={cn('json-editor-panel flex min-w-0 flex-col gap-3', className)}
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
                onClick={handleCopyJson}
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

        {searchable ? (
          <Input
            type='search'
            value={resolvedSearchText}
            onChange={(event) => handleSearchTextChange(event.target.value)}
            placeholder='搜索关键字'
            className='h-8 sm:w-56'
          />
        ) : null}
      </div>
      <div
        className={cn(
          'min-h-[200px] overflow-auto rounded-md border p-3',
          readOnly ? 'bg-gray-100' : 'bg-white'
        )}
        style={{ height }}
      >
        <JsonEditor
          {...editorProps}
          data={editorData}
          setData={setEditorData}
          rootName={rootName}
          viewOnly={readOnly}
          searchText={resolvedSearchText}
          searchFilter={editorProps?.searchFilter ?? 'all'}
          collapse={collapse}
          minWidth={minWidth}
          maxWidth={maxWidth}
          rootFontSize={editorProps?.rootFontSize ?? 13}
          showIconTooltips={editorProps?.showIconTooltips ?? true}
          showCollectionCount={
            editorProps?.showCollectionCount ?? 'when-closed'
          }
          theme={resolvedTheme}
          className={cn('min-w-full', editorClassName)}
        />
      </div>
    </section>
  )
}
