import { deepParseJson } from './deps/utils/shared.ts';

export type MixEditorView = 'pretty' | 'json';

const MARKDOWN_PATTERNS = [
  String.raw`(\*\*?|__?)(.*?)\1`,
  String.raw`` + '`{3}[\\s\\S]*?`{3}',
  String.raw`` + '`[\\s\\S]*?`',
  String.raw`(^|\s)[-+*]\s`,
  String.raw`^\s*#{1,6}\s`,
  String.raw`^>\s+`,
  String.raw`^\d+\.\s`,
  String.raw`!\[.*?\]\(.*?\)`,
  String.raw`\[.*?\]\(.*?\)`,
].join('|');

const MARKDOWN_REGEX = new RegExp(MARKDOWN_PATTERNS, 'gm');

export function containsMarkdown(text: string): boolean {
  MARKDOWN_REGEX.lastIndex = 0;
  return MARKDOWN_REGEX.test(text);
}

export function parseMixEditorJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return deepParseJson(value, {
    maxSize: 500_000,
    maxDepth: 2,
  });
}

export function getMarkdownContent(value: unknown): string | undefined {
  if (typeof value === 'string' && containsMarkdown(value)) {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.constructor === Object
  ) {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 1) {
      const [, entryValue] = entries[0];
      if (typeof entryValue === 'string' && containsMarkdown(entryValue)) {
        return entryValue;
      }
    }
  }

  return undefined;
}

export function canRenderJsonTable(value: unknown): boolean {
  return value !== null && typeof value === 'object';
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLocaleLowerCase();
}

function matchesKeyword(value: unknown, normalizedKeyword: string): boolean {
  if (typeof value === 'string') {
    return value.toLocaleLowerCase().includes(normalizedKeyword);
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value).toLocaleLowerCase().includes(normalizedKeyword);
  }

  return false;
}

function containsJsonKeyword(value: unknown, normalizedKeyword: string): boolean {
  if (matchesKeyword(value, normalizedKeyword)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsJsonKeyword(item, normalizedKeyword));
  }

  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, entryValue]) =>
        key.toLocaleLowerCase().includes(normalizedKeyword) ||
        containsJsonKeyword(entryValue, normalizedKeyword),
    );
  }

  return false;
}

export function filterJsonByKeyword(
  value: unknown,
  keyword: string,
): unknown {
  const normalizedKeyword = normalizeKeyword(keyword);

  if (!normalizedKeyword) {
    return value;
  }

  if (matchesKeyword(value, normalizedKeyword)) {
    return value;
  }

  if (Array.isArray(value)) {
    const filteredItems = value.filter((item) =>
      containsJsonKeyword(item, normalizedKeyword),
    );

    return filteredItems.length > 0 ? filteredItems : undefined;
  }

  if (value !== null && typeof value === 'object') {
    const filteredEntries = Object.entries(value as Record<string, unknown>)
      .reduce<Array<[string, unknown]>>((entries, [key, entryValue]) => {
        if (key.toLocaleLowerCase().includes(normalizedKeyword)) {
          entries.push([key, entryValue]);
          return entries;
        }

        const filteredValue = filterJsonByKeyword(
          entryValue,
          normalizedKeyword,
        );

        if (filteredValue !== undefined) {
          entries.push([key, filteredValue]);
        }

        return entries;
      }, []);

    return filteredEntries.length > 0
      ? Object.fromEntries(filteredEntries)
      : undefined;
  }

  return undefined;
}

export function stringifyForEditor(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value ?? null, null, 2);
}

export function stringifyForCopy(value: unknown, markdown?: string): string {
  if (markdown !== undefined) {
    return markdown;
  }

  return stringifyForEditor(value);
}

export function parseEditedValue(value: string, previousValue: unknown): unknown {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  const previousWasStructured =
    previousValue !== null && typeof previousValue === 'object';
  const looksLikeJson =
    ['{', '['].includes(trimmed[0]) ||
    ['true', 'false', 'null'].includes(trimmed) ||
    /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed);

  if (previousWasStructured || looksLikeJson) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
}

export type EditableJsonDraftResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

export function parseEditableJsonDraft(
  value: string,
  previousValue: unknown,
): EditableJsonDraftResult {
  const previousWasStructured =
    previousValue !== null && typeof previousValue === 'object';

  if (!previousWasStructured) {
    return { ok: true, value: parseEditedValue(value, previousValue) };
  }

  try {
    return { ok: true, value: JSON.parse(value.trim()) };
  } catch {
    return { ok: false, message: 'JSON 语法错误，请修正后再保存。' };
  }
}
