// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import CVA_LabCameraPanel from '../../src/components/cva-gestures/CVA_LabCameraPanel';

// Mock de invoke de Tauri
const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
    if (cmd === 'nvr_disconnect') {
        return Promise.resolve();
    }
    return Promise.resolve([]);
});

vi.mock('@tauri-apps/api/core', () => ({
    invoke: (cmd: string, args: any) => mockInvoke(cmd, args),
}));

// Polyfills para JSDOM
if (typeof window !== 'undefined') {
    window.matchMedia = window.matchMedia || function (query: string) {
        return {
            matches: false,
            media: query,
            onchange: null,
            addListener: function () {},
            removeListener: function () {},
            addEventListener: function () {},
            removeEventListener: function () {},
            dispatchEvent: function () { return true; },
        } as unknown as MediaQueryList;
    };
    if (!HTMLElement.prototype.scrollTo) {
        HTMLElement.prototype.scrollTo = function () {};
    }
    if (typeof window.ResizeObserver === 'undefined') {
        window.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
}

describe('CVA_LabCameraPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'nvr_disconnect') {
                return Promise.resolve();
            }
            return Promise.resolve([]);
        });
    });

    afterEach(() => {
        cleanup();
    });

    it('1. Estado: No configurada — cuando falta groupKey o cameraId', () => {
        render(
            <MantineProvider>
                <CVA_LabCameraPanel groupKey={null} cameraId={null} />
            </MantineProvider>
        );

        expect(screen.getByText('Cámara no configurada')).toBeDefined();
        expect(screen.getByText(/No se ha definido un groupKey o identificador/i)).toBeDefined();
        expect(screen.getByText('No configurada')).toBeDefined();
        expect(mockInvoke).not.toHaveBeenCalledWith('nvr_list_cameras', expect.anything());
    });

    it('2. Estado: Conectando — mientras se consulta el NVR', () => {
        // Promesa no resuelta para simular petición en curso
        mockInvoke.mockReturnValue(new Promise(() => {}));

        render(
            <MantineProvider>
                <CVA_LabCameraPanel groupKey="pilabpiloto" cameraId="01" isActive={true} />
            </MantineProvider>
        );

        expect(screen.getByText('Conectando al stream...')).toBeDefined();
        expect(screen.getByText('Conectando')).toBeDefined();
    });

    it('3. Estado: Error del NVR — muestra mensaje de error y botón Reintentar funcional', async () => {
        mockInvoke.mockRejectedValueOnce('Error de conexión con el broker NVR');

        render(
            <MantineProvider>
                <CVA_LabCameraPanel groupKey="pilabpiloto" cameraId="01" isActive={true} />
            </MantineProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('Error al consultar el NVR')).toBeDefined();
            expect(screen.getByText(/Error de conexión con el broker NVR/i)).toBeDefined();
            expect(screen.getByText('Error NVR')).toBeDefined();
        });

        // Simular que el reintento responderá con éxito
        mockInvoke.mockResolvedValueOnce([
            { id: '01', name: 'Cámara 01 Robot', status: 'active', stream_url: 'http://test/stream.m3u8', ptz: false },
        ]);

        const retryBtn = screen.getByRole('button', { name: /Reintentar/i });
        fireEvent.click(retryBtn);

        await waitFor(() => {
            expect(screen.getByText('En vivo')).toBeDefined();
        });
    });

    it('4. Estado: Cámara no encontrada — cuando el grupo responde pero la cámara no está en la lista', async () => {
        mockInvoke.mockResolvedValue([
            { id: '02', name: 'Cámara Domótica', status: 'active', stream_url: 'http://test/02.m3u8', ptz: false },
            { id: '03', name: 'Cámara Panorámica', status: 'active', stream_url: 'http://test/03.m3u8', ptz: false },
        ]);

        render(
            <MantineProvider>
                <CVA_LabCameraPanel groupKey="pilabpiloto" cameraId="01" isActive={true} />
            </MantineProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('Cámara no encontrada')).toBeDefined();
            expect(screen.getByText(/La cámara con identificador «01» no existe en el grupo «pilabpiloto»/i)).toBeDefined();
            expect(screen.getByText('No encontrada')).toBeDefined();
        });
    });

    it('5. Estado: Cámara offline — cuando la cámara existe pero su status es offline', async () => {
        mockInvoke.mockResolvedValue([
            { id: '01', name: 'Cámara Robot EV3', status: 'offline', stream_url: '', ptz: false },
        ]);

        render(
            <MantineProvider>
                <CVA_LabCameraPanel groupKey="pilabpiloto" cameraId="01" isActive={true} />
            </MantineProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('Cámara desconectada')).toBeDefined();
            expect(screen.getByText(/La cámara «Cámara Robot EV3» se encuentra fuera de línea/i)).toBeDefined();
            expect(screen.getByText('Desconectada')).toBeDefined();
        });
    });

    it('6. Estado: Activa — renderiza CameraPane y badge En vivo al recibir stream válido', async () => {
        mockInvoke.mockResolvedValue([
            { id: '01', name: 'Cámara Robot EV3', status: 'active', stream_url: 'http://52.14.162.232/nvr/01/index.m3u8', ptz: true },
        ]);

        render(
            <MantineProvider>
                <CVA_LabCameraPanel groupKey="pilabpiloto" cameraId="01" label="Cámara del Robot" isActive={true} />
            </MantineProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('En vivo')).toBeDefined();
            expect(screen.getByText('Cámara del Robot')).toBeDefined();
        });
    });

    it('7. Fail-safe UI: no consulta el NVR si isActive es false', () => {
        render(
            <MantineProvider>
                <CVA_LabCameraPanel groupKey="pilabpiloto" cameraId="01" isActive={false} />
            </MantineProvider>
        );

        expect(mockInvoke).not.toHaveBeenCalledWith('nvr_list_cameras', expect.anything());
    });
});
