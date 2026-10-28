// @vitest-environment jsdom
// tests/unit/preferenciaVistaEv3.test.ts — «Ver todo» de la práctica de EV3 se recuerda por estudiante, no por
// computador (los equipos del laboratorio son compartidos).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLAVE_VISTA_COMPLETA_COMUN,
  claveVistaCompleta,
  guardarVistaCompleta,
  leerVistaCompleta,
} from '@/features/practicas/ev3/preferenciaVista';

beforeEach(() => localStorage.clear());

describe('preferencia de vista de la práctica de EV3', () => {
  it('lo que elige un estudiante no le cambia la vista al siguiente', () => {
    guardarVistaCompleta('ana', true);
    expect(leerVistaCompleta('ana')).toBe(true);
    expect(leerVistaCompleta('beto')).toBe(false);
  });

  it('volver a la vista guiada borra la preferencia', () => {
    guardarVistaCompleta('ana', true);
    guardarVistaCompleta('ana', false);
    expect(leerVistaCompleta('ana')).toBe(false);
    expect(localStorage.getItem(claveVistaCompleta('ana'))).toBeNull();
  });

  it('el usuario no distingue mayúsculas', () => {
    guardarVistaCompleta('Ana.Perez', true);
    expect(leerVistaCompleta('ana.perez')).toBe(true);
  });

  it('sin usuario no se guarda ni se lee nada', () => {
    guardarVistaCompleta('', true);
    expect(localStorage.length).toBe(0);
    expect(leerVistaCompleta('')).toBe(false);
  });

  it('la clave común de versiones anteriores ya no manda y se borra', () => {
    localStorage.setItem(CLAVE_VISTA_COMPLETA_COMUN, '1');
    expect(leerVistaCompleta('beto')).toBe(false);
    expect(localStorage.getItem(CLAVE_VISTA_COMPLETA_COMUN)).toBeNull();
  });
});
