import { useMemo } from 'react';
import { useAuth } from '@/features/cuenta/AuthContext';

const STORAGE_KEY = 'laboDisplayName';

function formatFirstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  // los nombres de Keycloak llegan en mayúsculas («ANDRES FELIPE»)
  const base = trimmed === trimmed.toUpperCase() ? trimmed.toLowerCase() : trimmed;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Nombre para el saludo de Inicio: el guardado, el de Moodle o el primer nombre de la cuenta; si no hay ninguno, «Estudiante». */
export function useDisplayName(): string {
  const { user } = useAuth();
  const primero = (user?.given_name || user?.name || '').trim().split(/\s+/)[0] ?? '';
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
    return formatFirstName(primero) || 'Estudiante';
  }, [primero]);
}
