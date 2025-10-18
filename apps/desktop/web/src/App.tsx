// App raíz: manejo de pestañas (Inicio persistente + sesiones) y navegación lateral.
import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import TerminalView from './components/TerminalView'
import TerminalOnly from './components/TerminalOnly'
import ConnectForm from './components/connect/ConnectForm'
import SavedHostsPage from './pages/SavedHostsPage'
import ConnectFormPage from './pages/ConnectFormPage'
import { connectFromHost } from './api/storage'
import { LoadingProvider } from './contexts/LoadingContext'
import GlobalLoader from './components/GlobalLoader'
import { ToastProvider } from './contexts/ToastContext'
import ToastContainer from './components/ToastContainer'
import { ThemeProvider } from './contexts/ThemeContext'
import ThemesPage from './pages/ThemesPage'
import SftpPage from './pages/SftpPage'
import SnippetsPage from './pages/SnippetsPage'
import ConfirmModal from './components/ConfirmModal'
import ChatPane from './components/ChatPane'
import PinsPanel from './components/PinsPanel'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

const App: React.FC = () => {
  // Representa una pestaña: 'home' (persistente) o 'session' (SSH)
  type Tab = { id: string; type: 'home' | 'session'; label: string }
  const HOME_ID = 'home'
  const [tabs, setTabs] = useState<Tab[]>([{ id: HOME_ID, type: 'home', label: 'Inicio' }])
  const [activeTabId, setActiveTabId] = useState<string>(HOME_ID)
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [sessionMeta, setSessionMeta] = useState<Record<string,{ label: string }>>({})
  const [pendingHost, setPendingHost] = useState<any | null>(null)
  const [selectedPage, setSelectedPage] = useState<string>('connect') // subpágina dentro de Inicio
  const [updateInfo, setUpdateInfo] = useState<null | { version: string; notes?: string }>(null)
  const [updating, setUpdating] = useState(false)
  const [isCameraOpen, setCameraOpen] = useState(false)
  const [isPinsPanelOpen, setPinsPanelOpen] = useState(false)

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]


  // Abre una nueva sesión si no existe, y la activa
  const openSession = (id: string, label?: string) => {
    setTabs(prev => {
      const exists = prev.some(t => t.id === id)
      if (exists) {
        return prev.map(t => (t.id === id && label) ? { ...t, label } : t)
      }
      return [...prev, { id, type: 'session', label: label || sessionMeta[id]?.label || id }]
    })
    setActiveTabId(id)
  }


  // Cierra pestaña (no permite cerrar Inicio) y re-calcula activa
  const closeTab = (id: string) => {
    if (id === HOME_ID) return
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      // recompute active fallback
      if (activeTabId === id) {
        const firstSession = next.find(t => t.type === 'session')
        setActiveTabId(firstSession ? firstSession.id : HOME_ID)
      }
      return next
    })
  }

  const handleNewSession = (info: { id: string; label?: string } | null) => {
    if (!info) { setActiveTabId(HOME_ID); return }
    const { id, label } = info
    if (label) setSessionMeta(prev => ({ ...prev, [id]: { label } }))
    openSession(id, label)
  }

  const handleTabClick = (id: string) => {
    console.log('🔄 Tab clicked:', id)
    console.log('📋 Current tabs:', tabs.map(t => ({ id: t.id, type: t.type, label: t.label })))
    
    setActiveTabId(id)
    
    const clickedTab = tabs.find(t => t.id === id)
    console.log('🎯 Clicked tab:', clickedTab)
    
    // Resetear selectedPage si cambias a la pestaña "Inicio" o a una pestaña de sesión SSH
    if (clickedTab?.type === 'home') {
      console.log('🏠 Resetting selectedPage for home tab')
      setSelectedPage('connect')
    } else if (clickedTab?.type === 'session') {
      console.log('🔗 Resetting selectedPage for session tab')
      // Cuando cambias a una pestaña de sesión SSH, resetear selectedPage para mostrar terminal
      setSelectedPage('connect')
    }
  }

  // Mantiene sincronizadas las etiquetas de pestañas con los alias en sessionMeta
  useEffect(() => {
    console.log('🔄 Updating tabs labels from sessionMeta:', sessionMeta)
    setTabs(prev => prev.map(t => (
      t.type === 'session' && sessionMeta[t.id]?.label && t.label !== sessionMeta[t.id].label
        ? { ...t, label: sessionMeta[t.id].label }
        : t
    )))
  }, [sessionMeta])

  // Log del estado actual
  useEffect(() => {
    console.log('📊 Current state:', {
      activeTabId,
      activeTab: tabs.find(t => t.id === activeTabId),
      sessionMeta,
      selectedPage
    })
  }, [activeTabId, tabs, sessionMeta, selectedPage])

  // Al cerrar una sesión, pedir al backend que desconecte antes de remover la pestaña
  const handleCloseTab = async (id: string) => {
    try {
      await invoke('ssh_disconnect', { id })
      closeTab(id)
    } catch (e: any) {
      alert('No se pudo cerrar la sesión: ' + (e?.toString?.() ?? 'Error desconocido'))
    }
  }

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev
      // Avisar a la UI que el layout cambiará (inicio)
      try { window.dispatchEvent(new CustomEvent('app:sidebar-toggled', { detail: { isOpen: next, phase: 'start' } })) } catch {}
      // Aviso tras el siguiente frame, por si hay cálculos vinculados al DOM
      try { requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('app:sidebar-toggled', { detail: { isOpen: next, phase: 'frame' } }))) } catch {}
      // Aviso al final de la transición CSS (~300ms declarados en App.css)
      try { window.setTimeout(() => window.dispatchEvent(new CustomEvent('app:sidebar-toggled', { detail: { isOpen: next, phase: 'end' } })), 320) } catch {}
      return next
    })
  }


  const emitPinsToggleEvents = (next: boolean) => {
    const detail = { isOpen: next }
    try { window.dispatchEvent(new CustomEvent('app:pins-toggled', { detail: { ...detail, phase: 'start' } })) } catch {}
    try {
      requestAnimationFrame(() => {
        try { window.dispatchEvent(new CustomEvent('app:pins-toggled', { detail: { ...detail, phase: 'frame' } })) } catch {}
      })
    } catch {}
    try { window.setTimeout(() => { try { window.dispatchEvent(new CustomEvent('app:pins-toggled', { detail: { ...detail, phase: 'end' } })) } catch {} }, 320) } catch {}
  }

  const emitBottomBarToggleEvents = (next: boolean) => {
    const detail = { isOpen: next }
    try { window.dispatchEvent(new CustomEvent('app:bottombar-toggled', { detail: { ...detail, phase: 'start' } })) } catch {}
    try {
      requestAnimationFrame(() => {
        try { window.dispatchEvent(new CustomEvent('app:bottombar-toggled', { detail: { ...detail, phase: 'frame' } })) } catch {}
      })
    } catch {}
    try { window.setTimeout(() => { try { window.dispatchEvent(new CustomEvent('app:bottombar-toggled', { detail: { ...detail, phase: 'end' } })) } catch {} }, 320) } catch {}
  }

  const togglePinsPanel = () => {
    setPinsPanelOpen(prev => {
      const next = !prev
      emitPinsToggleEvents(next)
      return next
    })
  }

  const closePinsPanel = () => {
    setPinsPanelOpen(prev => {
      if (!prev) return prev
      emitPinsToggleEvents(false)
      return false
    })
  }

  const toggleCameraPanel = () => {
    setCameraOpen(prev => {
      const next = !prev
      emitBottomBarToggleEvents(next)
      return next
    })
  }


  // Check for updates on startup (once)
  useEffect(() => {
    (async () => {
      try {
        const upd = await check()
        if (upd) {
          setUpdateInfo({ version: upd.version, notes: upd.body })
        }
      } catch (e) {
        console.warn('Auto-update check failed', e)
      }
    })()
  }, [])

  const confirmInstallUpdate = async () => {
    if (!updateInfo) return
    try {
      setUpdating(true)
      const upd = await check()
      if (upd) {
        await upd.downloadAndInstall()
        await relaunch()
      } else {
        setUpdateInfo(null)
      }
    } catch (e) {
      console.error('Update install failed', e)
      setUpdateInfo(null)
    } finally {
      setUpdating(false)
    }
  }

  const isPinsVisible = isPinsPanelOpen && activeTab.type === 'session'

  return (
    <LoadingProvider>
      <ToastProvider>
        <ThemeProvider>
          <div className={`app-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'} ${isPinsVisible ? 'pins-open' : ''}`}>
            <Sidebar
              isOpen={isSidebarOpen}
              toggleSidebar={toggleSidebar}
              selectedPage={selectedPage}
              onSelectPage={(p) => {
                // No cambiar el tab activo si se selecciona pines
                if (p !== 'pins') {
                  // Solo cambiar a HOME si estás en una sesión y seleccionas una página que debe estar en HOME
                  if (activeTab.type === 'session' && ['connect', 'hosts', 'themes'].includes(p)) {
                    setActiveTabId(HOME_ID)
                  }
                }
                setSelectedPage(p)
              }}
              activeSessionId={activeTab.type === 'session' ? activeTab.label : null}
      isCameraOpen={isCameraOpen}
      isPinsPanelOpen={isPinsPanelOpen}
      onToggleCamera={toggleCameraPanel}
      onTogglePins={togglePinsPanel}
            />
            {isPinsVisible && (
              <aside className="pins-panel" aria-label="Panel de pines GPIO">
                <div className="pins-panel__header">
                  <strong className="pins-panel__title">📌 Pines GPIO</strong>
                  <button
                    onClick={closePinsPanel}
                    className="pins-panel__close-button"
                    type="button"
                    title="Cerrar panel"
                    aria-label="Cerrar panel de pines"
                  >
                    ×
                  </button>
                </div>
                <div className="pins-panel__content">
                  <PinsPanel sessionId={activeTab.id} />
                </div>
              </aside>
            )}
            <div className={`main-content ${isSidebarOpen ? 'sidebar-open' : ''}`}>
          <Header
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={handleTabClick}
            onCloseTab={handleCloseTab}
            onNewSession={() => { setActiveTabId(HOME_ID); setSelectedPage('connect'); }}
            toggleSidebar={toggleSidebar}
          />
          <main className="content-area">
            {/* Contenedor Home persistente */}
            <div style={{display: activeTab.type==='home' ? 'block' : 'none', height:'100%'}}>
              {selectedPage === 'connect' ? (
                <ConnectFormPage onConnected={handleNewSession} initialPayload={pendingHost} />
              ) : selectedPage === 'hosts' ? (
                <SavedHostsPage onConnect={async (h,p,u,pass) => {
                  try {
                    const sessionId = await connectFromHost(h, Number(p), u || '', pass || '')
                    if (sessionId) {
                      const label = (u? `${u}@`:'') + h
                      setSessionMeta(prev => ({ ...prev, [String(sessionId)]: { label } }))
                      openSession(String(sessionId), label)
                    }
                  } catch (e) {
                    alert('Error connecting to host: ' + (e as any)?.toString?.())
                  }
                }} />
              ) : selectedPage === 'themes' ? (
                <ThemesPage />
              ) : selectedPage === 'sftp' ? (
                <SftpPage
                  sessions={tabs.filter(t=>t.type==='session').map(t=>t.id)}
                  sessionsMeta={sessionMeta}
                  activeSessionId={(() => {
                    // Usar la primera sesión disponible como fallback
                    const sessionTabs = tabs.filter(t=>t.type==='session');
                    return sessionTabs.length > 0 ? sessionTabs[0].id : undefined;
                  })()}
                />
              ) : selectedPage === 'snippets' ? (
                <SnippetsPage />
              ) : (
                <ConnectFormPage onConnected={handleNewSession} initialPayload={pendingHost} />
              )}
            </div>
            {/* Sesiones SSH persistentes */}
            {tabs.filter(t => t.type==='session').map(t => (
              <div key={t.id} style={{display: activeTabId===t.id ? 'block':'none', height:'100%', width:'100%'}}>
                {selectedPage === 'sftp' ? (
                  <SftpPage
                    sessions={tabs.filter(t=>t.type==='session').map(t=>t.id)}
                    sessionsMeta={sessionMeta}
                    activeSessionId={t.id}
                  />
                ) : selectedPage === 'snippets' ? (
                  <SnippetsPage />
                ) : (
                  <TerminalView sessionId={t.id} isCameraOpen={isCameraOpen} />
                )}
              </div>
            ))}
          </main>
            </div>
          </div>
          <GlobalLoader />
          <ToastContainer />
          <ConfirmModal
            open={!!updateInfo}
            title={updateInfo ? `Nueva versión ${updateInfo.version}` : 'Actualización disponible'}
            message={updateInfo?.notes || 'Hay una actualización disponible. ¿Deseas instalarla ahora?'}
            onConfirm={confirmInstallUpdate}
            onCancel={() => setUpdateInfo(null)}
            confirmLabel="Instalar y reiniciar"
            cancelLabel="Ahora no"
            confirmClassName="new"
            loading={updating}
          />
        </ThemeProvider>
      </ToastProvider>
    </LoadingProvider>
  )
}

export default App
