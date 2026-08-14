import React, { useState, useEffect, useRef } from 'react';
import { Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Badge, Box, SegmentedControl, Alert } from '@mantine/core';
import { ArrowLeft, AlertTriangle, Eye, Video, Sliders, Zap, RefreshCw, VideoOff } from 'lucide-react';
import { UseLocalCameraResult } from '../../hooks/useLocalCamera';

interface CVA_GesturePracticePageProps {
    moduleId: 'robot' | 'domotica';
    camera: UseLocalCameraResult;
    onBack: () => void;
}

const CVA_GesturePracticePage: React.FC<CVA_GesturePracticePageProps> = ({ moduleId, camera, onBack }) => {
    const isDomotica = moduleId === 'domotica';
    const [sensitivity, setSensitivity] = useState('balanceado');
    const [lastGesture, setLastGesture] = useState('Ninguno (Buscando...)');
    const [confidence, setConfidence] = useState(0);
    const [latency, setLatency] = useState(0);
    const [emergencyStopped, setEmergencyStopped] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    // Conectar stream a elemento de video en el DOM
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = camera.stream;
            if (camera.stream && !emergencyStopped) {
                videoRef.current.play().catch((err) => {
                    console.error('Error al intentar reproducir local stream en práctica:', err);
                });
            } else {
                videoRef.current.pause();
            }
        }
    }, [camera.stream, emergencyStopped]);

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
            {/* Top Navigation Bar */}
            <Group justify="space-between" align="center">
                <Button
                    variant="subtle"
                    size="sm"
                    radius="md"
                    leftSection={<ArrowLeft size={14} />}
                    onClick={onBack}
                >
                    Volver a opciones
                </Button>
            </Group>

            {/* Video Feeds Grid */}
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                {/* 1. Feed del Laboratorio (Cámara Remota) */}
                <Card padding="md" radius="md" className="dribbble-card">
                    <Stack gap="sm" style={{ height: '100%' }}>
                        <Group justify="space-between" align="center">
                            <Group gap="xs" align="center">
                                <Eye size={16} style={{ color: 'var(--text-secondary)' }} />
                                <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                    Cámara del Laboratorio
                                </Text>
                            </Group>
                        </Group>
                        <Box
                            style={{
                                flex: 1,
                                minHeight: '320px',
                                backgroundColor: 'var(--surface-3, #1A202E)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                position: 'relative'
                            }}
                        >
                            <Stack align="center" gap="xs">
                                <ThemeIcon size="xl" radius="xl" variant="subtle" style={{ color: 'var(--text-secondary)' }}>
                                    <Eye size={24} />
                                </ThemeIcon>
                                <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>
                                    Vista Remota del Laboratorio
                                </Text>
                                <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                    Conectando al canal WebRTC del equipo físico...
                                </Text>
                            </Stack>
                        </Box>
                    </Stack>
                </Card>

                {/* 2. Feed del Usuario (Cámara Local) */}
                <Card padding="md" radius="md" className="dribbble-card">
                    <Stack gap="sm" style={{ height: '100%' }}>
                        <Group justify="space-between" align="center">
                            <Group gap="xs" align="center">
                                <Video size={16} style={{ color: 'var(--text-secondary)' }} />
                                <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                    Cámara Local
                                </Text>
                            </Group>
                        </Group>
                        <Box
                            style={{
                                flex: 1,
                                minHeight: '320px',
                                backgroundColor: 'var(--surface-3, #1A202E)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                position: 'relative'
                            }}
                        >
                            {camera.active ? (
                                <video
                                    ref={videoRef}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        transform: 'scaleX(-1)', // Espejo
                                    }}
                                    playsInline
                                    muted
                                />
                            ) : (
                                <Stack align="center" gap="xs">
                                    <ThemeIcon size="xl" radius="xl" variant="subtle" style={{ color: 'var(--text-secondary)' }}>
                                        <VideoOff size={24} />
                                    </ThemeIcon>
                                    <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>
                                        Cámara Desconectada
                                    </Text>
                                </Stack>
                            )}
                        </Box>
                    </Stack>
                </Card>
            </SimpleGrid>

            {/* Botón único para terminar la práctica */}
            <Group justify="center" mt="md">
                <Button
                    className="dribbble-btn-primary h-11 px-8 text-sm"
                    size="md"
                    radius="md"
                    leftSection={<ArrowLeft size={18} />}
                    onClick={onBack}
                >
                    Terminar la práctica
                </Button>
            </Group>
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
