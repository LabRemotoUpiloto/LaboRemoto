// @vitest-environment jsdom
// tests/unit/trayectorias/editorTrayectorias.test.tsx — editor de trayectorias del EV3 en «Probar con mi robot»: la
// lista de comandos, la grabación de los encoders y la trayectoria real.
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Ev3Status } from '@/features/hardware/ev3.service';
import { EditorTrayectorias } from '@/features/practicas/ev3/trayectorias/EditorTrayectorias';
import { posicionDe, useRegistroEncoders } from '@/features/practicas/ev3/trayectorias/useRegistroEncoders';

// jsdom no dibuja en canvas: el lienzo no pinta y el resto del editor funciona igual.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});
afterEach(cleanup);

const estado = (izq: number | null, der: number | null, conectado = true): Ev3Status => ({
  connected: conectado, ip: 'ev3dev.local', battery: 7.9, alerts: [], reachable: true, sensors: [],
  motors: [
    { port: 'outA', connected: true, speed: 0, position: izq },
    { port: 'outD', connected: true, speed: 0, position: der },
  ],
});

describe('lectura de los encoders', () => {
  it('lee la posición por puerto, con o sin «out»', () => {
    const s = estado(120, -40);
    expect(posicionDe(s, 'outA')).toBe(120);
    expect(posicionDe(s, 'D')).toBe(-40);
    expect(posicionDe(s, 'outB')).toBeNull();
    expect(posicionDe(null, 'outA')).toBeNull();
  });

  it('sin `position` (main.py antiguo) no hay trayectoria real', () => {
    expect(posicionDe(estado(null, null), 'outA')).toBeNull();
  });

  it('graba relativo al momento en que se pulsó «Grabar», no al cero del encoder', () => {
    const { result, rerender } = renderHook(({ s }) => useRegistroEncoders(s, 'outA', 'outD'), {
      initialProps: { s: estado(1000, 2000) },
    });
    expect(result.current.disponible).toBe(true);
    act(() => result.current.iniciar());
    rerender({ s: estado(1360, 2360) });
    rerender({ s: estado(1720, 2720) });
    expect(result.current.historial).toEqual([
      { izquierda: 0, derecha: 0 },
      { izquierda: 360, derecha: 360 },
      { izquierda: 720, derecha: 720 },
    ]);

    act(() => result.current.detener());
    rerender({ s: estado(5000, 5000) });
    expect(result.current.historial).toHaveLength(3);
  });
});

describe('editor de trayectorias', () => {
  it('agrega comandos con los botones y muestra los grados de cada motor', () => {
    render(<EditorTrayectorias status={null} />);
    expect(screen.getByText(/Sin comandos todavía/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Avanzar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Girar' }));

    const lista = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('Motores'));
    expect(lista).toHaveLength(2);
    // 10 cm con ruedas de 5,6 cm: 10 · 360 / (π · 5,6) ≈ 205°.
    expect(lista[0].textContent).toContain('izq. 205°');
    // Girar 90° antihorario: la izquierda retrocede y la derecha avanza.
    expect(lista[1].textContent).toMatch(/izq\. -\d+° · der\. \d+°/);
    expect(screen.getByText(/2 comandos/)).toBeTruthy();
  });

  it('editar un número cambia el comando y «Borrar ruta» la vacía', () => {
    render(<EditorTrayectorias status={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Avanzar' }));
    fireEvent.change(screen.getByLabelText('Comando 1: centímetros'), { target: { value: '30' } });
    expect(screen.getByText(/izq\. 614°/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Borrar ruta' }));
    expect(screen.getByText(/Sin comandos todavía/)).toBeTruthy();
  });

  it('cambiar el diámetro de la rueda recalcula los grados', () => {
    render(<EditorTrayectorias status={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Avanzar' }));
    fireEvent.change(screen.getByLabelText('Diámetro de la rueda (D)'), { target: { value: '11.2' } });
    // El doble de diámetro, la mitad de grados.
    expect(screen.getByText(/izq\. 102°/)).toBeTruthy();
  });

  it('sin robot conectado no deja grabar y dice por qué', () => {
    render(<EditorTrayectorias status={null} />);
    expect((screen.getByRole('button', { name: 'Grabar trayectoria real' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Conecta el robot');
  });

  it('si el robot no envía los encoders, pide el main.py nuevo', () => {
    render(<EditorTrayectorias status={estado(null, null)} />);
    expect(screen.getByRole('status').textContent).toContain('version_api');
  });

  it('graba la trayectoria real, avisa que lee más seguido y compara con la planeada', () => {
    const onGrabando = vi.fn();
    const { rerender } = render(<EditorTrayectorias status={estado(0, 0)} onGrabandoCambio={onGrabando} />);
    fireEvent.click(screen.getByRole('button', { name: 'Avanzar' })); // planeado: 10 cm hacia adelante

    fireEvent.click(screen.getByRole('button', { name: 'Grabar trayectoria real' }));
    expect(onGrabando).toHaveBeenLastCalledWith(true);
    // El robot avanzó de verdad unos 10 cm (205° en cada rueda).
    rerender(<EditorTrayectorias status={estado(205, 205)} onGrabandoCambio={onGrabando} />);
    fireEvent.click(screen.getByRole('button', { name: 'Detener grabación' }));
    expect(onGrabando).toHaveBeenLastCalledWith(false);

    expect(screen.getByText(/Error final: 0,0 cm/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Borrar grabación' }));
    expect(screen.queryByText(/Error final/)).toBeNull();
  });
});
