import React, { useState } from 'react';
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import type { LinuxBlock } from '../../../../../services/linuxPractice.service';

/**
 * Máquina de estados configurable: los estados y los eventos que llevan de uno
 * a otro vienen del módulo. Solo se ofrecen los eventos válidos desde el
 * estado actual.
 */
export function StateMachineBlock({ block }: { block: Extract<LinuxBlock, { type: 'state_machine' }> }) {
  const first = block.states.some(s => s.id === block.initial) ? block.initial : block.states[0]?.id ?? '';
  const [current, setCurrent] = useState(first);

  const available = block.events.filter(e => e.from === current);
  const label = (id: string) => block.states.find(s => s.id === id)?.label ?? id;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        <Text fw={600} fz="sm">{block.title ?? 'Máquina de estados'}</Text>
        <Group gap={6}>
          {block.states.map(s => (
            <div
              key={s.id}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 12,
                border: `2px solid ${s.id === current ? '#4ec94e' : 'rgba(127,127,127,0.35)'}`,
                background: s.id === current ? 'rgba(78,201,78,0.15)' : 'transparent',
                fontWeight: s.id === current ? 700 : 400,
              }}
            >
              {s.label}
            </div>
          ))}
        </Group>
        <Text fz="xs">Estado actual: <b>{label(current)}</b>. Prueba disparar un evento:</Text>
        <Group gap={6}>
          {available.map(e => (
            <Button key={e.id} size="compact-xs" variant="light" onClick={() => setCurrent(e.to)}>
              {e.label}
            </Button>
          ))}
          {available.length === 0 && <Text fz="xs" c="dimmed">Desde este estado no hay eventos.</Text>}
        </Group>
        <Button size="compact-xs" variant="subtle" color="gray" style={{ alignSelf: 'flex-start' }} onClick={() => setCurrent(first)}>
          Reiniciar
        </Button>
      </Stack>
    </Paper>
  );
}

export default StateMachineBlock;
