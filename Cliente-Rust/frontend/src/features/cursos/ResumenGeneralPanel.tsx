// pages/cursos/ResumenGeneralPanel.tsx — vista general de un curso para el docente: el porcentaje de cada estudiante en TODAS las
// prácticas y cómo va en cada una. Los datos salen de Moodle (cmd::moodle_resumen_curso); las cuentas están en entregasStats.ts.
import React, { useEffect, useState } from 'react';
import { Box, Group, Loader, Paper, Progress, SimpleGrid, Table, Text, Tooltip } from '@mantine/core';
import { moodleCursosService, type ResumenCurso } from './moodleCursos.service';
import { etiquetaEstadoDocente, resumenGeneral, textoNota } from './entregasStats';

const mensajeDe = (e: any) => e?.message ?? String(e);

/** Verde / ámbar / rojo según la nota general, para ubicar de un vistazo a quien necesita ayuda. */
const colorNota = (n: number) => (n >= 70 ? 'green' : n >= 40 ? 'yellow' : 'red');

const Dato: React.FC<{ etiqueta: string; valor: string; detalle?: string }> = ({ etiqueta, valor, detalle }) => (
  <Paper radius="lg" p="md" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)' }}>
    <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '.05em' }}>{etiqueta}</Text>
    <Text fw={800} style={{ fontSize: 24 }}>{valor}</Text>
    {detalle && <Text size="xs" c="dimmed">{detalle}</Text>}
  </Paper>
);

export default function ResumenGeneralPanel({ cursoId }: { cursoId: number }) {
  const [datos, setDatos] = useState<ResumenCurso | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setDatos(null);
    setError(null);
    moodleCursosService.resumenCurso(cursoId)
      .then((r) => { if (activo) setDatos(r); })
      .catch((e: any) => { if (activo) setError(mensajeDe(e)); });
    return () => { activo = false; };
  }, [cursoId]);

  if (error) return <Text size="sm" c="dimmed" py="md">{error}</Text>;
  if (!datos) return <Group py="md"><Loader size="xs" /><Text size="sm" c="dimmed">Cargando la vista general…</Text></Group>;
  if (datos.practicas.length === 0) return <Text size="sm" c="dimmed" py="md">Este curso aún no tiene prácticas de laboratorio.</Text>;
  if (datos.estudiantes.length === 0) return <Text size="sm" c="dimmed" py="md">Este curso no tiene estudiantes matriculados.</Text>;

  const g = resumenGeneral(datos);
  return (
    <Box py="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mb="md">
        <Dato etiqueta="Estudiantes" valor={String(g.curso.estudiantes)} detalle={`${g.curso.practicas} práctica(s) en el curso`} />
        <Dato etiqueta="Avance del curso" valor={`${textoNota(g.curso.avance)}`} detalle="Prácticas entregadas sobre el total, en promedio" />
        <Dato etiqueta="Nota general del curso" valor={textoNota(g.curso.general)} detalle="Promedio de todos; lo no entregado cuenta como 0" />
      </SimpleGrid>

      <Text size="xs" c="dimmed" mb={6}>
        «General» es el promedio de todas las prácticas del curso: la que un estudiante no ha entregado cuenta como 0. Son notas provisionales
        hasta que las confirmes en Moodle.
      </Text>

      <Box style={{ overflowX: 'auto' }}>
        <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover={false} style={{ minWidth: 640 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Estudiante</Table.Th>
              <Table.Th style={{ minWidth: 150 }}>Avance</Table.Th>
              <Table.Th>General</Table.Th>
              {datos.practicas.map((p) => (
                <Table.Th key={p.cmid}>
                  <Tooltip label={p.nombre} withArrow><span>{p.practica}</span></Tooltip>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {g.filas.map((f) => (
              <Table.Tr key={f.usuario}>
                <Table.Td>
                  <Text size="sm" fw={500}>{f.nombre}</Text>
                  {f.nombre !== f.usuario && <Text size="xs" c="dimmed">{f.usuario}</Text>}
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed" mb={2}>{f.entregadas} de {f.total} · {textoNota(f.avance)}</Text>
                  <Progress value={f.avance} size="sm" radius="xl" aria-label={`Avance de ${f.nombre}`} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={800} c={colorNota(f.general)}>{textoNota(f.general)}</Text>
                </Table.Td>
                {f.notas.map((n, j) => (
                  <Table.Td key={datos.practicas[j].cmid}>
                    <Tooltip label={etiquetaEstadoDocente({ estado: f.estados[j], nota: n })} withArrow>
                      <Text size="sm" c={n === null ? 'dimmed' : undefined}>{textoNota(n)}</Text>
                    </Tooltip>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Td colSpan={3}><Text size="xs" c="dimmed">Por práctica: entregaron · promedio</Text></Table.Td>
              {g.porPractica.map((p) => (
                <Table.Td key={p.cmid}><Text size="xs" c="dimmed">{p.entregaron}/{g.curso.estudiantes} · {textoNota(p.promedio)}</Text></Table.Td>
              ))}
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Box>
    </Box>
  );
}
