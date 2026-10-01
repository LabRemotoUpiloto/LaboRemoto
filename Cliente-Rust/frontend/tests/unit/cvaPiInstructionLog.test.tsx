// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import CVA_PiInstructionLog from '../../src/components/cva-gestures/CVA_PiInstructionLog';

// Mock de Tauri Event Listeners
let registeredCallback: ((e: any) => void) | null = null;
const mockListen = vi.fn().mockImplementation((event: string, callback: (e: any) => void) => {
    if (event === 'cva:pi_instruction') {
        registeredCallback = callback;
    }
    return Promise.resolve(() => {});
});

vi.mock('@tauri-apps/api/event', () => ({
    listen: (event: string, cb: any) => mockListen(event, cb),
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

describe('CVA_PiInstructionLog', () => {
    beforeEach(() => {
        registeredCallback = null;
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        cleanup();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('renderiza el título del log de instrucciones de la Pi', () => {
        render(
            <MantineProvider>
                <CVA_PiInstructionLog sessionId="test-session-log" isPracticeActive={true} />
            </MantineProvider>
        );

        expect(screen.getByText('Log de Instrucciones de la Raspberry Pi')).toBeDefined();
    });

    it('muestra el texto de espera y nunca genera mensajes simulados cuando no hay eventos reales', async () => {
        render(
            <MantineProvider>
                <CVA_PiInstructionLog sessionId="test-session-log" isPracticeActive={true} />
            </MantineProvider>
        );

        // Avanzar el tiempo para confirmar que nunca se emiten mensajes simulados
        await act(async () => {
            vi.advanceTimersByTime(10000);
        });

        // Solo debe estar visible el texto de espera
        expect(screen.getByText('Esperando instrucciones recibidas desde la Raspberry Pi del laboratorio...')).toBeDefined();
        // Jamás debe aparecer ningún mensaje con prefijo [Simulación Pi]
        expect(screen.queryByText(/\[Simulación Pi\]/)).toBeNull();
        expect(screen.getByText('0 eventos')).toBeDefined();
    });

    it('muestra los mensajes reales cuando se recibe un evento cva:pi_instruction', async () => {
        render(
            <MantineProvider>
                <CVA_PiInstructionLog sessionId="test-session-log" isPracticeActive={true} />
            </MantineProvider>
        );

        // Esperar la resolución del setupListener async
        await act(async () => {
            await Promise.resolve();
        });

        expect(registeredCallback).not.toBeNull();

        // Disparar evento real simulando payload de la Pi en Rust
        await act(async () => {
            if (registeredCallback) {
                registeredCallback({
                    payload: {
                        session_id: 'test-session-log',
                        message: 'gesto: uno_real, instruccion: encender_led_real, confianza: 0.99',
                    },
                });
            }
        });

        // Confirmar que el mensaje real está en pantalla
        expect(screen.getByText(/gesto: uno_real, instruccion: encender_led_real, confianza: 0.99/)).toBeDefined();
        expect(screen.getByText('1 eventos')).toBeDefined();
        expect(screen.queryByText('Esperando instrucciones recibidas desde la Raspberry Pi del laboratorio...')).toBeNull();
    });

    it('limpia los logs cuando se presiona el botón Limpiar', async () => {
        render(
            <MantineProvider>
                <CVA_PiInstructionLog sessionId="test-session-log" isPracticeActive={true} />
            </MantineProvider>
        );

        await act(async () => {
            await Promise.resolve();
        });

        // Disparar evento real
        await act(async () => {
            if (registeredCallback) {
                registeredCallback({
                    payload: {
                        session_id: 'test-session-log',
                        message: 'gesto: puño, instruccion: detener',
                    },
                });
            }
        });

        expect(screen.getByText(/gesto: puño, instruccion: detener/)).toBeDefined();
        expect(screen.getByText('1 eventos')).toBeDefined();

        const clearBtn = screen.getByRole('button', { name: /Limpiar/i });
        fireEvent.click(clearBtn);

        expect(screen.getByText('Esperando instrucciones recibidas desde la Raspberry Pi del laboratorio...')).toBeDefined();
        expect(screen.getByText('0 eventos')).toBeDefined();
    });
});
