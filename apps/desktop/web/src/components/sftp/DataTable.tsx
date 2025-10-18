import React from 'react';
import './DataTable.css';

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
      className="data-table-container"
      onClick={(e) => {
        // Si el click es en el contenedor (no en una fila), limpiar selección
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('data-table')) {
          onClearSelection?.();
        }
      }}
    >
      {data.length === 0 ? (
        <div className="data-table-empty">{emptyMessage}</div>
      ) : (
        <table className="data-table" role="grid" aria-rowcount={data.length} aria-colcount={columns.length}>
          <thead role="rowgroup">
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                const sortIndicator = isSorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
                return (
                  <th
                    key={col.key}
                    role="columnheader"
                    aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    style={{ textAlign: col.align || 'left' }}
                  >
                    {col.sortable && onSort ? (
                      <button
                        className="data-table__header-btn"
                        onClick={() => onSort(col.key)}
                        title={`Ordenar por ${col.label}`}
                      >
                        {col.label}{sortIndicator}
                      </button>
                    ) : (
                      <span>{col.label}</span>
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
                className={`data-table__row ${selectedIndex === rowIndex ? 'data-table__row--selected' : ''}`}
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
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    role="gridcell"
                    style={{ textAlign: col.align || 'left' }}
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DataTable;
