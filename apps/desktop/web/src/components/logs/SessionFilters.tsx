import React from 'react'
import './SessionFilters.css'

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
    <div className="session-filters">
      <div className="filter-group">
        <label htmlFor="filter-user">Usuario</label>
        <input
          id="filter-user"
          type="text"
          placeholder="Buscar por usuario..."
          value={filterUser}
          onChange={(e) => onFilterUserChange(e.target.value)}
          className="filter-input"
        />
      </div>

      <div className="filter-group">
        <label htmlFor="filter-host">Host</label>
        <input
          id="filter-host"
          type="text"
          placeholder="Buscar por host..."
          value={filterHost}
          onChange={(e) => onFilterHostChange(e.target.value)}
          className="filter-input"
        />
      </div>

      <button onClick={onRefresh} className="refresh-button" title="Recargar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
        </svg>
      </button>
    </div>
  )
}

export default SessionFilters
