import React from 'react'
import TerminalView from './TerminalView'
import SesionLocalMosaico from './SesionLocalMosaico'
import LogsPage from '@/features/logs/LogsPage'
import type { Tab } from '@/app/hooks/useAppTabs'
import type { SessionLog } from '@/features/logs/sesiones'
import type { LinuxPracticeSessionApi } from '@/features/practicas/useLinuxPracticeSession'

type PracticeMeta = {
  practiceId: string
  assignmentId?: number
  // Opcional/nullable: las entradas sintéticas para prácticas de Linux (ver
  // combinedPracticeMeta en App.tsx) solo aportan practiceId, nunca student
  // (esa práctica no viene del flujo de asignaciones con estudiante real).
  student?: { id: number; username: string; fullname: string; email: string } | null
  robotDashboard?: boolean
}

type Props = {
  tabs: Tab[]
  activeTabId: string
  practiceMeta?: Record<string, PracticeMeta>
  selectedPage: string
  activeView: 'terminal' | 'escritorio'
  isCameraOpen: (sessionId: string) => boolean
  /** Abre o cierra la cámara de una sesión (el escenario de la vista guiada de EV3 la usa). */
  setCameraOpen?: (sessionId: string, open: boolean) => void
  isChatOpen: boolean
  onCloseChat: () => void
  onOpenLog: (session: SessionLog) => void
  onCloseTab: (id: string) => void
  /** Instancia única de useLinuxPracticeSession (ver App.tsx) — se threadea hasta TerminalView. */
  linuxSession?: LinuxPracticeSessionApi
}

const SessionContainer: React.FC<Props> = ({
  tabs,
  activeTabId,
  practiceMeta,
  selectedPage,
  activeView,
  isCameraOpen,
  setCameraOpen,
  isChatOpen,
  onCloseChat,
  onOpenLog,
  onCloseTab,
  linuxSession
}) => {
  return (
    <>
      {tabs.filter(t => t.type === 'local-terminal').map(t => (
        <div key={t.id} style={{ display: activeTabId === t.id ? 'block' : 'none', height: '100%', width: '100%' }}>
          <SesionLocalMosaico tabId={t.id} isTabActive={activeTabId === t.id} onEmptyGroup={() => onCloseTab(t.id)} />
        </div>
      ))}
      {tabs.filter(t => t.type === 'session').map(t => (
        <div key={t.id} style={{ display: activeTabId === t.id ? 'block' : 'none', height: '100%', width: '100%' }}>
          <div
            style={
              selectedPage === 'logs'
                ? { position: 'absolute', opacity: 0, pointerEvents: 'none', zIndex: -10, width: '100%', height: '100%', overflow: 'hidden' }
                : { height: '100%', width: '100%' }
            }
          >
            <TerminalView
              sessionId={t.id}
              activeView={activeView}
              isCameraOpen={isCameraOpen(t.id)}
              onSetCameraOpen={setCameraOpen ? (open) => setCameraOpen(t.id, open) : undefined}
              isChatOpen={isChatOpen}
              onCloseChat={onCloseChat}
              isTabActive={activeTabId === t.id}
              practiceId={practiceMeta?.[t.id]?.practiceId ?? null}
              assignmentId={practiceMeta?.[t.id]?.assignmentId}
              student={practiceMeta?.[t.id]?.student ?? null}
              robotDashboardEnabled={!!practiceMeta?.[t.id]?.robotDashboard}
              linuxSession={linuxSession}
            />
          </div>
          {selectedPage === 'logs' && activeTabId === t.id && <LogsPage onOpenLog={onOpenLog} />}
        </div>
      ))}
    </>
  )
}

export default SessionContainer

