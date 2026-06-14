// Utilidades comunes extraídas de ChatPane

export const isNearBottom = (el: HTMLElement, threshold = 4) =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

export const cleanText = (text: string) => {
  const lines = (text || '').split('\n').map(line => {
    if (line.includes('#!')) return line;
    if (/^\s*```\s*(bash|sh|shell|python|py|javascript|js|typescript|ts|java|c|cpp|rust|go)\s*$/i.test(line)) return line;
    return line.replace(/\b(?:bash|sh|shell)\b\s*:?\s*$/gmi, '');
  });
  return lines.join('\n')
    .replace(/:\s*\b(?:bash|sh|shell)\b/gmi, ': ')
    .replace(/^Comando sugerido:\s*/gmi, '')
    .replace(/^\s+|\s+$/g, '')
    .trim();
};

// Normalizador ligero para comparar contenido redundante
export const norm = (s?: string | null) => (s || '')
  .replace(/[`]/g, '')
  .replace(/[.,;:!?¡¿"']+/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
