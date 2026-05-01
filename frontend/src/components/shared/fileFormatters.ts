/**
 * Formatea una fecha a formato legible
 * @param ts - Timestamp en milisegundos (local) o segundos (remoto)
 * @param remote - Si es true, el timestamp viene del servidor (en segundos)
 */
export function formatDate(ts?: number, remote = false): string {
  if (!ts) return '';
  try {
    const d = new Date(remote ? ts * 1000 : ts);
    return new Intl.DateTimeFormat('es-CO', { 
      dateStyle: 'short', 
      timeStyle: 'short' 
    }).format(d);
  } catch {
    return '';
  }
}

/**
 * Formatea bytes a tamaño legible (KB, MB, GB, etc.)
 * @param bytes - Número de bytes
 */
export function formatBytes(bytes?: number): string {
  if (bytes == null) return '';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  const formatted = unitIndex === 0 
    ? Math.round(value) 
    : value.toFixed(1);
    
  return `${formatted}\u00A0${units[unitIndex]}`;
}

/**
 * Convierte un filtro con wildcards (* y ?) a RegExp
 * @param filter - String con wildcards
 */
export function wildcardToRegex(filter: string): RegExp {
  const escaped = filter
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}
