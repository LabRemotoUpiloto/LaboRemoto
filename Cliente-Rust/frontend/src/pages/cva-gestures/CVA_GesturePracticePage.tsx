import React, { useState, useEffect } from 'react';
import { Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Badge, Box, SegmentedControl, Alert } from '@mantine/core';
import { ArrowLeft, AlertTriangle, Eye, Video, Sliders, Zap, RefreshCw } from 'lucide-react';

interface CVA_GesturePracticePageProps {
    moduleId: 'robot' | 'domotica';
    onBack: () => void;
}

const CVA_GesturePracticePage: React.FC<CVA_GesturePracticePageProps> = ({ moduleId, onBack }) => {
    const isDomotica = moduleId === 'domotica';
    const [sensitivity, setSensitivity] = useState('balanceado');
    const [lastGesture, setLastGesture] = useState('Ninguno (Buscando...)');
    const [confidence, setConfidence] = useState(0);
    const [latency, setLatency] = useState(0);
    const [emergencyStopped, setEmergencyStopped] = useState(false);

    // Simular reconocimiento de gestos reactivo para Fase 1 (Mock)
    useEffect(() => {
        if (emergencyStopped) return;

        const gestures = isDomotica 
            ? ['Dedo índice (Encender Luz 1)', 'Dos dedos (Encender Luz 2)', 'Palma abierta (Apagar Todo)', 'Ninguno']
            : ['Dedo índice (Avanzar)', 'Dos dedos (Retroceder)', 'Puño cerrado (Detener)', 'Ninguno'];

        const interval = setInterval(() => {
            const idx = Math.floor(Math.random() * gestures.length);
            const gesture = gestures[idx];
            setLastGesture(gesture);
            
            if (gesture === 'Ninguno') {
                setConfidence(0);
                setLatency(0);
            } else {
                setConfidence(Math.floor(75 + Math.random() * 20)); // 75-95%
                setLatency(Math.floor(100 + Math.random() * 300)); // 100-400ms
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [isDomotica, emergencyStopped]);

    const handleEmergencyStop = () => {
        setEmergencyStopped(true);
        setLastGesture('PARADA DE EMERGENCIA ACTIVA');
        setConfidence(0);
        setLatency(0);
    };

    const handleReset = () => {
        setEmergencyStopped(false);
        setLastGesture('Ninguno (Buscando...)');
    };

    return (
        <Stack gap="lg">
            {/* Top Navigation & Status Bar */}
            <Group justify="space-between" align="center">
                <Button
                    variant="subtle"
                    color="gray"
                    size="sm"
                    radius="md"
                    leftSection={<ArrowLeft size={14} />}
                    onClick={onBack}
                >
                    Detener Práctica (Cerrar Cámara)
                </Button>
                
                <Group gap="sm" align="center">
                    {!emergencyStopped && (
                        <Group gap={6} align="center" className="animate-pulse">
                            <Box 
                                w={10} 
                                h={10} 
                                style={{ borderRadius: '50%', backgroundColor: '#EF4444' }} 
                            />
                            <Text size="xs" fw={700} c="red" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                                Cámara Transmitiendo
                            </Text>
                        </Group>
                    )}
                    <Badge color={emergencyStopped ? 'red' : 'green'} variant="filled" size="sm">
                        {emergencyStopped ? 'Emergencia' : 'Transmisión Activa'}
                    </Badge>
                </Group>
            </Group>

            {emergencyStopped && (
                <Alert color="red" variant="filled" icon={<AlertTriangle size={16} />} title="Parada de Emergencia Activada">
                    <Stack gap="xs">
                        <Text size="sm">
                            Se ha enviado una señal de parada de emergencia al hardware. Todas las operaciones activas se han abortado de inmediato.
                        </Text>
                        <Button 
                            size="xs" 
                            variant="white" 
                            color="red" 
                            onClick={handleReset}
                            leftSection={<RefreshCw size={12} />}
                            style={{ alignSelf: 'flex-start' }}
                        >
                            Reanudar Sistema
                        </Button>
                    </Stack>
                </Alert>
            )}

            {/* Video Feeds Grid */}
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                {/* 1. Feed del Laboratorio (Cámara Remota) */}
                <Card padding="md" radius="md" withBorder>
                    <Stack gap="xs" style={{ height: '100%' }}>
                        <Group justify="space-between" align="center">
                            <Group gap="xs" align="center">
                                <Eye size={16} style={{ color: 'var(--accent-primary)' }} />
                                <Text fw={600} size="sm">Cámara del Laboratorio (Remoto)</Text>
                            </Group>
                            <Badge color="blue" variant="light" size="xs">Live Feed</Badge>
                        </Group>
                        <Box
                            style={{
                                flex: 1,
                                minHeight: '288px',
                                backgroundColor: '#0F172A',
                                borderRadius: 'var(--mantine-radius-md)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                position: 'relative'
                            }}
                        >
                            <Stack align="center" gap="xs">
                                <ThemeIcon size="xl" radius="xl" variant="filled" color="blue">
                                    <Eye size={24} />
                                </ThemeIcon>
                                <Text size="sm" fw={600} style={{ color: '#F8FAFC' }}>
                                    Feed de la Pista (Mock)
                                </Text>
                                <Text size="xs" style={{ color: '#64748B' }}>
                                    Aquí se proyectará el video WebRTC de la cámara física.
                                </Text>
                            </Stack>
                            <Badge 
                                color="gray" 
                                variant="filled" 
                                size="xs" 
                                style={{ position: 'absolute', top: 12, right: 12 }}
                            >
                                Lab Cam
                            </Badge>
                        </Box>
                    </Stack>
                </Card>

                {/* 2. Feed del Usuario (Cámara Local) */}
                <Card padding="md" radius="md" withBorder>
                    <Stack gap="xs" style={{ height: '100%' }}>
                        <Group justify="space-between" align="center">
                            <Group gap="xs" align="center">
                                <Video size={16} style={{ color: 'var(--unipiloto-red-6, #e8403d)' }} />
                                <Text fw={600} size="sm">Tu Cámara (Local)</Text>
                            </Group>
                            <Badge color="red" variant="light" size="xs">Local Stream</Badge>
                        </Group>
                        <Box
                            style={{
                                flex: 1,
                                minHeight: '288px',
                                backgroundColor: '#0F172A',
                                borderRadius: 'var(--mantine-radius-md)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                position: 'relative'
                            }}
                        >
                            {emergencyStopped ? (
                                <Stack align="center" gap="xs">
                                    <ThemeIcon size="xl" radius="xl" variant="filled" color="red">
                                        <AlertTriangle size={24} />
                                    </ThemeIcon>
                                    <Text size="sm" fw={600} style={{ color: '#F8FAFC' }}>
                                        Transmisión Bloqueada
                                    </Text>
                                </Stack>
                            ) : (
                                <Stack align="center" gap="xs">
                                    <ThemeIcon size="xl" radius="xl" variant="filled" color="green">
                                        <Video size={24} />
                                    </ThemeIcon>
                                    <Text size="sm" fw={600} style={{ color: '#F8FAFC' }}>
                                        Video Local en Vivo (Mock)
                                    </Text>
                                    <Text size="xs" style={{ color: '#64748B' }}>
                                        Muestreando frames a la Raspberry Pi 5.
                                    </Text>
                                </Stack>
                            )}
                            <Badge 
                                color="gray" 
                                variant="filled" 
                                size="xs" 
                                style={{ position: 'absolute', top: 12, right: 12 }}
                            >
                                Self-View
                            </Badge>
                        </Box>
                    </Stack>
                </Card>
            </SimpleGrid>

            {/* Diagnostic & Controls Dashboard */}
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
                {/* Panel 1: Estado del Gesto */}
                <Card padding="md" radius="md" withBorder>
                    <Stack gap="xs">
                        <Group gap="xs" align="center">
                            <ActivityIcon size={16} />
                            <Text fw={600} size="sm">Gesto Detectado</Text>
                        </Group>
                        <Stack gap={2} mt="xs">
                            <Text size="xl" fw={700} c={emergencyStopped ? 'red' : 'blue'}>
                                {lastGesture}
                            </Text>
                            <Group gap="md" mt="4">
                                <Text size="xs" c="dimmed">
                                    Confianza: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{confidence}%</span>
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Latencia: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{latency}ms</span>
                                </Text>
                            </Group>
                        </Stack>
                    </Stack>
                </Card>

                {/* Panel 2: Sensibilidad y Frecuencia */}
                <Card padding="md" radius="md" withBorder>
                    <Stack gap="xs">
                        <Group gap="xs" align="center">
                            <Sliders size={16} />
                            <Text fw={600} size="sm">Frecuencia de Muestreo</Text>
                        </Group>
                        <Stack gap="xs" mt="xs">
                            <SegmentedControl
                                value={sensitivity}
                                onChange={setSensitivity}
                                data={[
                                    { label: 'Preciso (4 fps)', value: 'preciso' },
                                    { label: 'Normal (6 fps)', value: 'balanceado' },
                                    { label: 'Rápido (8 fps)', value: 'rapido' },
                                ]}
                                size="xs"
                                disabled={emergencyStopped}
                            />
                            <Text size="xxs" c="dimmed" style={{ lineHeight: 1.3 }}>
                                Frecuencias más altas mejoran la velocidad del robot o actuador pero requieren mayor potencia y ancho de banda en tu red.
                            </Text>
                        </Stack>
                    </Stack>
                </Card>

                {/* Panel 3: Acciones Críticas */}
                <Card padding="md" radius="md" withBorder style={{ borderColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <Stack gap="xs">
                        <Group gap="xs" align="center">
                            <AlertTriangle size={16} style={{ color: '#EF4444' }} />
                            <Text fw={600} size="sm" style={{ color: '#EF4444' }}>Control de Seguridad Físico</Text>
                        </Group>
                        <Text size="xxs" c="dimmed" style={{ lineHeight: 1.3 }}>
                            Usa este botón si detectas un comportamiento anómalo del hardware, colisión inminente, o si deseas abortar la práctica de forma segura e inmediata.
                        </Text>
                    </Stack>
                    <Button
                        color="red"
                        variant="filled"
                        fullWidth
                        size="md"
                        leftSection={<Zap size={18} />}
                        disabled={emergencyStopped}
                        onClick={handleEmergencyStop}
                        style={{ fontWeight: 700, marginTop: '8px' }}
                    >
                        ABORTAR Y DETENER EQUIPOS
                    </Button>
                </Card>
            </SimpleGrid>
        </Stack>
    );
};

// Helper component for lucide-react icon rendering dynamically
const ActivityIcon = ({ size }: { size: number }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="lucide lucide-activity"
    >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
);

export default CVA_GesturePracticePage;
