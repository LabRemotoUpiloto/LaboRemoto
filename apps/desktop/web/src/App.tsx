import React, { useState } from 'react'
import './App.css'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import TerminalView from './components/TerminalView'
import ConnectForm from './components/ConnectForm'

const App: React.FC = () => {
  const [sessions, setSessions] = useState<string[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [isSidebarOpen, setSidebarOpen] = useState(false)

  const handleNewSession = (id: string) => {
    if (!sessions.includes(id)) setSessions(prev => [...prev, id])
    setActiveSession(id)
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
    <div className="app-container">
      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
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
            <ConnectForm onConnected={handleNewSession} />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
