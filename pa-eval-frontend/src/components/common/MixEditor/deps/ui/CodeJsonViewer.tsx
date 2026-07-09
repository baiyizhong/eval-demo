import { useMemo, useState } from "react";
import {
  Copy,
  FoldVertical,
  UnfoldVertical,
} from "lucide-react";
import React18JsonView from "react18-json-view";
import "react18-json-view/src/style.css";
import "react18-json-view/src/dark.css";
import { useTheme } from "next-themes";
import { deepParseJson } from "../utils/shared";
import { Button } from "./button";
import { Skeleton } from "./skeleton";
import { copyTextToClipboard } from "../utils/clipboard";
import { cn } from "./utils";

// Migrated from /Users/panpan/Project/eval-demo/langfuse/web/src/components/ui/CodeJsonViewer.tsx
export function JSONView(props: {
  canEnableMarkdown?: boolean;
  json?: unknown;
  title?: string;
  hideTitle?: boolean;
  className?: string;
  isLoading?: boolean;
  codeClassName?: string;
  collapseStringsAfterLength?: number | null;
  scrollable?: boolean;
  borderless?: boolean;
  controlButtons?: React.ReactNode;
  externalJsonCollapsed?: boolean;
  jsonCollapsedDepth?: number;
  onToggleCollapse?: () => void;
}) {
  const parsedJson = useMemo(() => deepParseJson(props.json), [props.json]);
  const { resolvedTheme } = useTheme();
  const [internalCollapsed, setInternalCollapsed] = useState(false);

  const collapseStringsAfterLength =
    props.collapseStringsAfterLength === null
      ? 100_000_000
      : (props.collapseStringsAfterLength ?? 500);

  const isCollapsed = props.externalJsonCollapsed ?? internalCollapsed;
  const jsonCollapsedDepth = Math.max(0, props.jsonCollapsedDepth ?? 1);
  const collapsedValue = isCollapsed ? jsonCollapsedDepth : false;

  const handleOnCopy = (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    void copyTextToClipboard(stringifyJsonNode(parsedJson));
    event?.currentTarget.focus();
  };

  const handleToggleCollapse = () => {
    if (props.onToggleCollapse) {
      props.onToggleCollapse();
    } else {
      setInternalCollapsed(!internalCollapsed);
    }
  };

  const body = (
    <>
      <div
        className={cn(
          "io-message-content flex gap-2 text-xs wrap-break-word whitespace-pre-wrap",
          props.borderless ? "" : "p-2",
          props.title === "assistant" || props.title === "Output"
            ? "bg-accent-light-green dark:border-accent-dark-green"
            : "",
          props.title === "system" || props.title === "Input"
            ? "bg-primary-foreground"
            : "",
          props.scrollable || props.borderless ? "" : "rounded-sm border",
          props.codeClassName,
        )}
      >
        {props.isLoading ? (
          <Skeleton className="h-3 w-3/4" />
        ) : (
          <div className="min-w-0 flex-1">
            <React18JsonView
              src={parsedJson}
              theme="github"
              dark={resolvedTheme === "dark"}
              collapsed={collapsedValue}
              collapseObjectsAfterLength={
                isCollapsed ? Number.MAX_SAFE_INTEGER : 20
              }
              collapseStringsAfterLength={collapseStringsAfterLength}
              collapseStringMode="word"
              customizeCollapseStringUI={(fullString, truncated) =>
                truncated ? (
                  <div className="opacity-50">{`\n...expand (${Math.max(fullString.length - collapseStringsAfterLength, 0)} more characters)`}</div>
                ) : (
                  ""
                )
              }
              displaySize={isCollapsed ? "collapsed" : "expanded"}
              matchesURL={true}
              customizeCopy={(node) => stringifyJsonNode(node)}
              className="w-full"
            />
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "flex max-h-full min-h-0 flex-col",
        props.className,
        props.scrollable ? "overflow-hidden" : "",
      )}
    >
      {props.title && !props.hideTitle ? (
        <div className="io-message-header flex min-h-8 items-center justify-between gap-2 border-b bg-background px-2 py-1">
          <div className="text-muted-foreground text-xs font-medium">
            {props.title}
          </div>
          <div className="flex items-center gap-1">
            {props.controlButtons}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleOnCopy}
              title="Copy"
              aria-label="Copy"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleToggleCollapse}
              className="hover:bg-border -mr-2"
              title={isCollapsed ? "Expand all" : "Collapse all"}
            >
              {isCollapsed ? (
                <UnfoldVertical className="h-3 w-3" />
              ) : (
                <FoldVertical className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      ) : null}
      {props.scrollable ? (
        <div className="flex h-full min-h-0 overflow-hidden rounded-sm border">
          <div className="max-h-full min-h-0 w-full overflow-y-auto">
            {body}
          </div>
        </div>
      ) : (
        body
      )}
    </div>
  );
}

export function CodeView(props: {
  content: string | React.ReactNode[] | undefined | null;
  className?: string;
}) {
  return (
    <code
      className={cn(
        "relative flex-1 px-4 py-3 font-mono text-xs wrap-break-word whitespace-pre-wrap",
        props.className,
      )}
      dir="auto"
      style={{ unicodeBidi: "plaintext" }}
    >
      {props.content}
    </code>
  );
}

export function stringifyJsonNode(node: unknown) {
  if (typeof node === "string") {
    return node;
  }

  try {
    return JSON.stringify(
      node,
      (_key, value) => {
        switch (typeof value) {
          case "bigint":
            return `${String(value)}n`;
          case "number":
          case "boolean":
          case "object":
          case "string":
            return value as string;
          default:
            return String(value);
        }
      },
      4,
    );
  } catch (error) {
    console.error("JSON stringify error", error);
    return "Error: JSON.stringify failed";
  }
}
