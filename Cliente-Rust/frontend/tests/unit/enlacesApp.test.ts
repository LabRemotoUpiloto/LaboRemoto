import { describe, expect, it } from 'vitest';
import { leerEnlaceApp } from '@/app/enlacesApp';

describe('leerEnlaceApp', () => {
  it('reconoce laboremoto://practica/<id>, también con barra final o en mayúsculas el host', () => {
    expect(leerEnlaceApp('laboremoto://practica/linux-m3')).toEqual({ tipo: 'practica', id: 'linux-m3' });
    expect(leerEnlaceApp('laboremoto://practica/ev3-m5/')).toEqual({ tipo: 'practica', id: 'ev3-m5' });
    expect(leerEnlaceApp('  laboremoto://Practica/ev3.m_1  ')).toEqual({ tipo: 'practica', id: 'ev3.m_1' });
  });

  it('ignora otros esquemas, otras rutas y ids que no parecen ids de práctica', () => {
    for (const malo of [
      'https://practica/linux-m3', 'laboremoto://curso/3', 'laboremoto://practica/', 'laboremoto://practica',
      'laboremoto://practica/a%20b', 'laboremoto://practica/..%2Fx', 'laboremoto://practica/<script>', 'no es un enlace',
      `laboremoto://practica/${'a'.repeat(101)}`,
    ]) expect(leerEnlaceApp(malo), malo).toBeNull();
  });
});
