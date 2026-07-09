import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  Check,
  Copy,
  Edit3,
  FileJson,
  FileText,
  FoldVertical,
  Save,
  Search,
  Table2,
  UnfoldVertical,
  X,
} from 'lucide-react';
import { CodeMirrorEditor } from './deps/editor/CodeMirrorEditor';
import { JSONView } from './deps/ui/CodeJsonViewer';
import { Button } from './deps/ui/button';
import { cn } from './deps/ui/utils';
import { copyTextToClipboard } from './deps/utils/clipboard';
import { MixJsonTable } from './MixJsonTable';
import { MixMarkdownView } from './MixMarkdownView';
import {
  canRenderJsonTable,
  filterJsonByKeyword,
  getMarkdownContent,
  parseEditableJsonDraft,
  parseMixEditorJson,
  stringifyForCopy,
  stringifyForEditor,
  type MixEditorView,
} from './utils';

const MIX_EDITOR_CHANGE_DEBOUNCE_MS = 300;

function getParsedMixEditorValue(rawValue: unknown, forceTextMode: boolean) {
  return forceTextMode
    ? typeof rawValue === 'string'
      ? rawValue
      : stringifyForEditor(rawValue)
    : parseMixEditorJson(rawValue);
}

export type MixEditorProps = {
  value?: unknown;
  defaultValue?: unknown;
  onValueChange?: (value: unknown) => void;
  title?: string;
  view?: MixEditorView;
  defaultView?: MixEditorView;
  onViewChange?: (view: MixEditorView) => void;
  readOnly?: boolean;
  defaultEditing?: boolean;
  showEditButton?: boolean;
  showEditActions?: boolean;
  forceTextMode?: boolean;
  jsonCollapsedDepth?: number;
  className?: string;
  editorClassName?: string;
  editorMinHeight?: number | string;
  editorMaxHeight?: number | string;
};

export function MixEditor({
  value,
  defaultValue = null,
  onValueChange,
  title,
  view,
  defaultView,
  onViewChange,
  readOnly = false,
  defaultEditing = false,
  showEditButton = true,
  showEditActions = true,
  forceTextMode = false,
  jsonCollapsedDepth = 1,
  className,
  editorClassName,
  editorMinHeight = 160,
  editorMaxHeight = 400,
}: MixEditorProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [internalView, setInternalView] = useState<MixEditorView | undefined>(
    defaultView,
  );
  const [isEditing, setIsEditing] = useState(defaultEditing && !readOnly);
  const [jsonIsCollapsed, setJsonIsCollapsed] = useState(
    jsonCollapsedDepth !== undefined,
  );
  const [draft, setDraft] = useState(() =>
    defaultEditing && !readOnly
      ? stringifyForEditor(
          getParsedMixEditorValue(value ?? defaultValue, forceTextMode),
        )
      : '',
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autoChangeReadyRef = useRef(false);
  const lastAutoChangedDraftRef = useRef<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

  const rawValue = value ?? internalValue;
  const parsedValue = useMemo(
    () => getParsedMixEditorValue(rawValue, forceTextMode),
    [forceTextMode, rawValue],
  );
  const markdown = useMemo(
    () => (forceTextMode ? undefined : getMarkdownContent(parsedValue)),
    [forceTextMode, parsedValue],
  );
  const isStructuredValue = canRenderJsonTable(parsedValue);
  const resolvedView =
    view ?? internalView ?? (isStructuredValue ? 'pretty' : 'json');
  const isPlainText = typeof parsedValue === 'string' && markdown === undefined;
  const tableAvailable =
    resolvedView === 'pretty' &&
    markdown === undefined &&
    isStructuredValue;
  const isStructuredJsonRendering =
    !isEditing &&
    isStructuredValue &&
    resolvedView === 'json';
  const editorMode = isStructuredValue ? 'json' : 'text';
  const canShowEditButton = showEditButton && !readOnly;
  const canSearchValue = isStructuredValue && markdown === undefined;
  const normalizedSearchKeyword = searchKeyword.trim();
  const searchIsActive = canSearchValue && normalizedSearchKeyword.length > 0;
  const filteredValue = useMemo(
    () =>
      searchIsActive
        ? filterJsonByKeyword(parsedValue, normalizedSearchKeyword)
        : parsedValue,
    [parsedValue, normalizedSearchKeyword, searchIsActive],
  );
  const draftValidation = useMemo(
    () =>
      isEditing
        ? forceTextMode
          ? { ok: true as const, value: draft }
          : parseEditableJsonDraft(draft, parsedValue)
        : { ok: true as const, value: undefined },
    [draft, forceTextMode, isEditing, parsedValue],
  );
  const hasSearchResults = !searchIsActive || filteredValue !== undefined;
  const displayValue = hasSearchResults ? filteredValue : parsedValue;
  const resolvedJsonCollapsedDepth = jsonCollapsedDepth ?? 1;
  const CopyIcon = copyStatus === 'copied' ? Check : Copy;

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  function setEditorView(nextView: MixEditorView) {
    if (view === undefined) {
      setInternalView(nextView);
    }

    onViewChange?.(nextView);
  }

  const commitValue = useCallback((nextValue: unknown) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
  }, [onValueChange, value]);

  useEffect(() => {
    if (!isEditing || showEditActions) {
      autoChangeReadyRef.current = false;
      lastAutoChangedDraftRef.current = null;
      return;
    }

    if (!autoChangeReadyRef.current) {
      autoChangeReadyRef.current = true;
      return;
    }

    if (!draftValidation.ok) {
      return;
    }

    if (lastAutoChangedDraftRef.current === draft) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastAutoChangedDraftRef.current = draft;
      commitValue(draftValidation.value);
    }, MIX_EDITOR_CHANGE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [commitValue, draft, draftValidation, isEditing, showEditActions]);

  function handleEdit() {
    setDraft(stringifyForEditor(parsedValue));
    setIsEditing(true);
  }

  function handleCancelEdit() {
    setDraft('');
    setIsEditing(false);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setSearchOpen(false);
    }
  }

  function handleSaveEdit() {
    if (!draftValidation.ok) {
      return;
    }

    commitValue(draftValidation.value);
    setIsEditing(false);
  }

  function handleJsonToggleCollapse() {
    setJsonIsCollapsed((collapsed) => !collapsed);
  }

  async function handleCopy() {
    try {
      await copyTextToClipboard(
        stringifyForCopy(parsedValue, markdown),
      );
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }

    window.setTimeout(() => setCopyStatus('idle'), 1500);
  }

  return (
    <section
      className={cn(
        'min-w-0 rounded-md border bg-background p-3 text-foreground',
        className,
      )}
    >
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-5 rounded-sm"
            onClick={handleCopy}
            title={copyStatus === 'copied' ? '已复制' : '复制'}
            aria-label={copyStatus === 'copied' ? '已复制' : '复制'}
          >
            <CopyIcon className="size-3.5" />
          </Button>
          {title ? (
            <h3 className="truncate text-sm font-medium">{title}</h3>
          ) : null}
          <span className="sr-only" aria-live="polite">
            {copyStatus === 'idle'
              ? ''
              : copyStatus === 'copied'
                ? '已复制'
                : '复制失败'}
          </span>
        </div>

        <div className="relative flex shrink-0 items-center gap-1">
          {!isEditing ? (
            <>
              {canSearchValue ? (
                <>
                  <Button
                    type="button"
                    variant={searchIsActive ? 'secondary' : 'ghost'}
                    size="icon-xs"
                    onClick={() => setSearchOpen((open) => !open)}
                    title="搜索"
                    aria-label="搜索"
                    aria-expanded={searchOpen}
                  >
                    <Search className="size-3" />
                  </Button>
                  {searchOpen ? (
                    <div className="absolute right-0 bottom-full z-10 mb-1 w-56 rounded-sm border bg-background p-2 shadow-md">
                      <label className="block">
                        <span className="sr-only">搜索 JSON</span>
                        <div className="flex items-center gap-1">
                          <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                              ref={searchInputRef}
                              type="search"
                              value={searchKeyword}
                              onChange={(event) =>
                                setSearchKeyword(event.target.value)
                              }
                              onKeyDown={handleSearchKeyDown}
                              placeholder="搜索关键字"
                              className="h-7 w-full rounded-sm border bg-background pl-7 pr-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                          </div>
                          <button
                            type="button"
                            className="flex size-6 shrink-0 items-center justify-center rounded-xs text-[10px] text-muted-foreground hover:bg-muted"
                            onClick={() => {
                              setSearchKeyword('');
                              setSearchOpen(false);
                            }}
                            aria-label="取消搜索"
                            title="取消搜索"
                          >
                            取消
                          </button>
                        </div>
                      </label>
                    </div>
                  ) : null}
                </>
              ) : null}
              {isStructuredJsonRendering ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleJsonToggleCollapse}
                  title={jsonIsCollapsed ? 'Expand all' : 'Collapse all'}
                  aria-label={jsonIsCollapsed ? 'Expand all' : 'Collapse all'}
                >
                  {jsonIsCollapsed ? (
                    <UnfoldVertical className="size-3" />
                  ) : (
                    <FoldVertical className="size-3" />
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                variant={
                  resolvedView === 'json' || isPlainText ? 'secondary' : 'ghost'
                }
                size="xs"
                onClick={() => setEditorView('json')}
              >
                {isStructuredValue ? (
                  <FileJson className="size-3.5" />
                ) : (
                  <FileText className="size-3.5" />
                )}
                {isStructuredValue ? 'JSON' : 'Text'}
              </Button>
              {!isPlainText ? (
                <Button
                  type="button"
                  variant={resolvedView === 'pretty' ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => setEditorView('pretty')}
                >
                  <Table2 className="size-3.5" />
                  格式化
                </Button>
              ) : null}
              {canShowEditButton ? (
                <Button type="button" variant="ghost" size="xs" onClick={handleEdit}>
                  <Edit3 className="size-3.5" />
                  编辑
                </Button>
              ) : null}
            </>
          ) : showEditActions ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={handleSaveEdit}
                disabled={!draftValidation.ok}
              >
                <Save className="size-3.5" />
                保存
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleCancelEdit}
              >
                <X className="size-3.5" />
                取消
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <>
          <CodeMirrorEditor
            value={draft}
            onChange={setDraft}
            mode={editorMode}
            minHeight={editorMinHeight}
            maxHeight={editorMaxHeight}
            className={cn('rounded-none border-0', editorClassName)}
          />
          {!draftValidation.ok ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {draftValidation.message}
            </p>
          ) : null}
        </>
      ) : searchIsActive && !hasSearchResults ? (
        <div className="flex min-h-[120px] items-center justify-center rounded-sm border border-dashed text-xs text-muted-foreground">
          无匹配结果
        </div>
      ) : resolvedView === 'pretty' && tableAvailable ? (
        <MixJsonTable value={displayValue} />
      ) : resolvedView === 'pretty' && markdown !== undefined ? (
        <MixMarkdownView markdown={markdown} />
      ) : (
        <JSONView
          json={displayValue}
          hideTitle
          borderless
          collapseStringsAfterLength={null}
          externalJsonCollapsed={jsonIsCollapsed}
          jsonCollapsedDepth={resolvedJsonCollapsedDepth}
          onToggleCollapse={handleJsonToggleCollapse}
          codeClassName="max-h-[520px] overflow-auto"
        />
      )}
    </section>
  );
}

export type { MixEditorView };
