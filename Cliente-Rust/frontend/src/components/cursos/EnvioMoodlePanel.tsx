// components/cursos/EnvioMoodlePanel.tsx — bloque «¿Enviar a Moodle?» de una práctica aprobada: se muestra dentro del modal de la
// insignia (ModuleCompleteCelebration) y en el aviso flotante de respaldo. Si la práctica no tiene tarea en Moodle, no muestra nada.
import React from 'react';
import { Button, Checkbox, Group, Text } from '@mantine/core';
import { notaYResumen, useEnvioMoodle, type EnvioMoodle, type ResultadoPractica } from './envioMoodle';

/** ¿Hay algo que mostrar? (una tarea pendiente o el resultado de un envío). */
export const hayEnvio = (e: EnvioMoodle) => e.pendiente || !!e.mensaje;

export function EnvioMoodleContenido({ e, resultado, onAhoraNo }: {
  e: EnvioMoodle;
  resultado: ResultadoPractica;
  /** Si se pasa, aparece el botón «Ahora no» (en el aviso flotante). */
  onAhoraNo?: () => void;
}) {
  const { vinculo } = e;

  // Tras enviar solo queda la confirmación (el estado de la tarea ya cambió y `pendiente` es falso).
  if (e.mensaje && (e.mensaje.ok || vinculo)) {
    return <Text size="xs" role="status" style={{ color: e.mensaje.ok ? 'var(--success, #22c55e)' : '#ef4444' }}>{e.mensaje.texto}</Text>;
  }
  if (!vinculo || !e.pendiente) return null;

  const { practica, curso } = vinculo;
  return (
    <div role="status" style={{ width: '100%', textAlign: 'left' }}>
      <Text fw={700} size="sm">Envía esta práctica a tu docente</Text>
      <Text size="xs" c="dimmed" mt={2}>
        Resultado: {notaYResumen(resultado).nota} % · «{practica.nombre}» · curso {curso}.{' '}
        {practica.flujoRevision
          ? 'Queda en Moodle «lista para revisar»; tu docente decide la nota final.'
          : 'La tarea de Moodle no tiene el flujo de calificación activado: pídele a tu docente que lo active para poder enviarla.'}
      </Text>
      {practica.flujoRevision && (
        <Checkbox
          mt="xs"
          size="xs"
          checked={e.adjuntar}
          onChange={(ev) => e.setAdjuntar(ev.currentTarget.checked)}
          label="Adjuntar el registro completo de mi sesión (todo lo que hice en la terminal)"
        />
      )}
      <Group gap="xs" mt="sm" justify="flex-end">
        {onAhoraNo && <Button size="xs" variant="subtle" color="gray" onClick={onAhoraNo}>Ahora no</Button>}
        {practica.flujoRevision && (
          <Button size="xs" onClick={() => void e.enviar()} loading={e.enviando}>Enviar a Moodle</Button>
        )}
      </Group>
    </div>
  );
}

export default function EnvioMoodlePanel({ resultado, habilitado = true }: { resultado: ResultadoPractica; habilitado?: boolean }) {
  const e = useEnvioMoodle(resultado, habilitado);
  return hayEnvio(e) ? <EnvioMoodleContenido e={e} resultado={resultado} /> : null;
}
