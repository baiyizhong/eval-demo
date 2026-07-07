import type { JsonEditorPanelProps } from '@/components/common/json-editor'

export const TRACE_METADATA_JSON_EDITOR_CONFIG = {
  title: 'Metadata',
  rootName: 'metadata',
  searchable: true,
} satisfies Pick<JsonEditorPanelProps, 'title' | 'rootName' | 'searchable'>
