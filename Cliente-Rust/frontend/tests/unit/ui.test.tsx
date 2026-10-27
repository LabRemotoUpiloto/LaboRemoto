// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Aviso, Boton, BotonPeligro, Buscador, Campo, Desplegable, Dialogo, Pestanas, Selector } from '../../src/components/ui';

afterEach(cleanup);

const Icono = () => null;

describe('Dialogo', () => {
  it('enfoca el primer campo al abrir y el foco no sale con Tab ni con Shift+Tab', () => {
    render(
      <Dialogo titulo="Nuevo equipo" onCerrar={() => {}} acciones={<><Boton>Cancelar</Boton><Boton>Guardar</Boton></>}>
        <Campo etiqueta="Nombre" />
        <Campo etiqueta="Host" />
      </Dialogo>,
    );
    const nombre = screen.getByLabelText('Nombre');
    expect(document.activeElement).toBe(nombre);
    const guardar = screen.getByRole('button', { name: 'Guardar' });
    guardar.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(guardar);
  });

  it('sin campos, enfoca la primera acción (Cancelar) y nunca la de borrar', () => {
    render(<Dialogo titulo="¿Borrar «PI4»?" onCerrar={() => {}} acciones={<><Boton>Cancelar</Boton><BotonPeligro>Borrar</BotonPeligro></>} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  });

  it('Esc lo cierra y el foco vuelve al botón que lo abrió', () => {
    const onCerrar = vi.fn();
    function Prueba() {
      const [abierto, setAbierto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAbierto(true)}>Abrir</button>
          {abierto && <Dialogo titulo="Hola" onCerrar={() => { onCerrar(); setAbierto(false); }} acciones={<Boton>Cancelar</Boton>} />}
        </>
      );
    }
    render(<Prueba />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    abrir.focus();
    act(() => abrir.click());
    expect(screen.getByRole('dialog', { name: 'Hola' })).toBeTruthy();
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });
});

describe('Dialogo · casos difíciles', () => {
  it('con dos diálogos abiertos, Esc cierra solo el de arriba', () => {
    const cerrarAbajo = vi.fn(), cerrarArriba = vi.fn();
    render(<>
      <Dialogo titulo="Abajo" onCerrar={cerrarAbajo} acciones={<Boton>Cancelar</Boton>} />
      <Dialogo titulo="Arriba" onCerrar={cerrarArriba} acciones={<Boton>Listo</Boton>} />
    </>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cerrarArriba).toHaveBeenCalledTimes(1);
    expect(cerrarAbajo).not.toHaveBeenCalled();
  });

  it('si el foco quedó fuera del diálogo, Tab lo devuelve adentro', () => {
    render(<>
      <button type="button">Atrás</button>
      <Dialogo titulo="Hola" onCerrar={() => {}} acciones={<><Boton>Cancelar</Boton><Boton>Guardar</Boton></>} />
    </>);
    screen.getByRole('button', { name: 'Atrás' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('no se cierra si un menú de adentro ya usó el Esc', () => {
    const onCerrar = vi.fn();
    render(<Dialogo titulo="Hola" onCerrar={onCerrar} acciones={<Boton>Cancelar</Boton>} />);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    ev.preventDefault();
    document.dispatchEvent(ev);
    expect(onCerrar).not.toHaveBeenCalled();
  });
});

describe('Aviso', () => {
  it('el error se anuncia a los lectores de pantalla; el aviso neutro no', () => {
    const { rerender } = render(<Aviso nivel="critico" titulo="No se pudo cargar" />);
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar');
    rerender(<Aviso titulo="Todavía no hay sesiones" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Selector', () => {
  it('marca la opción elegida con aria-pressed', () => {
    const onCambio = vi.fn();
    render(<Selector nombre="Período" valor="30" onCambio={onCambio}
      opciones={[{ valor: '7', etiqueta: '7 días' }, { valor: '30', etiqueta: '30 días' }]} />);
    expect(screen.getByRole('button', { name: '30 días' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    expect(onCambio).toHaveBeenCalledWith('7');
  });
});

describe('Pestanas', () => {
  it('marca la activa con aria-current y avisa el cambio', () => {
    const onCambio = vi.fn();
    render(<Pestanas valor="general" onCambio={onCambio}
      opciones={[{ valor: 'general', etiqueta: 'General' }, { valor: 'dispositivos', etiqueta: 'Dispositivos' }]} />);
    expect(screen.getByRole('button', { name: 'General' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Dispositivos' }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dispositivos' }));
    expect(onCambio).toHaveBeenCalledWith('dispositivos');
  });
});

describe('Buscador', () => {
  it('se puede encontrar por su nombre aunque solo muestre un placeholder', () => {
    const onCambio = vi.fn();
    render(<Buscador icono={Icono} valor="" onCambio={onCambio} placeholder="Buscar por nombre o IP" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por nombre o IP' }), { target: { value: 'pi4' } });
    expect(onCambio).toHaveBeenCalledWith('pi4');
  });
});

describe('Desplegable', () => {
  it('es un select con nombre accesible; avisa el valor elegido y respeta las opciones deshabilitadas', () => {
    const onCambio = vi.fn();
    render(<Desplegable etiqueta="Filtrar por rol" valor="todos" onCambio={onCambio}
      opciones={[{ valor: 'todos', etiqueta: 'Todos los roles' }, { valor: 'docente', etiqueta: 'Docente' }, { valor: 'estudiante', etiqueta: 'Estudiante', deshabilitada: true }]} />);
    const select = screen.getByRole('combobox', { name: 'Filtrar por rol' });
    fireEvent.change(select, { target: { value: 'docente' } });
    expect(onCambio).toHaveBeenCalledWith('docente');
    expect((screen.getByRole('option', { name: 'Estudiante' }) as HTMLOptionElement).disabled).toBe(true);
  });
});
