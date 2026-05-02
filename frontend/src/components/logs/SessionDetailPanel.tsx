import React from 'react'
import type { SessionLog } from './SessionCard'

interface SessionDetailPanelProps {
  session: SessionLog | null
  onClose: () => void
}

const SessionDetailPanel: React.FC<SessionDetailPanelProps> = ({ session, onClose }) => {
  if (!session) return null

  return (
    <div className="fixed right-0 top-0 bottom-0 w-full md:w-[500px] bg-secondary border-l border-subtle shadow-[-4px_0_12px_rgba(0,0,0,0.3)] z-[100] flex flex-col animate-in slide-in-from-right duration-300">
      <div className="flex justify-between items-center p-6 border-b border-subtle bg-primary">
        <h2 className="text-[1.25rem] m-0 text-primary font-semibold">Detalles de la Sesión</h2>
        <button 
          className="bg-transparent border-none text-secondary text-[1.5rem] cursor-pointer py-1 px-2 transition-colors duration-200 leading-none hover:text-primary"
          onClick={onClose}
          aria-label="Cerrar panel"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        <div className="mb-8">
          <h3 className="text-base font-semibold text-primary m-0 mb-4 pb-2 border-b border-subtle">Información General</h3>
          <dl className="flex flex-col gap-3 m-0">
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-secondary font-medium">ID de Sesión:</dt>
              <dd className="text-sm text-primary m-0 text-right break-all">{session.id}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-secondary font-medium">Usuario:</dt>
              <dd className="text-sm text-primary m-0 text-right break-all">{session.user}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-secondary font-medium">Host:</dt>
              <dd className="text-sm text-primary m-0 text-right break-all">{session.host}:{session.port}</dd>
            </div>
          </dl>
        </div>

        <div className="mb-8">
          <h3 className="text-base font-semibold text-primary m-0 mb-4 pb-2 border-b border-subtle">Buffer de Terminal</h3>
          <p className="text-secondary text-sm italic m-0 p-4 bg-tertiary rounded-md text-center">El visor de buffer se implementará próximamente</p>
        </div>

        <div className="mb-8">
          <h3 className="text-base font-semibold text-primary m-0 mb-4 pb-2 border-b border-subtle">Historial de Comandos</h3>
          <p className="text-secondary text-sm italic m-0 p-4 bg-tertiary rounded-md text-center">La lista de comandos se implementará próximamente</p>
        </div>
      </div>
    </div>
  )
}

export default SessionDetailPanel
