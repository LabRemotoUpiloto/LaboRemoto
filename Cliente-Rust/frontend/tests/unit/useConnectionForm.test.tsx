// @vitest-environment jsdom
// Diálogo de conexión (Conexiones): lo que se rellena al abrirlo no se puede perder, o «Conectar» no se activa nunca.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConnectionForm } from '@/features/conexion/useConnectionForm';

const PI = { id: 'pi4', name: 'Raspberry Pi 4', host: 'pi.ejemplo.local', port: 9000 };
const RECIENTE = { id: 'r1', host: 'servidor.ejemplo.local', port: 2222, user: 'UPILOTO\\ana', lastConnected: 1 };

describe('useConnectionForm al abrir el diálogo', () => {
  it('la Pi conserva su dirección: con usuario y contraseña ya se puede conectar', () => {
    const { result } = renderHook(() => useConnectionForm({ quickHost: PI, recentConnection: null, initialPayload: null }));
    expect([result.current.host, result.current.port]).toEqual(['pi.ejemplo.local', '9000']);
    expect(result.current.isValid).toBeFalsy();
    act(() => { result.current.setUser('UPILOTO\\ana'); result.current.setPassword('clave'); });
    expect(result.current.isValid).toBeTruthy();
  });

  it('una conexión reciente conserva equipo, puerto y usuario: solo falta la contraseña', () => {
    const { result } = renderHook(() => useConnectionForm({ quickHost: null, recentConnection: RECIENTE, initialPayload: null }));
    expect([result.current.host, result.current.port, result.current.user]).toEqual(['servidor.ejemplo.local', '2222', 'UPILOTO\\ana']);
    act(() => { result.current.setPassword('clave'); });
    expect(result.current.isValid).toBeTruthy();
  });

  it('editar un equipo guardado trae sus datos y queda en modo edición', () => {
    const payload = { host: 'otro.ejemplo.local', port: 22, user: 'root', password: 'x', name: 'Otro', _originalFile: 'a.json.enc' };
    const { result } = renderHook(() => useConnectionForm({ quickHost: null, recentConnection: null, initialPayload: payload }));
    expect([result.current.host, result.current.user, result.current.isEditMode, result.current.hostName]).toEqual(['otro.ejemplo.local', 'root', true, 'Otro']);
    expect(result.current.isValid).toBeTruthy();
  });

  it('una conexión nueva arranca vacía, con el puerto 22', () => {
    const { result } = renderHook(() => useConnectionForm({ quickHost: null, recentConnection: null, initialPayload: null }));
    expect([result.current.host, result.current.port, result.current.user, result.current.isEditMode]).toEqual(['', '22', '', false]);
  });
});
