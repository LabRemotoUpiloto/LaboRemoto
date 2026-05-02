import React from 'react'

interface SessionFiltersProps {
  filterUser: string
  filterHost: string
  onFilterUserChange: (value: string) => void
  onFilterHostChange: (value: string) => void
  onRefresh: () => void
}

const SessionFilters: React.FC<SessionFiltersProps> = ({
  filterUser,
  filterHost,
  onFilterUserChange,
  onFilterHostChange,
  onRefresh
}) => {
  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-3 items-stretch sm:items-center flex-wrap">
      <div className="flex items-center gap-[6px] flex-1 sm:min-w-[160px]">
        <label htmlFor="filter-user" className="text-[11px] font-semibold text-tertiary uppercase tracking-[0.05em] whitespace-nowrap shrink-0">Usuario</label>
        <input
          id="filter-user"
          type="text"
          placeholder="Buscar por usuario..."
          value={filterUser}
          onChange={(e) => onFilterUserChange(e.target.value)}
          className="flex-1 py-1.5 px-2.5 bg-secondary border border-subtle rounded-md text-primary text-[12px] transition-all duration-150 focus:outline-none focus:border-accent focus:shadow-[0_0_0_2px_rgba(16,185,129,0.15)] placeholder:text-tertiary"
        />
      </div>

      <div className="flex items-center gap-[6px] flex-1 sm:min-w-[160px]">
        <label htmlFor="filter-host" className="text-[11px] font-semibold text-tertiary uppercase tracking-[0.05em] whitespace-nowrap shrink-0">Host</label>
        <input
          id="filter-host"
          type="text"
          placeholder="Buscar por host..."
          value={filterHost}
          onChange={(e) => onFilterHostChange(e.target.value)}
          className="flex-1 py-1.5 px-2.5 bg-secondary border border-subtle rounded-md text-primary text-[12px] transition-all duration-150 focus:outline-none focus:border-accent focus:shadow-[0_0_0_2px_rgba(16,185,129,0.15)] placeholder:text-tertiary"
        />
      </div>

      <button onClick={onRefresh} className="w-8 h-8 p-0 bg-secondary border border-subtle rounded-md text-secondary cursor-pointer transition-all duration-150 flex items-center justify-center shrink-0 hover:border-accent hover:text-accent active:scale-95" title="Recargar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
        </svg>
      </button>
    </div>
  )
}

export default SessionFilters
