import React from 'react';

export interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface DataTableProps {
  columns: DataTableColumn[];
  data: Record<string, any>[];
  selectedIndex?: number;
  onRowClick?: (index: number) => void;
  onRowDoubleClick?: (index: number) => void;
  onSort?: (key: string) => void;
  onContextMenu?: (index: number, event: React.MouseEvent) => void;
  onClearSelection?: () => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  emptyMessage?: string;
}

const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  selectedIndex,
  onRowClick,
  onRowDoubleClick,
  onSort,
  onContextMenu,
  onClearSelection,
  sortKey,
  sortDir,
  emptyMessage = 'No hay elementos',
}) => {
  return (
    <div 
      className="w-full h-full overflow-auto"
      onClick={(e) => {
        // Si el click es en el contenedor (no en una fila), limpiar selección
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName.toLowerCase() === 'table') {
          onClearSelection?.();
        }
      }}
    >
      {data.length === 0 ? (
        <div className="h-[120px] text-center text-secondary italic py-10 px-5">{emptyMessage}</div>
      ) : (
        <table className="w-full border-collapse text-[12px] text-primary table-fixed" role="grid" aria-rowcount={data.length} aria-colcount={columns.length}>
          <thead className="sticky top-0 z-10 bg-secondary shadow-[0_1px_0_var(--border-subtle)]" role="rowgroup">
            <tr>
              {columns.map((col, idx) => {
                const isSorted = sortKey === col.key;
                const sortIndicator = isSorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                
                // Aplicar anchos específicos según el orden de las columnas como estaba en el CSS original
                let widthClass = '';
                if (idx === 0) widthClass = 'w-auto min-w-[150px] max-w-[40%]';
                else if (idx === 1) widthClass = 'w-[180px]';
                else if (idx === 2) widthClass = 'w-[100px]';
                else if (idx === 3) widthClass = 'w-[100px]';

                return (
                  <th
                    key={col.key}
                    role="columnheader"
                    aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`p-0 text-left font-semibold text-secondary text-[12px] uppercase tracking-[0.5px] ${widthClass}`}
                    style={{ textAlign: col.align || 'left' }}
                  >
                    {col.sortable && onSort ? (
                      <button
                        className="w-full px-3 py-2.5 bg-transparent border-none text-inherit text-left cursor-pointer flex items-center gap-1.5 transition-colors duration-100 hover:bg-white/5 hover:text-primary active:bg-white/10"
                        onClick={() => onSort(col.key)}
                        title={`Ordenar por ${col.label}`}
                      >
                        {col.label}
                        <span className="text-[10px] text-accent ml-auto">{sortIndicator}</span>
                      </button>
                    ) : (
                      <span className="block px-3 py-2.5">{col.label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                role="row"
                className={`border-b border-subtle transition-colors duration-100 group cursor-default hover:bg-white/5 hover:border-color focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 focus-visible:z-10 ${selectedIndex === rowIndex ? 'bg-white/10' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRowClick?.(rowIndex);
                }}
                onDoubleClick={() => onRowDoubleClick?.(rowIndex)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu?.(rowIndex, e);
                }}
                aria-selected={selectedIndex === rowIndex}
                tabIndex={0}
              >
                {columns.map((col, idx) => {
                   let widthClass = '';
                   if (idx === 0) widthClass = 'w-auto min-w-[150px] max-w-[40%]';
                   else if (idx === 1) widthClass = 'w-[180px]';
                   else if (idx === 2) widthClass = 'w-[100px]';
                   else if (idx === 3) widthClass = 'w-[100px]';

                  return (
                    <td
                      key={col.key}
                      role="gridcell"
                      className={`px-[11px] py-[7px] align-middle first:pl-4 last:pr-4 ${widthClass}`}
                      style={{ textAlign: col.align || 'left' }}
                    >
                      {row[col.key]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DataTable;
