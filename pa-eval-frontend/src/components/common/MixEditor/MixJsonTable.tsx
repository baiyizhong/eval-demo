import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ExpandedState,
  type Row,
} from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  convertRowIdToKeyPath,
  transformJsonToTableData,
  type JsonTableRow,
} from './deps/table/utils/jsonExpansionUtils';
import {
  MAX_CELL_DISPLAY_CHARS,
  ValueCell,
  getValueStringLength,
} from './deps/table/ValueCell';
import { Button } from './deps/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './deps/ui/table';
import { cn } from './deps/ui/utils';

export function MixJsonTable({ value }: { value: unknown }) {
  const data = useMemo(() => transformJsonToTableData(value), [value]);
  const [expanded, setExpanded] = useState<ExpandedState>(() =>
    Object.fromEntries(
      data
        .filter((row) => row.hasChildren)
        .map((row) => [convertRowIdToKeyPath(row.id), true]),
    ),
  );
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const table = useReactTable({
    data,
    columns: [
      {
        accessorKey: 'key',
        header: 'Path',
        size: 36,
        cell: ({ row }: { row: Row<JsonTableRow> }) => {
          const indentationWidth = row.original.level * 16 + 8;

          return (
            <div className="flex items-start break-words">
              <div
                className="flex shrink-0 items-center justify-end"
                style={{ width: `${indentationWidth}px` }}
              >
                {row.original.hasChildren ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      row.toggleExpanded();
                    }}
                    className="size-4 p-0"
                  >
                    {row.getIsExpanded() ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                  </Button>
                ) : null}
              </div>
              <span className="ml-1 font-mono text-xs font-medium break-words">
                {row.original.key}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'value',
        header: 'Value',
        size: 64,
        cell: ({ row }: { row: Row<JsonTableRow> }) => (
          <ValueCell
            row={row}
            expandedCells={expandedCells}
            copyButtonClassName="size-5 rounded-sm"
            copyIconClassName="size-3"
            toggleCellExpansion={(cellId) =>
              setExpandedCells((previous) => {
                const next = new Set(previous);
                if (next.has(cellId)) next.delete(cellId);
                else next.add(cellId);
                return next;
              })
            }
          />
        ),
      },
    ],
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.subRows,
    getRowId: (row) => convertRowIdToKeyPath(row.id),
    state: { expanded },
    onExpandedChange: setExpanded,
    autoResetExpanded: false,
    enableColumnResizing: false,
  });

  return (
    <div className="max-h-[520px] overflow-auto rounded-md border bg-background">
      <Table className="text-xs">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="h-8 border-r bg-muted/60 px-2 py-1 last:border-r-0"
                  style={{ width: `${header.column.columnDef.size}%` }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const isExpandable =
              row.original.hasChildren ||
              getValueStringLength(row.original.value) >
                MAX_CELL_DISPLAY_CHARS;

            return (
              <TableRow
                key={row.id}
                className={cn(
                  'hover:bg-muted/30',
                  isExpandable && 'cursor-pointer',
                )}
                onClick={() => {
                  if (row.original.hasChildren) {
                    row.toggleExpanded();
                    return;
                  }

                  const cellId = `${row.id}-value`;
                  if (
                    getValueStringLength(row.original.value) >
                    MAX_CELL_DISPLAY_CHARS
                  ) {
                    setExpandedCells((previous) => {
                      const next = new Set(previous);
                      if (next.has(cellId)) next.delete(cellId);
                      else next.add(cellId);
                      return next;
                    });
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className="border-r px-2 py-1.5 align-top whitespace-normal last:border-r-0"
                    style={{ width: `${cell.column.columnDef.size}%` }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
