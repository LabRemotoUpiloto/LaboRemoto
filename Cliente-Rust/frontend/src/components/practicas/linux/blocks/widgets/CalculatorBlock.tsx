import React, { useMemo, useState } from 'react';
import { Group, Paper, Slider, Stack, Text } from '@mantine/core';
import type { LinuxBlock } from '../../../../../services/linuxPractice.service';
import { fillTemplate, formatNumber, tryEvaluateExpr, type MathVars } from '../../../../../utils/mathExpr';

/**
 * Calculadora configurable desde el módulo: sliders de entrada y resultados que
 * son fórmulas sobre esas entradas (y sobre resultados anteriores). La fórmula
 * se evalúa con `utils/mathExpr`, nunca con `eval`.
 */
export function CalculatorBlock({ block }: { block: Extract<LinuxBlock, { type: 'calculator' }> }) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(block.inputs.map(i => [i.id, i.default])),
  );

  const results = useMemo(() => {
    const vars: MathVars = { ...values };
    const shown: Record<string, string> = {};
    for (const o of block.outputs) {
      const v = tryEvaluateExpr(o.expr, vars);
      if (v !== null) vars[o.id] = v;
      shown[o.id] = formatNumber(v, o.decimals ?? 1);
    }
    return shown;
  }, [values, block.outputs]);

  const code = useMemo(() => {
    if (!block.code_template) return null;
    const fmt: Record<string, string> = { ...results };
    for (const i of block.inputs) fmt[i.id] = String(values[i.id]);
    // En el código van números "de máquina": sin separador de miles y con punto decimal.
    for (const o of block.outputs) {
      const v = tryEvaluateExpr(o.expr, { ...values });
      if (v !== null) fmt[o.id] = Number.isInteger(v) ? String(v) : v.toFixed(o.decimals ?? 1);
    }
    return fillTemplate(block.code_template, fmt);
  }, [block, results, values]);

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        {block.title && <Text fw={600} fz="sm">{block.title}</Text>}
        {block.inputs.map(i => (
          <div key={i.id}>
            <Group justify="space-between">
              <Text fz="xs">{i.label}</Text>
              <Text fz="xs" ff="monospace">{values[i.id]}{i.unit ? ` ${i.unit}` : ''}</Text>
            </Group>
            <Slider
              min={i.min}
              max={i.max}
              step={i.step ?? 1}
              value={values[i.id]}
              onChange={v => setValues(prev => ({ ...prev, [i.id]: v }))}
              label={null}
            />
          </div>
        ))}
        {block.outputs.map(o => (
          <Group key={o.id} justify="space-between" wrap="nowrap" style={{ background: 'rgba(127,127,127,0.1)', borderRadius: 6, padding: '6px 10px' }}>
            <Text fz="xs">{o.label}</Text>
            <Text fz="sm" fw={700} ff="monospace">{results[o.id]}{o.unit ? ` ${o.unit}` : ''}</Text>
          </Group>
        ))}
        {code && (
          <Text component="pre" ff="monospace" fz="xs" m={0} p="xs" style={{ background: '#14150F', color: '#E5E9DE', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
            {code}
          </Text>
        )}
        {block.note_md && <Text fz="xs" c="dimmed" style={{ lineHeight: 1.5 }}>{block.note_md}</Text>}
      </Stack>
    </Paper>
  );
}

export default CalculatorBlock;
