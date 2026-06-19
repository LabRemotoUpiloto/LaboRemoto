import { useMemo } from 'react';

const STORAGE_KEY = 'laboDisplayName';

function formatFirstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Nombre para el saludo del agente en inicio (localStorage o fallback). */
export function useDisplayName(): string {
  return useMemo(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)?.trim();
      if (saved) return formatFirstName(saved);

      const moodleRaw = localStorage.getItem('moodleStudent');
      if (moodleRaw) {
        const parsed = JSON.parse(moodleRaw) as { fullname?: string };
        const full = parsed.fullname?.trim();
        if (full) {
          const first = full.split(/\s+/)[0];
          if (first) return formatFirstName(first);
        }
      }
    } catch {
      /* ignore */
    }
    return 'Estudiante';
  }, []);
}

export function setDisplayName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name.trim());
  } catch {
    /* ignore */
  }
}
