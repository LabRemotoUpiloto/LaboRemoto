import React, { useState } from 'react';
import { Checkbox, Paper, Stack, Text } from '@mantine/core';
import type { LinuxBlock } from '../../../../../services/linuxPractice.service';

/** Lista de verificación para marcar (autoevaluación, buenas prácticas). No se califica. */
export function ChecklistBlock({ block }: { block: Extract<LinuxBlock, { type: 'checklist' }> }) {
  const [marked, setMarked] = useState<Record<number, boolean>>({});
  const done = block.items.filter((_, i) => marked[i]).length;
  const all = done === block.items.length && block.items.length > 0;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        {block.title && <Text fw={600} fz="sm">{block.title}</Text>}
        {block.items.map((item, i) => (
          <Checkbox
            key={i}
            size="xs"
            label={item}
            checked={!!marked[i]}
            onChange={e => setMarked(prev => ({ ...prev, [i]: e.currentTarget.checked }))}
            styles={{ label: { lineHeight: 1.45, fontSize: 13 } }}
          />
        ))}
        <Text fz="xs" c="dimmed">{done}/{block.items.length} marcados</Text>
        {all && block.done_md && <Text fz="sm" style={{ lineHeight: 1.5 }}>{block.done_md}</Text>}
      </Stack>
    </Paper>
  );
}

export default ChecklistBlock;
