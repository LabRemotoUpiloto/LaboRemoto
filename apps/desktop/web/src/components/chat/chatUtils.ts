// Utilidades comunes extraídas de ChatPane

export const isNearBottom = (el: HTMLElement, threshold = 4) =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

export const cleanText = (text: string) => {
  let cleaned = (text || '');
  
  // DEBUG: Log del texto antes de limpiar
  const isCalculadora = cleaned.includes('calculadora');
  if (isCalculadora) {
    console.log('[cleanText] ===== ENTRADA =====');
    console.log('[cleanText] Texto recibido (primeros 800 chars):', cleaned.substring(0, 800));
  }
  
  // Limpiar etiquetas de lenguaje SOLO si NO son parte de un shebang O de un bloque de código
  // Proteger: shebangs (#!/bin/bash) y delimitadores de código (```bash)
  const lines = cleaned.split('\n').map((line, idx) => {
    const original = line;
    
    // Si la línea contiene un shebang, no la toques
    if (line.includes('#!')) {
      if (isCalculadora) console.log(`[cleanText] Línea ${idx}: SHEBANG protegido:`, line);
      return line;
    }
    
    // Si la línea es un delimitador de bloque de código (```bash, ```sh, etc.), no la toques
    if (/^\s*```\s*(bash|sh|shell|python|py|javascript|js|typescript|ts|java|c|cpp|rust|go)\s*$/i.test(line)) {
      if (isCalculadora) console.log(`[cleanText] Línea ${idx}: DELIMITER CODE BLOCK protegido:`, line);
      return line;
    }
    
    // Solo entonces limpia las etiquetas de lenguaje al final
    const cleaned = line.replace(/\b(?:bash|sh|shell)\b\s*:?\s*$/gmi, '');
    
    if (isCalculadora && original !== cleaned) {
      console.log(`[cleanText] Línea ${idx}: MODIFICADA`);
      console.log(`  Original: "${original}"`);
      console.log(`  Limpiada: "${cleaned}"`);
    }
    
    return cleaned;
  });
  
  const result = lines.join('\n')
    .replace(/:\s*\b(?:bash|sh|shell)\b/gmi, ': ')
    .replace(/^Comando sugerido:\s*/gmi, '')
    .replace(/"""/g, '')
    .replace(/^\s+|\s+$/g, '')
    .trim();
  
  // DEBUG: Log del resultado
  if (isCalculadora) {
    console.log('[cleanText] ===== SALIDA =====');
    console.log('[cleanText] Resultado (primeros 800 chars):', result.substring(0, 800));
    console.log('[cleanText] ¿Contiene "```bash"?:', result.includes('```bash'));
    console.log('[cleanText] ¿Contiene "chmod +x calculadora.sh"?:', result.includes('chmod +x calculadora.sh'));
    console.log('[cleanText] ¿Contiene "chmod +x calculadora."?:', result.includes('chmod +x calculadora.'));
    console.log('[cleanText] ========================');
  }
  
  return result;
};

// Normalizador ligero para comparar contenido redundante
export const norm = (s?: string | null) => (s || '')
  .replace(/[`]/g, '')
  .replace(/[.,;:!?¡¿"']+/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
