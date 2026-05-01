import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionLog } from "../components/logs/SessionCard";

export type Tab = {
  id: string;
  type: "home" | "session" | "log";
  label: string;
  logData?: SessionLog;
};

export const HOME_TAB_ID = "home";

export type ActiveView = 'terminal' | 'escritorio';

export function useAppTabs() {
  const [tabs, setTabs] = useState<Tab[]>([{ id: HOME_TAB_ID, type: "home", label: "Inicio" }]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // sidebar always compact now
  const [sessionMeta, setSessionMeta] = useState<Record<string, { label: string }>>({});
  const [pendingHost, setPendingHost] = useState<any | null>(null);
  const [selectedPage, setSelectedPage] = useState<string>("landing");

  // ── Dual-header panel state ──
  const [openPanels, setOpenPanels] = useState<string[]>(['landing']);
  const [activePanel, setActivePanel] = useState<string>('landing');
  const [activeView, setActiveView] = useState<ActiveView>('terminal');
  const [isChatOpen, setIsChatOpen] = useState(false);

  const activeTab = useMemo(() => {
    return tabs.find(t => t.id === activeTabId) || tabs[0];
  }, [tabs, activeTabId]);

  const openSession = (id: string, label?: string) => {
    setTabs(prev => {
      const exists = prev.some(t => t.id === id);
      if (exists) {
        return prev.map(t => (t.id === id && label ? { ...t, label } : t));
      }
      return [...prev, { id, type: "session", label: label || sessionMeta[id]?.label || id }];
    });
    setActiveTabId(id);
    setSelectedPage("terminal");
    setOpenPanels(prev => prev.includes('terminal') ? prev : [...prev, 'terminal']);
    setActivePanel('terminal');
  };

  const closeTab = (id: string) => {
    if (id === HOME_TAB_ID) return;
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTabId === id) {
        const firstSession = next.find(t => t.type === "session");
        setActiveTabId(firstSession ? firstSession.id : HOME_TAB_ID);
      }
      return next;
    });
  };

  const reorderTabs = (dragID: string, dropID: string) => {
    if (dragID === dropID) return;
    setTabs(prev => {
      const idxA = prev.findIndex(t => t.id === dragID);
      const idxB = prev.findIndex(t => t.id === dropID);
      if (idxA < 0 || idxB < 0) return prev;
      
      const newTabs = [...prev];
      const [moved] = newTabs.splice(idxA, 1);
      newTabs.splice(idxB, 0, moved);
      
      return newTabs;
    });
    // Mantén la tab activa después del reorder
    setActiveTabId(prev => prev);
  };

  const reorderPanels = (dragID: string, dropID: string) => {
    if (dragID === dropID) return;
    setOpenPanels(prev => {
      const idxA = prev.indexOf(dragID);
      const idxB = prev.indexOf(dropID);
      if (idxA < 0 || idxB < 0) return prev;

      const newPanels = [...prev];
      const [moved] = newPanels.splice(idxA, 1);
      newPanels.splice(idxB, 0, moved);
      return newPanels;
    });
  };

  const handleNewSession = (info: { id: string; label?: string } | null) => {
    if (!info) {
      setActiveTabId(HOME_TAB_ID);
      return;
    }
    const { id, label } = info;
    if (label) {
      setSessionMeta(prev => ({ ...prev, [id]: { label } }));
    }
    openSession(id, label);
  };

  const openLogTab = (session: SessionLog) => {
    const logTabId = `log:${session.id}`;
    const logLabel = `Log ${session.user}@${session.host}`;
    setTabs(prev => {
      const exists = prev.some(t => t.id === logTabId);
      if (exists) return prev;
      return [...prev, { id: logTabId, type: "log", label: logLabel, logData: session }];
    });
    setActiveTabId(logTabId);
  };

  // ── Panel tab management (H1) ──
  const openPanel = useCallback((panelId: string) => {
    setOpenPanels(prev => {
      if (!prev.includes(panelId)) return [...prev, panelId];
      return prev;
    });
    setActivePanel(panelId);
    // Sync selectedPage for content rendering
    setSelectedPage(panelId);
  }, []);

  const closePanel = useCallback((panelId: string) => {
    setOpenPanels(prev => {
      const next = prev.filter(p => p !== panelId);
      if (activePanel === panelId) {
        const last = next[next.length - 1] || 'terminal';
        setActivePanel(last);
        setSelectedPage(last);
      }
      return next.length === 0 ? ['terminal'] : next;
    });
  }, [activePanel]);

  useEffect(() => {
    setTabs(prev =>
      prev.map(t =>
        t.type === "session" && sessionMeta[t.id]?.label && t.label !== sessionMeta[t.id].label
          ? { ...t, label: sessionMeta[t.id].label }
          : t
      )
    );
  }, [sessionMeta]);

  // Auto-switch to first connected session when entering terminal view
  useEffect(() => {
    if (activePanel === 'terminal' && activeTabId === HOME_TAB_ID) {
      const firstSession = tabs.find(t => t.type === 'session');
      if (firstSession) {
        setActiveTabId(firstSession.id);
      }
    }
  }, [activePanel, activeTabId, tabs]);

  // Clean up terminal panel if last session closes
  useEffect(() => {
    const hasSessions = tabs.some(t => t.type === 'session');
    
    // If no sessions exist but terminal panel is open, remove it
    if (!hasSessions && openPanels.includes('terminal')) {
      setOpenPanels(prev => prev.filter(p => p !== 'terminal'));
      
      // If we are currently looking at the terminal panel, safely fallback to landing page
      if (activePanel === 'terminal') {
        setActivePanel('landing');
        setSelectedPage('landing');
      }
    }
  }, [tabs, openPanels, activePanel]);



  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    isSidebarOpen,
    setIsSidebarOpen,
    sessionMeta,
    setSessionMeta,
    pendingHost,
    setPendingHost,
    selectedPage,
    setSelectedPage,
    activeTab,
    openSession,
    closeTab,
    handleNewSession,
    openLogTab,
    // Dual-header panel state
    openPanels,
    activePanel,
    openPanel,
    closePanel,
    activeView,
    setActiveView,
    isChatOpen,
    setIsChatOpen,
    reorderTabs,
    reorderPanels,
  };
}

