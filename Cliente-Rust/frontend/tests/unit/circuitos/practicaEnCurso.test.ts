import { beforeEach, describe, expect, it, vi } from 'vitest';

// Entorno node: un localStorage mínimo (mismo simulacro que pruebaRendimiento.test.ts).
const almacen = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => { almacen.set(k, v); },
  removeItem: (k: string) => { almacen.delete(k); },
});
import { guardarLogrados, leerLogrados, marcarCompletada, reiniciarSiNoTermino } from '@/features/circuitos/practicaEnCurso';
import { CHAT_STORAGE_KEY } from '@/features/chat/panel/chatPane.constants';

const CHAT = CHAT_STORAGE_KEY('circuito:circ-m1', 'ask');

describe('reiniciar la práctica de circuitos al abrirla', () => {
  beforeEach(() => {
    almacen.clear();
    guardarLogrados('circ-m1', new Set(['protoboard', 'encajar']));
    localStorage.setItem(CHAT, JSON.stringify([{ id: 'circ-intro', sender: 'ai', text: 'Hola', timestamp: 1 }]));
  });

  it('una práctica sin terminar empieza de cero: sin pasos logrados y sin chat', () => {
    reiniciarSiNoTermino('circ-m1');
    expect(leerLogrados('circ-m1').size).toBe(0);
    expect(localStorage.getItem(CHAT)).toBeNull();
  });

  it('una práctica terminada se abre como quedó', () => {
    marcarCompletada('circ-m1');
    reiniciarSiNoTermino('circ-m1');
    expect([...leerLogrados('circ-m1')]).toEqual(['protoboard', 'encajar']);
    expect(localStorage.getItem(CHAT)).not.toBeNull();
  });

  it('no toca otras prácticas', () => {
    guardarLogrados('circ-m2', new Set(['a']));
    reiniciarSiNoTermino('circ-m1');
    expect(leerLogrados('circ-m2').size).toBe(1);
  });
});
