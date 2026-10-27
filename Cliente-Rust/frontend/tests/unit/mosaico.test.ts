// Mosaico: abrir, ocultar, mover e intercambiar paneles sin perder ninguno.
import { describe, expect, it } from 'vitest';
import { abrir, alternar, conTamanos, division, hoja, hojas, mover, quitar, type Nodo } from '@/components/mosaico/arbol';

const T = 'terminal';

describe('abrir', () => {
  it('sin nada abierto, el panel ocupa todo', () => {
    expect(abrir(null, 'chat', T)).toEqual(hoja('chat'));
  });

  it('con la terminal sola, el panel va a su derecha con un tercio del ancho', () => {
    const a = abrir(hoja(T), 'chat', T);
    expect(a).toMatchObject({ tipo: 'division', direccion: 'horizontal', tamanos: [66, 34] });
    expect(hojas(a)).toEqual([T, 'chat']);
  });

  it('si ya hay una columna a la derecha, se suma abajo en ella', () => {
    const a = abrir(abrir(abrir(hoja(T), 'chat', T), 'comandos', T), 'archivos', T);
    expect(hojas(a)).toEqual([T, 'chat', 'comandos', 'archivos']);
    const derecha = (a as Extract<Nodo, { tipo: 'division' }>).hijos[1];
    expect(derecha).toMatchObject({ tipo: 'division', direccion: 'vertical' });
    expect(hojas(derecha)).toEqual(['chat', 'comandos', 'archivos']);
  });

  it('abrir algo que ya está no cambia nada', () => {
    const a = abrir(hoja(T), 'chat', T);
    expect(abrir(a, 'chat', T)).toBe(a);
  });
});

describe('quitar y alternar', () => {
  it('ocultar el último panel deja el mosaico vacío (la sesión sigue)', () => {
    expect(quitar(hoja(T), T)).toBeNull();
    expect(alternar(hoja(T), T, T)).toBeNull();
  });

  it('una división que queda con un hijo se reemplaza por ese hijo', () => {
    expect(quitar(division('horizontal', [hoja(T), hoja('chat')]), 'chat')).toEqual(hoja(T));
  });

  it('alternar abre lo que está oculto y oculta lo que está abierto', () => {
    const a = alternar(hoja(T), 'pines', T);
    expect(hojas(a)).toEqual([T, 'pines']);
    expect(hojas(alternar(a, 'pines', T))).toEqual([T]);
  });
});

describe('mover', () => {
  const base = division('horizontal', [hoja(T), division('vertical', [hoja('chat'), hoja('comandos')])]);

  it('soltar abajo de la terminal la parte en dos y saca el panel de su columna', () => {
    const a = mover(base, 'comandos', T, 'abajo');
    expect(hojas(a)).toEqual([T, 'comandos', 'chat']);
    const izquierda = (a as Extract<Nodo, { tipo: 'division' }>).hijos[0];
    expect(izquierda).toMatchObject({ tipo: 'division', direccion: 'vertical' });
  });

  it('soltar a la izquierda lo pone antes', () => {
    expect(hojas(mover(base, 'chat', T, 'izquierda'))).toEqual(['chat', T, 'comandos']);
  });

  it('en el centro intercambia los dos paneles', () => {
    expect(hojas(mover(base, 'comandos', T, 'centro'))).toEqual(['comandos', 'chat', T]);
  });

  it('soltar sobre sí mismo o con un panel que no está no cambia nada', () => {
    expect(mover(base, T, T, 'derecha')).toBe(base);
    expect(mover(base, 'pines', T, 'derecha')).toBe(base);
  });
});

it('guarda los tamaños de una división', () => {
  const d = division('horizontal', [hoja(T), hoja('chat')]);
  expect(conTamanos(d, (d as Extract<Nodo, { tipo: 'division' }>).id, [70, 30])).toMatchObject({ tamanos: [70, 30] });
});
