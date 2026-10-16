import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tryEvaluateExpr, type MathVars } from '../../src/utils/mathExpr';

// Los módulos viven en infra/practicas/ev3/content/ev3-mN (se despliegan a la Pi);
// aquí se comprueba que los bloques interactivos sean coherentes con lo que
// la app sabe dibujar.
const ROOT = resolve(__dirname, '../../../../infra/practicas/ev3/content');

interface Block { type: string; id: string; [k: string]: any }

const modules: { id: string; blocks: Block[] }[] = existsSync(ROOT)
  ? readdirSync(ROOT)
      .filter(d => /^ev3-m\d+$/.test(d))
      .sort()
      .map(d => JSON.parse(readFileSync(resolve(ROOT, d, 'module.json'), 'utf8')))
  : [];

const KNOWN = new Set([
  'text', 'code_block', 'quiz', 'checkpoint',
  'wheels_sim', 'calculator', 'sensor_demo', 'state_machine', 'checklist',
  'media', 'step_gate',
]);

describe('módulos ev3-m*', () => {
  it('hay nueve módulos', () => {
    expect(modules.map(m => m.id)).toEqual(Array.from({ length: 9 }, (_, i) => `ev3-m${i + 1}`));
  });

  it('solo usan tipos de bloque que la app sabe dibujar y sin ids repetidos', () => {
    for (const m of modules) {
      const ids = m.blocks.map(b => b.id);
      expect(new Set(ids).size, `${m.id}: ids repetidos`).toBe(ids.length);
      for (const b of m.blocks) expect(KNOWN.has(b.type), `${m.id}/${b.id}: tipo ${b.type}`).toBe(true);
    }
  });

  it('cada imagen referenciada existe en la carpeta media del módulo', () => {
    for (const m of modules) {
      for (const b of m.blocks.filter(x => x.type === 'media')) {
        const ruta = resolve(ROOT, m.id, 'media', b.file);
        expect(existsSync(ruta), `${m.id}/${b.id}: falta media/${b.file}`).toBe(true);
      }
    }
  });

  it('los módulos con pasos (step_gate) no dejan quiz antes del último freno', () => {
    for (const m of modules) {
      const ultimoFreno = m.blocks.map(b => b.type).lastIndexOf('step_gate');
      if (ultimoFreno < 0) continue;
      const primerQuiz = m.blocks.findIndex(b => b.type === 'quiz');
      expect(primerQuiz, `${m.id}: quiz antes del último freno`).toBeGreaterThan(ultimoFreno);
    }
  });

  it('cada calculadora evalúa todas sus salidas con los valores por defecto', () => {
    let count = 0;
    for (const m of modules) {
      for (const b of m.blocks.filter(x => x.type === 'calculator')) {
        count++;
        const vars: MathVars = Object.fromEntries(b.inputs.map((i: any) => [i.id, i.default]));
        for (const o of b.outputs) {
          const v = tryEvaluateExpr(o.expr, vars);
          expect(v, `${m.id}/${b.id}/${o.id}: ${o.expr}`).not.toBeNull();
          vars[o.id] = v as number;
        }
        // la plantilla de código solo nombra entradas o salidas que existen
        for (const name of (b.code_template ?? '').match(/\{[A-Za-z_]\w*\}/g) ?? []) {
          expect(name.slice(1, -1) in vars, `${m.id}/${b.id}: {${name}} sin valor`).toBe(true);
        }
        for (const i of b.inputs) {
          expect(i.default).toBeGreaterThanOrEqual(i.min);
          expect(i.default).toBeLessThanOrEqual(i.max);
        }
      }
    }
    expect(count).toBe(3);
  });

  it('los valores de ejemplo de la teoría coinciden con las calculadoras', () => {
    const m3 = modules.find(m => m.id === 'ev3-m3')!;
    const grados = m3.blocks.find(b => b.id === 'w-grados')!;
    const v1 = tryEvaluateExpr(grados.outputs[0].expr, { diametro: 5.6, distancia: 30 })!;
    expect(Math.round(v1)).toBe(614);
    const giro = m3.blocks.find(b => b.id === 'w-giro')!;
    const v2 = tryEvaluateExpr(giro.outputs[1].expr, { angulo: 90, diametro: 5.6, ancho: 12 })!;
    expect(Math.round(v2)).toBe(193);
  });

  it('las máquinas de estado tienen estado inicial y eventos entre estados existentes', () => {
    for (const m of modules) {
      for (const b of m.blocks.filter(x => x.type === 'state_machine')) {
        const ids = new Set(b.states.map((s: any) => s.id));
        expect(ids.has(b.initial)).toBe(true);
        for (const e of b.events) {
          expect(ids.has(e.from) && ids.has(e.to), `${m.id}/${b.id}/${e.id}`).toBe(true);
        }
      }
    }
  });

  it('los sensores y las zonas están bien formados', () => {
    for (const m of modules) {
      for (const b of m.blocks.filter(x => x.type === 'sensor_demo')) {
        expect(['touch', 'ultrasonic', 'color']).toContain(b.sensor);
        if (b.zones) {
          expect(b.sensor).toBe('ultrasonic');
          // solo la última zona puede omitir max_cm
          b.zones.slice(0, -1).forEach((z: any) => expect(typeof z.max_cm).toBe('number'));
        }
      }
      for (const b of m.blocks.filter(x => x.type === 'checklist')) {
        expect(b.items.length).toBeGreaterThan(0);
      }
    }
  });
});
