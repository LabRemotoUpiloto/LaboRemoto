// Utilidades comunes extraídas de ChatPane

export const isNearBottom = (el: HTMLElement, threshold = 4) =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

export const cleanText = (text: string) => (text || '')
  .replace(/\b(?:bash|sh|shell)\b\s*:?\s*$/gmi, '')
  .replace(/:\s*\b(?:bash|sh|shell)\b/gmi, ': ')
  .replace(/^Comando sugerido:\s*/gmi, '')
  .replace(/"""/g, '')
  .replace(/^\s+|\s+$/g, '')
  .trim();

// Normalizador ligero para comparar contenido redundante
export const norm = (s?: string | null) => (s || '')
  .replace(/[`]/g, '')
  .replace(/[.,;:!?¡¿"']+/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
