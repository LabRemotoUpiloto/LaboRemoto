import { useEffect, useMemo, useState } from "react";
import type { SessionLog } from "../components/logs/SessionCard";

export type Tab = {
  id: string;
  type: "home" | "session" | "log";
  label: string;
  logData?: SessionLog;
};

export const HOME_TAB_ID = "home";

export function useAppTabs() {
  const [tabs, setTabs] = useState<Tab[]>([{ id: HOME_TAB_ID, type: "home", label: "Inicio" }]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sessionMeta, setSessionMeta] = useState<Record<string, { label: string }>>({});
  const [pendingHost, setPendingHost] = useState<any | null>(null);
  const [selectedPage, setSelectedPage] = useState<string>("landing");

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
    setSelectedPage("connect");
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

  useEffect(() => {
    setTabs(prev =>
      prev.map(t =>
        t.type === "session" && sessionMeta[t.id]?.label && t.label !== sessionMeta[t.id].label
          ? { ...t, label: sessionMeta[t.id].label }
          : t
      )
    );
  }, [sessionMeta]);

  useEffect(() => {
    console.log("📊 Current state:", {
      activeTabId,
      activeTab: tabs.find(t => t.id === activeTabId),
      sessionMeta,
      selectedPage
    });
  }, [activeTabId, tabs, sessionMeta, selectedPage]);

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
    openLogTab
  };
}

