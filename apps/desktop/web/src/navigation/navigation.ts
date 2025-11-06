// Centralized navigation rules for sidebar/page selection across tabs

export type TabType = 'home' | 'session' | 'log'

export const HOME_PAGES = ['landing', 'connect', 'hosts', 'themes', 'logs'] as const
export const SESSION_PAGES = ['sftp', 'snippets'] as const
export const SPECIAL_TOGGLE_PAGES = ['pins', 'camera'] as const

type PageId = typeof HOME_PAGES[number] | typeof SESSION_PAGES[number] | typeof SPECIAL_TOGGLE_PAGES[number]

export interface NavigateContext {
  page: string
  activeTabType: TabType
  HOME_ID: string
  // state updaters
  setActiveTabId: (id: string) => void
  setSelectedPage: (page: string) => void
  // optional: pending host payload management
  pendingHost: any | null
  setPendingHost: (val: any | null) => void
  // side panels
  isPinsPanelOpen: boolean
  closePinsPanel: () => void
  isCameraOpen: boolean
  setCameraOpen: (open: boolean) => void
}

// Returns the target tab category for a given page
export function resolveTargetTab(page: string, activeTabType: TabType): 'home' | 'session' | 'nochange' {
  if ((SPECIAL_TOGGLE_PAGES as readonly string[]).includes(page)) return 'nochange'
  if ((HOME_PAGES as readonly string[]).includes(page)) return 'home'
  if ((SESSION_PAGES as readonly string[]).includes(page)) return 'session'
  // default: keep current tab
  // Only 'home' or 'session' are valid returns; any other (like 'log') defaults to nochange
  return 'nochange'
}

// Apply consistent effects when navigating from the sidebar
export function navigateFromSidebar(ctx: NavigateContext) {
  const {
    page,
    activeTabType,
    HOME_ID,
    setActiveTabId,
    setSelectedPage,
    pendingHost,
    setPendingHost,
    isPinsPanelOpen,
    closePinsPanel,
    isCameraOpen,
    setCameraOpen,
  } = ctx

  // Clear transient payload if leaving connect
  if (page !== 'connect' && pendingHost) setPendingHost(null)

  // Close side panels unless explicitly toggling them
  if (page !== 'pins' && isPinsPanelOpen) closePinsPanel()
  if (page !== 'camera' && isCameraOpen) setCameraOpen(false)

  const target = resolveTargetTab(page, activeTabType)

  if (target === 'home') {
    setActiveTabId(HOME_ID)
    setSelectedPage(page)
    return
  }

  if (target === 'session') {
    // Stay in current session tab and change the view
    setSelectedPage(page)
    return
  }

  // nochange: do not alter tab; side effects already applied
}
