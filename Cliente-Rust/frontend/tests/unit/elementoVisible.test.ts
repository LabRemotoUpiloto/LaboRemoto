// @vitest-environment jsdom
// El tour resalta el elemento que se ve. Con varias pestañas de sesión montadas, el primer [data-tour] puede ser el de
// una pestaña oculta: el tour se anclaba a él (0×0) y su ventana aparecía en la esquina sin resaltar nada.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { esperarElementoVisible, primerVisible } from '@/features/onboarding/elementoVisible';

const conCaja = (el: HTMLElement, ancho: number, alto: number) => {
  el.getBoundingClientRect = () => ({ width: ancho, height: alto, top: 0, left: 0, right: ancho, bottom: alto, x: 0, y: 0, toJSON: () => ({}) });
  return el;
};

const progreso = (oculto: 'display' | 'visibility' | 'tamaño' | null) => {
  const pestaña = document.createElement('div');
  if (oculto === 'display') pestaña.style.display = 'none';
  if (oculto === 'visibility') pestaña.style.visibility = 'hidden';
  const el = document.createElement('div');
  el.setAttribute('data-tour', 'practica-progreso');
  conCaja(el, oculto === 'tamaño' || oculto === 'display' ? 0 : 300, oculto === 'tamaño' || oculto === 'display' ? 0 : 20);
  pestaña.appendChild(el);
  document.body.appendChild(pestaña);
  return el;
};

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('elemento del tour', () => {
  it('salta las coincidencias de pestañas ocultas y elige la que se ve', () => {
    progreso('display');
    progreso('visibility');
    progreso('tamaño');
    const visible = progreso(null);
    expect(primerVisible(['[data-tour="practica-progreso"]'])).toBe(visible);
  });

  it('respeta el orden de preferencia de los selectores', () => {
    const b = conCaja(document.body.appendChild(Object.assign(document.createElement('div'), { id: 'b' })), 10, 10);
    const a = conCaja(document.body.appendChild(Object.assign(document.createElement('div'), { id: 'a' })), 10, 10);
    expect(primerVisible(['#a', '#b'])).toBe(a);
    expect(primerVisible(['#c', '#b'])).toBe(b);
  });

  it('si solo hay elementos ocultos, al cumplirse la espera devuelve null (ventana centrada, no en la esquina)', async () => {
    vi.useFakeTimers();
    progreso('display');
    const promesa = esperarElementoVisible(['[data-tour="practica-progreso"]'], 500);
    await vi.advanceTimersByTimeAsync(600);
    await expect(promesa).resolves.toBeNull();
  });

  it('espera a que el elemento aparezca mientras la pantalla se monta', async () => {
    vi.useFakeTimers();
    const promesa = esperarElementoVisible(['[data-tour="practica-progreso"]'], 3000);
    await vi.advanceTimersByTimeAsync(200);
    const el = progreso(null);
    await vi.advanceTimersByTimeAsync(200);
    await expect(promesa).resolves.toBe(el);
  });
});
