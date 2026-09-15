import React, { useState, useEffect, useRef } from 'react';
import { Box, Card, Group, Stack, Text, Badge, Button, ScrollArea } from '@mantine/core';
import { Terminal, Trash2, Activity } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface PiInstructionEntry {
    id: string;
    timestamp: string;
    message: string;
    isSimulated?: boolean;
}

interface CVA_PiInstructionLogProps {
    sessionId?: string;
    isPracticeActive?: boolean;
}

const MOCK_SIMULATED_MESSAGES = [
    'gesto: dedo_indice, instruccion: avanzar, confianza: 0.92',
    'gesto: dos_dedos, instruccion: retroceder, confianza: 0.88',
    'gesto: puno_cerrado, instruccion: detener, confianza: 0.95',
    'gesto: palma_abierta, instruccion: encender_luces, confianza: 0.91',
    'gesto: pulgar_arriba, instruccion: velocidad_alta, confianza: 0.86',
];

export const CVA_PiInstructionLog: React.FC<CVA_PiInstructionLogProps> = ({ sessionId, isPracticeActive = true }) => {
    const [logs, setLogs] = useState<PiInstructionEntry[]>([]);
    const [hasReceivedRealEvent, setHasReceivedRealEvent] = useState(false);
    const hasReceivedRealRef = useRef(false);
    const viewportRef = useRef<HTMLDivElement>(null);

    // Auto-scroll al final cuando llega una nueva línea
    useEffect(() => {
        if (viewportRef.current && typeof viewportRef.current.scrollTo === 'function') {
            viewportRef.current.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [logs]);

    // 1. Escuchar eventos reales del backend Rust (cva:pi_instruction)
    useEffect(() => {
        let unlisten: UnlistenFn | null = null;

        const setupListener = async () => {
            try {
                unlisten = await listen<{ session_id: string; message: string }>('cva:pi_instruction', (event) => {
                    if (!sessionId || event.payload.session_id === sessionId) {
                        hasReceivedRealRef.current = true;
                        setHasReceivedRealEvent(true);
                        const newEntry: PiInstructionEntry = {
                            id: Math.random().toString(36).substring(2, 9),
                            timestamp: new Date().toLocaleTimeString(),
                            message: event.payload.message,
                            isSimulated: false,
                        };
                        setLogs((prev) => [...prev.slice(-99), newEntry]);
                    }
                });
            } catch (err) {
                console.warn('No se pudo suscribir al evento cva:pi_instruction:', err);
            }
        };

        setupListener();

        return () => {
            if (unlisten) unlisten();
        };
    }, [sessionId]);

    // 2. Simulación de mensajes de la Pi mientras no exista bridge real (se desactiva inmediatamente al llegar el primer evento real)
    useEffect(() => {
        if (!isPracticeActive || hasReceivedRealEvent || hasReceivedRealRef.current) return;

        // Intervalo aleatorio para emitir mensaje simulado
        const interval = setInterval(() => {
            if (hasReceivedRealRef.current) {
                clearInterval(interval);
                return;
            }
            const randomMsg = MOCK_SIMULATED_MESSAGES[Math.floor(Math.random() * MOCK_SIMULATED_MESSAGES.length)];
            const simEntry: PiInstructionEntry = {
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                message: `[Simulación Pi] ${randomMsg}`,
                isSimulated: true,
            };
            setLogs((prev) => [...prev.slice(-99), simEntry]);
        }, 4000);

        return () => clearInterval(interval);
    }, [isPracticeActive, hasReceivedRealEvent]);

    const handleClear = () => {
        setLogs([]);
    };

    return (
        <Card padding="md" radius="md" className="dribbble-card" style={{ marginTop: '1rem' }}>
            <Stack gap="xs">
                <Group justify="space-between" align="center">
                    <Group gap="xs" align="center">
                        <Terminal size={16} style={{ color: 'var(--accent-primary)' }} />
                        <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                            Log de Instrucciones de la Raspberry Pi
                        </Text>
                    </Group>
                    <Group gap="xs">
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', background: 'transparent' }}>
                            {logs.length} eventos
                        </Badge>
                        {logs.length > 0 && (
                            <Button
                                size="xs"
                                variant="subtle"
                                onClick={handleClear}
                                leftSection={<Trash2 size={12} />}
                                style={{ height: '24px', padding: '0 8px' }}
                            >
                                Limpiar
                            </Button>
                        )}
                    </Group>
                </Group>

                <Box
                    style={{
                        backgroundColor: 'var(--background-tertiary, #0B1220)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '8px 12px',
                        height: '140px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
                        fontSize: '11px',
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                    }}
                >
                    <ScrollArea viewportRef={viewportRef} style={{ height: '100%' }}>
                        {logs.length === 0 ? (
                            <Text size="xs" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                Esperando instrucciones recibidas desde la Raspberry Pi del laboratorio...
                            </Text>
                        ) : (
                            logs.map((log) => (
                                <Box key={log.id} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <span style={{ color: 'var(--text-tertiary, #6B7280)', marginRight: '8px' }}>
                                        [{log.timestamp}]
                                    </span>
                                    <span style={{ color: log.isSimulated ? 'var(--accent-warm, #F59E0B)' : 'var(--accent-primary, #10B981)' }}>
                                        {log.message}
                                    </span>
                                </Box>
                            ))
                        )}
                    </ScrollArea>
                </Box>
            </Stack>
        </Card>
    );
};

export default CVA_PiInstructionLog;
