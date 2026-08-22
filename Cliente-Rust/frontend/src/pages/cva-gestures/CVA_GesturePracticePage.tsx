import React, { useState, useEffect, useRef } from 'react';
import { Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Badge, Box, SegmentedControl, Alert } from '@mantine/core';
import { ArrowLeft, AlertTriangle, Eye, Video, Sliders, RefreshCw, VideoOff, Activity } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { UseLocalCameraResult } from '../../hooks/useLocalCamera';
import { CvaFrameStats } from '../../bindings/CvaFrameStats';

interface CVA_GesturePracticePageProps {
    moduleId: 'robot' | 'domotica';
    camera: UseLocalCameraResult;
    sessionId?: string;
    onBack: () => void;
}

const CVA_GesturePracticePage: React.FC<CVA_GesturePracticePageProps> = ({ moduleId, camera, sessionId, onBack }) => {
    const isDomotica = moduleId === 'domotica';
    const [sensitivity, setSensitivity] = useState('balanceado');
    const [lastGesture, setLastGesture] = useState('Ninguno (Buscando...)');
    const [confidence, setConfidence] = useState(0);
    const [latency, setLatency] = useState(0);
    const [totalFrames, setTotalFrames] = useState(0);
    const [realFps, setRealFps] = useState(0);
    const [lastBytes, setLastBytes] = useState(0);
    const [cpuLoad, setCpuLoad] = useState(0);
    const [sessionError, setSessionError] = useState<string | null>(null);
    const [sessionActive, setSessionActive] = useState(false);
    const [emergencyStopped, setEmergencyStopped] = useState(false);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // 1. Ciclo de Vida de la Sesión CVA: Iniciar cva_gestures_session_start al entrar
    useEffect(() => {
        if (!sessionId) {
            setSessionError('Se requiere una sesión SSH activa en el laboratorio para transmitir video analítica.');
            return;
        }

        let isMounted = true;
        setSessionError(null);

        const startCvaSession = async () => {
            try {
                await invoke('cva_gestures_session_start', {
                    sessionId,
                    moduleId,
                });
                if (isMounted) {
                    setSessionActive(true);
                }
            } catch (err: any) {
                if (isMounted) {
                    const errMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
                    setSessionError(`Error al iniciar la sesión CVA: ${errMsg}`);
                    setSessionActive(false);
                }
            }
        };

        startCvaSession();

        // Limpieza: Detener sesión CVA al desmontar el componente
        return () => {
            isMounted = false;
            if (sessionId) {
                invoke('cva_gestures_session_stop', { sessionId }).catch(() => {});
            }
        };
    }, [sessionId, moduleId]);

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

    // 2. Loop de muestreo y transmisión de frames por la conexión TCP persistente del túnel
    useEffect(() => {
        if (!camera.active || emergencyStopped || !sessionActive || sessionError || !sessionId) return;

        // Rango de sensibilidad dentro de 6-8 FPS (especificación CVA)
        const fpsMap: Record<string, number> = {
            preciso: 6,
            balanceado: 7,
            rapido: 8,
        };
        const targetFps = fpsMap[sensitivity] || 7;
        const intervalMs = Math.round(1000 / targetFps);

        const interval = setInterval(async () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas || video.paused || video.ended) return;

            if (video.videoWidth > 0 && video.videoHeight > 0) {
                const cycleStart = performance.now();

                // Muestreo a 320x240 JPEG
                canvas.width = 320;
                canvas.height = 240;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const encodeStart = performance.now();
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                    const encodeDuration = performance.now() - encodeStart;

                    const base64Data = dataUrl.split(',')[1];
                    if (base64Data) {
                        const ipcStart = performance.now();
                        try {
                            const stats = await invoke<CvaFrameStats>('cva_gestures_send_frame', {
                                sessionId,
                                frameBase64: base64Data,
                            });
                            const ipcDuration = performance.now() - ipcStart;
                            const totalProcessingTime = encodeDuration + ipcDuration;

                            // Cálculo de la métrica de Carga CPU / Tiempo de procesamiento del cliente
                            const estimatedCpuPercent = Math.min(100, Math.round((totalProcessingTime / intervalMs) * 100));

                            setLatency(Math.round(ipcDuration));
                            setTotalFrames(stats.total_frames);
                            setRealFps(Math.round(stats.fps_real * 10) / 10);
                            setLastBytes(stats.bytes_sent);
                            setCpuLoad(estimatedCpuPercent);
                            setSessionError(null);
                        } catch (err: any) {
                            const errMsg = typeof err === 'string' ? err : err?.message || 'Error de transmisión de frame';
                            setSessionError(`Falla en envío de frame: ${errMsg}`);
                        }
                    }
                }
            }
        }, intervalMs);

        return () => clearInterval(interval);
    }, [camera.active, emergencyStopped, sensitivity, sessionId, sessionActive, sessionError]);

    // Simular reconocimiento de gestos para la vista previa
    useEffect(() => {
        if (emergencyStopped || !sessionActive) return;

        const gestures = isDomotica 
            ? ['Dedo índice (Encender Luz 1)', 'Dos dedos (Encender Luz 2)', 'Palma abierta (Apagar Todo)', 'Ninguno']
            : ['Dedo índice (Avanzar)', 'Dos dedos (Retroceder)', 'Puño cerrado (Detener)', 'Ninguno'];

        const interval = setInterval(() => {
            const idx = Math.floor(Math.random() * gestures.length);
            const gesture = gestures[idx];
            setLastGesture(gesture);
            
            if (gesture === 'Ninguno') {
                setConfidence(0);
            } else {
                setConfidence(Math.floor(75 + Math.random() * 20));
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [isDomotica, emergencyStopped, sessionActive]);

    const handleEmergencyStop = async () => {
        setEmergencyStopped(true);
        setLastGesture('PARADA DE EMERGENCIA ACTIVA');
        setConfidence(0);
        if (sessionId) {
            try {
                await invoke('cva_gestures_session_stop', { sessionId });
            } catch (e) {}
        }
        setSessionActive(false);
    };

    const handleReset = async () => {
        setEmergencyStopped(false);
        setLastGesture('Ninguno (Buscando...)');
        if (sessionId) {
            try {
                await invoke('cva_gestures_session_start', { sessionId, moduleId });
                setSessionActive(true);
                setSessionError(null);
            } catch (err: any) {
                setSessionError(`Error al reanudar la sesión CVA: ${err?.message || err}`);
            }
        }
    };

    const handleLeave = async () => {
        if (sessionId && sessionActive) {
            try {
                await invoke('cva_gestures_session_stop', { sessionId });
            } catch (e) {}
        }
        onBack();
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
                    onClick={handleLeave}
                >
                    Volver a opciones
                </Button>

                {/* Control de Sensibilidad / FPS (Rango 6-8 FPS) */}
                <Group gap="xs" align="center">
                    <Sliders size={14} style={{ color: 'var(--text-secondary)' }} />
                    <Text size="xs" fw={500} style={{ color: 'var(--text-secondary)' }}>
                        Sensibilidad de Muestreo:
                    </Text>
                    <SegmentedControl
                        size="xs"
                        radius="md"
                        value={sensitivity}
                        onChange={setSensitivity}
                        data={[
                            { label: 'Preciso (6 FPS)', value: 'preciso' },
                            { label: 'Balanceado (7 FPS)', value: 'balanceado' },
                            { label: 'Rápido (8 FPS)', value: 'rapido' },
                        ]}
                    />
                </Group>
            </Group>

            {/* Canvas Oculto para muestreo de frames */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Alerta de Error de Sesión o Conexión SSH */}
            {sessionError && (
                <Alert icon={<AlertTriangle size={16} />} title="Estado de la Sesión CVA" color="red" radius="md">
                    <Text size="xs">{sessionError}</Text>
                </Alert>
            )}

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
                            {camera.active && sessionActive && !emergencyStopped && (
                                <Badge size="xs" variant="dot" color="green">
                                    Transmitiendo frames ({realFps} FPS)
                                </Badge>
                            )}
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

            {/* Panel de Métricas de Transmisión (Fase 4) */}
            <Card padding="md" radius="md" className="dribbble-card">
                <Stack gap="sm">
                    <Group justify="space-between" align="center">
                        <Group gap="xs" align="center">
                            <Activity size={16} style={{ color: 'var(--text-secondary)' }} />
                            <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                Métricas de Rendimiento y Consumo (IPC / Túnel SSH)
                            </Text>
                        </Group>
                        <Badge variant="subtle" color={emergencyStopped ? 'red' : sessionActive ? 'blue' : 'gray'}>
                            {emergencyStopped ? 'Transmisión Detenida' : sessionActive ? 'Túnel Persistente Activo' : 'Sesión Inactiva'}
                        </Badge>
                    </Group>

                    <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
                        <Box p="xs" style={{ backgroundColor: 'var(--surface-3)', borderRadius: 'var(--radius-md)' }}>
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>Latencia IPC</Text>
                            <Text fw={700} size="lg" style={{ color: 'var(--text-primary)' }}>{latency} ms</Text>
                        </Box>
                        <Box p="xs" style={{ backgroundColor: 'var(--surface-3)', borderRadius: 'var(--radius-md)' }}>
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>FPS Real / Entregado</Text>
                            <Text fw={700} size="lg" style={{ color: 'var(--text-primary)' }}>{realFps} FPS</Text>
                        </Box>
                        <Box p="xs" style={{ backgroundColor: 'var(--surface-3)', borderRadius: 'var(--radius-md)' }}>
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>Frames Enviados</Text>
                            <Text fw={700} size="lg" style={{ color: 'var(--text-primary)' }}>{totalFrames}</Text>
                        </Box>
                        <Box p="xs" style={{ backgroundColor: 'var(--surface-3)', borderRadius: 'var(--radius-md)' }}>
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>Carga CPU Cliente</Text>
                            <Text fw={700} size="lg" style={{ color: 'var(--text-primary)' }}>{cpuLoad}%</Text>
                        </Box>
                        <Box p="xs" style={{ backgroundColor: 'var(--surface-3)', borderRadius: 'var(--radius-md)' }}>
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>Tamaño del Frame</Text>
                            <Text fw={700} size="lg" style={{ color: 'var(--text-primary)' }}>
                                {lastBytes > 0 ? (lastBytes / 1024).toFixed(1) : 0} KB
                            </Text>
                        </Box>
                    </SimpleGrid>

                    {emergencyStopped ? (
                        <Alert icon={<AlertTriangle size={16} />} title="Parada de Emergencia Activa" color="red" radius="md">
                            La transmisión de frames hacia la Pi y la emisión de comandos hacia el hardware están detenidas.
                            <Group mt="xs">
                                <Button size="xs" color="red" variant="filled" onClick={handleReset} leftSection={<RefreshCw size={14} />}>
                                    Reanudar Transmisión
                                </Button>
                            </Group>
                        </Alert>
                    ) : (
                        <Group justify="flex-end" mt="xs">
                            <Button size="xs" color="red" variant="subtle" onClick={handleEmergencyStop} leftSection={<AlertTriangle size={14} />}>
                                ABORTAR Y DETENER EQUIPOS
                            </Button>
                        </Group>
                    )}
                </Stack>
            </Card>

            {/* Botón único para terminar la práctica */}
            <Group justify="center" mt="md">
                <Button
                    className="dribbble-btn-primary h-11 px-8 text-sm"
                    size="md"
                    radius="md"
                    leftSection={<ArrowLeft size={18} />}
                    onClick={handleLeave}
                >
                    Terminar la práctica
                </Button>
            </Group>
        </Stack>
    );
};

export default CVA_GesturePracticePage;

