// Centralized navigation rules for sidebar/page selection across tabs

export type TabType = 'home' | 'session' | 'log'

export const HOME_PAGES = ['landing', 'connect', 'hosts', 'themes', 'logs'] as const
export const SESSION_PAGES = ['sftp', 'snippets', 'desktop'] as const
export const SPECIAL_TOGGLE_PAGES = ['pins', 'camera'] as const

type PageId = typeof HOME_PAGES[number] | typeof SESSION_PAGES[number] | typeof SPECIAL_TOGGLE_PAGES[number]

// Returns the target tab category for a given page
export function resolveTargetTab(page: string, activeTabType: TabType): 'home' | 'session' | 'nochange' {
  if ((SPECIAL_TOGGLE_PAGES as readonly string[]).includes(page)) return 'nochange'
  if ((HOME_PAGES as readonly string[]).includes(page)) return 'home'
  if ((SESSION_PAGES as readonly string[]).includes(page)) return 'session'
  // default: keep current tab
  // Only 'home' or 'session' are valid returns; any other (like 'log') defaults to nochange
  return 'nochange'
}

