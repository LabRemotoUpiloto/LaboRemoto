// Utilidades comunes extraídas de ChatPane

// 4px era demasiado estricto -- cualquier reflow minimo (ej. el scroll
// horizontal de un bloque de codigo, o el timestamp cambiando de tamaño)
// hacia que se considerara "no estas cerca del final" y se dejara de seguir
// el mensaje que se estaba generando.
export const isNearBottom = (el: HTMLElement, threshold = 80) =>
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
