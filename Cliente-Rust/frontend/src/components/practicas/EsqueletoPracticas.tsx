// components/practicas/EsqueletoPracticas.tsx — lo que se ve mientras cargan las prácticas, en vez de un ícono
// girando: la forma de lo que va a aparecer (las tarjetas de categoría), así el estudiante ve que algo viene y
// dónde va a estar.
import React from 'react';
import { Card, Group, SimpleGrid, Stack } from '@mantine/core';
import './esqueleto.css';

const Bloque: React.FC<{ w: number | string; h: number; r?: number }> = ({ w, h, r }) => (
  <div className="esq" style={{ width: w, height: h, borderRadius: r }} />
);

/** Tres tarjetas con la forma de CategoryCard (ícono, título, descripción y pie). */
export const EsqueletoCategorias: React.FC = () => (
  <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" aria-busy="true">
    <span className="esq-oculto" role="status">Cargando prácticas…</span>
    {[0, 1, 2].map((i) => (
      <Card key={i} padding="lg" className="dribbble-card" aria-hidden="true">
        <Stack gap="md">
          <Bloque w={44} h={44} r={10} />
          <Stack gap={8}>
            <Bloque w="58%" h={18} />
            <Bloque w="100%" h={12} />
            <Bloque w="82%" h={12} />
          </Stack>
          <Group justify="space-between" mt="xs">
            <Bloque w={90} h={10} />
            <Bloque w={14} h={10} />
          </Group>
        </Stack>
      </Card>
    ))}
  </SimpleGrid>
);
