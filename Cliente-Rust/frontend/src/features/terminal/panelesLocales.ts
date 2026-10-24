// features/terminal/panelesLocales.ts — qué panel de terminal está activo en cada pestaña de terminal local (lo marca
// LocalTerminalGroup). Lo usan el chat y Comandos para leer y escribir en el panel donde está trabajando la persona.
const activos = new Map<string, string>();

export const marcarPanelActivo = (tabId: string, paneId: string | null) => {
  if (paneId) activos.set(tabId, paneId);
  else activos.delete(tabId);
};

export const panelActivo = (tabId: string): string | null => activos.get(tabId) ?? null;
