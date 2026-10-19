// components/cursos/ResultadoMoodleAviso.tsx — aviso flotante de respaldo para enviar a Moodle una práctica ya aprobada.
// El envío normal se ofrece dentro del modal de la insignia (ModuleCompleteCelebration); este aviso solo aparece cuando ese modal no
// está abierto: p. ej. si la práctica ya tenía la insignia (el modal se salta) o el estudiante lo cerró sin enviar.
import { useState } from 'react';
import { Paper } from '@mantine/core';
import { EnvioMoodleContenido, hayEnvio } from './EnvioMoodlePanel';
import { useCelebracionAbierta, useEnvioMoodle, type ResultadoPractica } from './envioMoodle';

export { notaYResumen, textoRegistro, yaEnviada, type ResultadoPractica } from './envioMoodle';

function AvisoPractica({ resultado, habilitado }: { resultado: ResultadoPractica; habilitado: boolean }) {
  const [descartado, setDescartado] = useState(false);
  const e = useEnvioMoodle(resultado, habilitado);
  if (descartado || !hayEnvio(e)) return null;
  return (
    <Paper radius="lg" p="md" shadow="lg" style={{ background: 'var(--background-secondary)', border: '1px solid var(--accent-primary)' }}>
      <EnvioMoodleContenido e={e} resultado={resultado} onAhoraNo={() => setDescartado(true)} />
    </Paper>
  );
}

export default function ResultadoMoodleAviso({ resultados, habilitado }: {
  resultados: Record<string, ResultadoPractica | null>;
  habilitado: boolean;
}) {
  const celebrando = useCelebracionAbierta();
  const aprobadas = Object.values(resultados).filter((r): r is ResultadoPractica => !!r && r.passed);
  if (!habilitado || celebrando || aprobadas.length === 0) return null;
  return (
    <div style={{ position: 'fixed', left: 24, bottom: 24, zIndex: 9997, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {aprobadas.map((r) => <AvisoPractica key={r.practice_id} resultado={r} habilitado={habilitado} />)}
    </div>
  );
}
