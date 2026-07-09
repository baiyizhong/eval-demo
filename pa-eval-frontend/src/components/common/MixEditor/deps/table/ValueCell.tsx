import { memo, type JSX, useState } from "react";
import { type Row } from "@tanstack/react-table";
import { type JsonTableRow } from "./utils/jsonExpansionUtils";
import { copyTextToClipboard } from "../utils/clipboard";
import { Button } from "../ui/button";
import { Copy, Check } from "lucide-react";
import { cn } from "../ui/utils";

// Migrated from /Users/panpan/Project/eval-demo/langfuse/web/src/components/table/ValueCell.tsx
const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/i;
const MAX_STRING_LENGTH_FOR_LINK_DETECTION = 1500;
export const MAX_CELL_DISPLAY_CHARS = 2000;
const SMALL_ARRAY_THRESHOLD = 5;
const ARRAY_PREVIEW_ITEMS = 3;
const OBJECT_PREVIEW_KEYS = 2;
const MONO_TEXT_CLASSES = "font-mono text-xs wrap-break-word";
const PREVIEW_TEXT_CLASSES = "italic text-gray-500 dark:text-gray-400";

function renderStringWithLinks(text: string): React.ReactNode {
  if (text.length >= MAX_STRING_LENGTH_FOR_LINK_DETECTION) {
    return text;
  }

  const localUrlRegex = new RegExp(urlRegex.source, "gi");
  const parts = text.split(localUrlRegex);
  const matches = text.match(localUrlRegex) || [];

  const result: React.ReactNode[] = [];
  let matchIndex = 0;

  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) {
      result.push(parts[i]);
    }

    if (matchIndex < matches.length) {
      const url = matches[matchIndex];
      result.push(
        <a
          key={`link-${matchIndex}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-80"
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>,
      );
      matchIndex++;
    }
  }

  return result;
}

function getValueType(value: unknown): JsonTableRow["type"] {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonTableRow["type"];
}

function renderArrayValue(arr: unknown[]): JSX.Element {
  if (arr.length === 0) {
    return <span className={PREVIEW_TEXT_CLASSES}>empty list</span>;
  }

  if (arr.length <= SMALL_ARRAY_THRESHOLD) {
    const displayItems = arr
      .map((item) => {
        const itemType = getValueType(item);
        if (itemType === "string") return `"${String(item)}"`;
        if (itemType === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          const keys = Object.keys(obj);
          if (keys.length === 0) return "{}";
          if (keys.length <= OBJECT_PREVIEW_KEYS) {
            const keyPreview = keys.map((k) => `"${k}": ...`).join(", ");
            return `{${keyPreview}}`;
          } else {
            return `{"${keys[0]}": ...}`;
          }
        }
        if (itemType === "array") return "...";
        return String(item);
      })
      .join(", ");
    return <span className={PREVIEW_TEXT_CLASSES}>[{displayItems}]</span>;
  } else {
    const preview = arr
      .slice(0, ARRAY_PREVIEW_ITEMS)
      .map((item) => {
        const itemType = getValueType(item);
        if (itemType === "string") return `"${String(item)}"`;
        if (itemType === "object" || itemType === "array") return "...";
        return String(item);
      })
      .join(", ");
    return (
      <span className={PREVIEW_TEXT_CLASSES}>
        [{preview}, ...{arr.length - ARRAY_PREVIEW_ITEMS} more]
      </span>
    );
  }
}

function renderObjectValue(obj: Record<string, unknown>): JSX.Element {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return <span className={PREVIEW_TEXT_CLASSES}>empty object</span>;
  }
  return <span className={PREVIEW_TEXT_CLASSES}>{keys.length} items</span>;
}

export function getValueStringLength(value: unknown): number {
  if (typeof value === "string") {
    return value.length;
  }
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

function getTruncatedValue(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const truncated = value.substring(0, maxChars);
  const lastSpaceIndex = truncated.lastIndexOf(" ");

  if (lastSpaceIndex > maxChars * 0.8) {
    return truncated.substring(0, lastSpaceIndex) + "...";
  }

  return truncated + "...";
}

function getCopyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const ValueCell = memo(
  ({
    row,
    expandedCells,
    toggleCellExpansion,
    preserveStringWhitespace = false,
    copyButtonClassName,
    copyIconClassName,
  }: {
    row: Row<JsonTableRow>;
    expandedCells: Set<string>;
    toggleCellExpansion: (cellId: string) => void;
    preserveStringWhitespace?: boolean;
    copyButtonClassName?: string;
    copyIconClassName?: string;
  }) => {
    const { value, type } = row.original;
    const cellId = `${row.id}-value`;
    const isCellExpanded = expandedCells.has(cellId);
    const [showCopySuccess, setShowCopySuccess] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const copyValue = getCopyValue(value);

      try {
        await copyTextToClipboard(copyValue);
        setShowCopySuccess(true);
        setTimeout(() => setShowCopySuccess(false), 1500);
      } catch {
        // Copy failed silently
      }
    };

    const getDisplayValue = () => {
      switch (type) {
        case "string": {
          const stringValue = String(value);
          const needsTruncation = stringValue.length > MAX_CELL_DISPLAY_CHARS;
          const displayValue =
            needsTruncation && !isCellExpanded
              ? getTruncatedValue(stringValue, MAX_CELL_DISPLAY_CHARS)
              : stringValue;

          return {
            content: (
              <span
                className={`text-green-600 dark:text-green-400 ${
                  preserveStringWhitespace
                    ? "whitespace-pre-wrap"
                    : "whitespace-pre-line"
                }`}
              >
                &quot;{renderStringWithLinks(displayValue)}&quot;
              </span>
            ),
            needsTruncation,
          };
        }
        case "number":
          return {
            content: (
              <span className="text-blue-600 dark:text-blue-400">
                {String(value)}
              </span>
            ),
            needsTruncation: false,
          };
        case "boolean":
          return {
            content: (
              <span className="text-orange-600 dark:text-orange-400">
                {String(value)}
              </span>
            ),
            needsTruncation: false,
          };
        case "null":
          return {
            content: (
              <span className="text-gray-500 italic dark:text-gray-400">
                null
              </span>
            ),
            needsTruncation: false,
          };
        case "undefined":
          return {
            content: (
              <span className="text-gray-500 dark:text-gray-400">
                undefined
              </span>
            ),
            needsTruncation: false,
          };
        case "array":
          return {
            content: renderArrayValue(value as unknown[]),
            needsTruncation: false,
          };
        case "object":
          return {
            content: renderObjectValue(value as Record<string, unknown>),
            needsTruncation: false,
          };
        default: {
          const stringValue = String(value);
          const needsTruncation = stringValue.length > MAX_CELL_DISPLAY_CHARS;
          const displayValue =
            needsTruncation && !isCellExpanded
              ? getTruncatedValue(stringValue, MAX_CELL_DISPLAY_CHARS)
              : stringValue;

          return {
            content: (
              <span className="text-gray-600 dark:text-gray-400">
                {displayValue}
              </span>
            ),
            needsTruncation,
          };
        }
      }
    };

    const { content, needsTruncation } = getDisplayValue();

    return (
      <div className={`${MONO_TEXT_CLASSES} group relative max-w-full`}>
        <span className="cursor-text">{content}</span>
        {needsTruncation && !row.original.hasChildren && (
          <div
            className="inline cursor-pointer opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              toggleCellExpansion(cellId);
            }}
          >
            {isCellExpanded
              ? "\n...collapse"
              : `\n...expand (${getValueStringLength(value) - MAX_CELL_DISPLAY_CHARS} more characters)`}
          </div>
        )}

        <Button
          variant="ghost"
          size="icon-xs"
          className={cn(
            "bg-background/80 hover:bg-background absolute top-0 right-0 border opacity-0 shadow-xs transition-opacity duration-200 group-hover:opacity-100",
            copyButtonClassName,
          )}
          onClick={handleCopy}
          title="Copy value"
          aria-label="Copy cell value"
        >
          {showCopySuccess ? (
            <Check className={cn("h-2.5 w-2.5 text-green-600", copyIconClassName)} />
          ) : (
            <Copy className={cn("h-2.5 w-2.5", copyIconClassName)} />
          )}
        </Button>
      </div>
    );
  },
);

ValueCell.displayName = "ValueCell";
