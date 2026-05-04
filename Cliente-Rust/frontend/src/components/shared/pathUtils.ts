/**
 * Une un path base con un nombre de archivo/carpeta (local - Windows/Unix)
 * @param base - Path base
 * @param name - Nombre del archivo/carpeta
 */
export function joinLocalPath(base: string, name: string): string {
  const isWindows = /^[A-Za-z]:/.test(base);
  const sep = isWindows ? '\\' : '/';
  return base && !base.endsWith(sep) ? base + sep + name : base + name;
}

/**
 * Une un path base con un nombre de archivo/carpeta (remoto - Unix)
 * @param base - Path base
 * @param name - Nombre del archivo/carpeta
 */
export function joinRemotePath(base: string, name: string): string {
  return base === '/' ? '/' + name : base.replace(/\/$/, '') + '/' + name;
}

/**
 * Obtiene el directorio padre de un path local
 * @param path - Path completo
 */
export function getParentLocalPath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/');
  if (normalized === '/' || /^[A-Za-z]:\\?$/.test(path)) {
    return null; // Ya estamos en la raíz
  }
  const idx = normalized.lastIndexOf('/');
  if (idx > 0) {
    return normalized.slice(0, idx);
  }
  return null;
}

/**
 * Obtiene el directorio padre de un path remoto
 * @param path - Path completo
 */
export function getParentRemotePath(path: string): string | null {
  if (path === '/') return null;
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  const idx = normalized.lastIndexOf('/');
  return idx <= 0 ? '/' : normalized.slice(0, idx);
}

/**
 * Extrae el nombre del archivo/carpeta de un path
 * @param path - Path completo
 */
export function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}
