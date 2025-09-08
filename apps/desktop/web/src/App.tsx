import React, { useState } from 'react'
import './App.css'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import TerminalView from './components/TerminalView'
import ConnectForm from './components/ConnectForm'
import SavedHostsPage from './pages/SavedHostsPage'
import { connectFromHost } from './api/storage'
import { LoadingProvider } from './contexts/LoadingContext'
import GlobalLoader from './components/GlobalLoader'
import { ToastProvider } from './contexts/ToastContext'
import ToastContainer from './components/ToastContainer'

const App: React.FC = () => {
  const [sessions, setSessions] = useState<string[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [pendingHost, setPendingHost] = useState<any | null>(null)
  const [selectedPage, setSelectedPage] = useState<string>('connect')

  const handleNewSession = (idOrNull: string | null) => {
    if (!idOrNull) {
      setActiveSession(null);
      return;
    }
    if (!sessions.includes(idOrNull)) setSessions(prev => [...prev, idOrNull])
    setActiveSession(idOrNull)
  }

  const handleTabClick = (sessionId: string | null) => {
    setActiveSession(sessionId)
  }

  const handleCloseTab = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s !== sessionId))
    if (activeSession === sessionId) {
      // If there are other sessions, switch to the first one, otherwise go home
      const remainingSessions = sessions.filter(s => s !== sessionId)
      setActiveSession(remainingSessions.length > 0 ? remainingSessions[0] : null)
    }
    // TODO: Add backend call to close SSH session
  }

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen)
  }

  return (
    <LoadingProvider>
      <ToastProvider>
        <div className="app-container">
        <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} selectedPage={selectedPage} onSelectPage={(p)=>setSelectedPage(p)} />
        <div className={`main-content ${isSidebarOpen ? 'sidebar-open' : ''}`}>
          <Header
            sessions={sessions}
            activeSession={activeSession}
            onTabClick={handleTabClick}
            onCloseTab={handleCloseTab}
            onNewSession={() => setActiveSession(null)} // Go to home to create a new session
            toggleSidebar={toggleSidebar}
          />
          <main className="content-area">
            {activeSession ? (
              <TerminalView sessionId={activeSession} />
            ) : (
              selectedPage === 'connect' ? (
                <ConnectForm onConnected={handleNewSession} initialPayload={pendingHost} />
              ) : selectedPage === 'hosts' ? (
                <SavedHostsPage onConnect={async (h,p,u,pass) => {
                  // call backend ssh_connect and expect a session id
                  try {
                    const sessionId = await connectFromHost(h, Number(p), u || '', pass || '')
                    // if backend returns a session id, register it
                    if (sessionId) handleNewSession(sessionId as any)
                  } catch (e) {
                    // show alert for now
                    alert('Error connecting to host: ' + (e as any)?.toString?.())
                  }
                }} />
              ) : (
                <ConnectForm onConnected={handleNewSession} initialPayload={pendingHost} />
              )
            )}
          </main>
        </div>
          <GlobalLoader />
          <ToastContainer />
        </div>
      </ToastProvider>
    </LoadingProvider>
  )
}

export default App
