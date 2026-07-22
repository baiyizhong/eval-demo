"use client";

import * as React from "react";

import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "./utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn(
          "w-full table-fixed caption-bottom border-separate border-spacing-0 overflow-auto text-sm",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("text-xs [&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "bg-background text-muted-foreground relative h-10 border-b px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

type TableDensity = "compact" | "comfortable";

function TableCell({
  className,
  density = "compact",
  ...props
}: React.ComponentProps<"td"> & { density?: TableDensity }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-full align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        density === "comfortable" ? "p-2" : "px-2 py-0",
        "border-b [:last-child_>_&]:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

type TableCellWithCopyButtonProps = React.ComponentProps<"td"> & {
  text: string;
  density?: TableDensity;
  copyButtonLabel?: string;
};

function TableCellWithCopyButton({
  text,
  copyButtonLabel,
  className,
  ...props
}: TableCellWithCopyButtonProps) {
  const [isCopied, setIsCopied] = React.useState(false);

  return (
    <TableCell
      className={cn("relative min-w-0 pr-10", className)}
      title={text}
      {...props}
    >
      {text}
      <button
        type="button"
        className="hover:bg-muted absolute top-1/2 right-2 size-5 -translate-y-1/2 rounded-sm border bg-background text-xs opacity-70 hover:opacity-100"
        title={copyButtonLabel ?? "Copy to clipboard"}
        aria-label={copyButtonLabel ?? "Copy to clipboard"}
        onClick={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          try {
            await copyTextToClipboard(text);
            setIsCopied(true);
            window.setTimeout(() => setIsCopied(false), 1500);
          } catch {
            setIsCopied(false);
          }
        }}
      >
        {isCopied ? "✓" : "⧉"}
      </button>
    </TableCell>
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCellWithCopyButton,
  TableCaption,
};
