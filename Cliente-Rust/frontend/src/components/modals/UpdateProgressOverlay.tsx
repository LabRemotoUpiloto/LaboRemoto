import React from 'react';
import { Progress, Text, Button } from '@mantine/core';
import type { UpdateProgress } from '../../hooks/useUpdateCheck';

const PHASE_LABEL: Record<UpdateProgress['phase'], string> = {
  downloading: 'Descargando actualización…',
  installing: 'Instalando actualización…',
  relaunching: 'Reiniciando la aplicación…',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const mb = n / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

interface UpdateProgressOverlayProps {
  progress: UpdateProgress;
  /** Solo se ofrece mientras se está descargando -- ver nota en useUpdateCheck. */
  onCancel?: () => void;
}

// Pantalla de carga a pantalla completa para la instalación de
// actualizaciones -- antes solo se veía un spinner metido dentro del botón
// "Instalar y reiniciar", sin ningún indicio de qué estaba pasando ni cuánto
// faltaba. Mismo lenguaje visual que GlobalLoader (overlay + card + blur)
// pero con texto y barra de progreso propios del flujo de actualización.
export default function UpdateProgressOverlay({ progress, onCancel }: UpdateProgressOverlayProps) {
  const { phase, downloaded, total } = progress;
  const pct = phase === 'downloading' && total ? Math.min(100, Math.round((downloaded / total) * 100)) : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-body, sans-serif)',
    }}>
      <div style={{
        background: 'var(--background-secondary, var(--background-primary, #1c1c1e))',
        border: '1px solid var(--border-subtle, rgba(128, 128, 128, 0.25))',
        borderRadius: 16,
        padding: '40px 48px',
        maxWidth: 420, width: '90%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        boxShadow: 'var(--shadow, 0 12px 40px rgba(0, 0, 0, 0.35))',
      }}>
        <Text fw={700} size="lg" ta="center" style={{ color: 'var(--text-primary)' }}>
          {PHASE_LABEL[phase]}
        </Text>

        <Progress
          value={pct ?? 100}
          animated={pct === null}
          striped={pct === null}
          color="var(--accent-primary)"
          size="md"
          radius="xl"
          w="100%"
        />

        <Text size="sm" ta="center" style={{ color: 'var(--text-secondary)' }}>
          {phase === 'downloading' && total
            ? `${formatBytes(downloaded)} / ${formatBytes(total)} (${pct}%)`
            : phase === 'downloading'
              ? formatBytes(downloaded)
              : 'No cierres la aplicación mientras se actualiza'}
        </Text>

        {phase === 'downloading' && onCancel && (
          <Button
            variant="outline"
            color="red"
            size="sm"
            onClick={onCancel}
            style={{
              marginTop: 4,
              borderColor: 'var(--danger, #ef4444)',
              color: 'var(--danger, #ef4444)',
            }}
          >
            Cancelar actualización
          </Button>
        )}
      </div>
    </div>
  );
}
