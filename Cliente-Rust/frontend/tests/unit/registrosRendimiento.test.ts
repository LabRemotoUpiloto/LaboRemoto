import { describe, it, expect } from 'vitest';
import type { EventoSsh, RegistroApi } from '../../src/services/rendimiento.service';
import {
  claveApi, claveSsh, contarEventos, eventoConProblema, peticionConProblema, unirRegistros,
} from '../../src/pages/rendimiento/registros';

const pet = (t: number, estado = 200, ms = 50): RegistroApi => ({ t, metodo: 'GET', ruta: `/practices/x${t}`, tipo: 'modulo', estado, ms, bytes: 100 });
const ev = (t: number, tipo: EventoSsh['tipo'], mensaje = `m${t}`): EventoSsh => ({ t, tipo, usuario: 'u', ip: '1.2.3.4', mensaje });

describe('registros del panel de Rendimiento', () => {
  it('una petición es problema si falló, dio error o tardó más de 1 s', () => {
    expect(peticionConProblema(pet(1))).toBe(false);
    expect(peticionConProblema(pet(1, 404))).toBe(true);
    expect(peticionConProblema(pet(1, 0))).toBe(true);
    expect(peticionConProblema(pet(1, 200, 1500))).toBe(true);
  });

  it('entrar y salir no son problemas; rechazos y cortes sí', () => {
    expect(eventoConProblema(ev(1, 'entrada'))).toBe(false);
    expect(eventoConProblema(ev(1, 'salida'))).toBe(false);
    expect(eventoConProblema(ev(1, 'rechazada_por_exceso'))).toBe(true);
    expect(eventoConProblema(ev(1, 'clave_incorrecta'))).toBe(true);
  });

  it('une sin repetir los eventos que llegan dos veces (se piden desde un segundo antes)', () => {
    const previos = [ev(10, 'entrada', 'a'), ev(11, 'entrada', 'b')];
    const unidos = unirRegistros(previos, [ev(11, 'entrada', 'b'), ev(11, 'salida', 'c'), ev(12, 'cortada', 'd')], claveSsh);
    expect(unidos.map((e) => e.mensaje)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('se queda con los últimos y en orden', () => {
    const unidos = unirRegistros([pet(3), pet(1)], [pet(2), pet(4)], claveApi, 3);
    expect(unidos.map((r) => r.t)).toEqual([2, 3, 4]);
  });

  it('cuenta los eventos de cada tipo desde un instante', () => {
    const c = contarEventos([ev(1, 'entrada'), ev(5, 'entrada'), ev(6, 'rechazada_por_exceso'), ev(7, 'rechazada_por_exceso')], 5);
    expect(c).toEqual({ entrada: 1, rechazada_por_exceso: 2 });
  });
});
