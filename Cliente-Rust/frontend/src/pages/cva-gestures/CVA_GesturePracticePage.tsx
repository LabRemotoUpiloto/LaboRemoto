import React, { useState, useEffect, useRef } from 'react';
import { Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Badge, Box } from '@mantine/core';
import { ArrowLeft, AlertTriangle, Video, Sliders, RefreshCw, VideoOff } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { UseLocalCameraResult } from '../../hooks/useLocalCamera';
import { CvaFrameStats } from '../../bindings/CvaFrameStats';
import { useHandSkeleton } from '../../hooks/useHandSkeleton';
import CVA_PiInstructionLog from '../../components/cva-gestures/CVA_PiInstructionLog';
import CVA_ConfigSidebar from '../../components/cva-gestures/CVA_ConfigSidebar';
import CVA_LabCameraPanel from '../../components/cva-gestures/CVA_LabCameraPanel';
import { getCvaModuleConfig } from '../../config/cvaModulesConfig';
import { computeLocalVideoBoxStyle } from '../../utils/cvaVideoLayout';

interface CVA_GesturePracticePageProps {
    moduleId: 'robot' | 'domotica';
    camera: UseLocalCameraResult;
    sessionId?: string;
    loading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    connect?: () => void;
    onBack: () => void;
}

const CVA_GesturePracticePage: React.FC<CVA_GesturePracticePageProps> = ({
    moduleId,
    camera,
    sessionId,
    loading = false,
    error,
    onRetry,
    connect,
    onBack,
}) => {
    const handleRetry = connect || onRetry;
    const isDomotica = moduleId === 'domotica';
    const moduleConfig = getCvaModuleConfig(moduleId);
    const labCameraConfig = moduleConfig?.labCamera;
    const showLabCamera = Boolean(labCameraConfig?.enabled);

    // Estados de transmisión y métricas
    const [sensitivity, setSensitivity] = useState('balanceado');
    const [latency, setLatency] = useState(0);
    const [totalFrames, setTotalFrames] = useState(0);
    const [realFps, setRealFps] = useState(0);
    const [lastBytes, setLastBytes] = useState(0);
    const [cpuLoad, setCpuLoad] = useState(0);
    const [sessionError, setSessionError] = useState<string | null>(null);
    const [sessionActive, setSessionActive] = useState(false);
    const [emergencyStopped, setEmergencyStopped] = useState(false);

    // Estados de UI y Configuración Sidebar
    const [sidebarOpened, setSidebarOpened] = useState(false);
    const [showMetrics, setShowMetrics] = useState(false);
    const [showSkeleton, setShowSkeleton] = useState(true);
    // Proporción de aspecto del video local (4/3 por defecto hasta loadedmetadata)
    const [videoAspectRatio, setVideoAspectRatio] = useState<number>(4 / 3);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const handleLoadedMetadata = () => {
        const video = videoRef.current;
        if (video && video.videoWidth > 0 && video.videoHeight > 0) {
            setVideoAspectRatio(video.videoWidth / video.videoHeight);
        }
    };

    // Hook de Esqueleto de Mano Decorativo (MediaPipe)
    const { processAndDrawFrame, skeletonColor, setSkeletonColor } = useHandSkeleton(camera.active && showSkeleton);

    // Loop de renderizado del esqueleto decorativo
    useEffect(() => {
        let animationId: number;

        const renderLoop = () => {
            const video = videoRef.current;
            const canvas = skeletonCanvasRef.current;
            if (showSkeleton && camera.active && video && canvas && !video.paused && !video.ended && video.videoWidth > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    processAndDrawFrame(ctx, video, cpuLoad);
                }
            }
            if (showSkeleton && camera.active) {
                animationId = requestAnimationFrame(renderLoop);
            }
        };

        if (showSkeleton && camera.active) {
            animationId = requestAnimationFrame(renderLoop);
        }

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [camera.active, showSkeleton, cpuLoad, processAndDrawFrame]);

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

    const currentSessionIdRef = useRef<string | undefined>(sessionId);
    useEffect(() => {
        currentSessionIdRef.current = sessionId;
    }, [sessionId]);

    // 1. Mensaje de Estado Pre-sesión: Solo activo mientras !sessionId
    useEffect(() => {
        if (!sessionId) {
            setSessionActive(false);
            if (loading) {
                // Caso 1: !sessionId && loading -> mensaje neutro
                setSessionError('Conectando con el laboratorio...');
            } else if (error) {
                // Caso 2: !sessionId && error -> error real de cvaAutoConnect
                setSessionError(error);
            } else {
                // Caso 3: !sessionId && !loading && !error -> mensaje de último recurso
                setSessionError('Se requiere una sesión SSH activa en el laboratorio para transmitir video analítica.');
            }
        }
    }, [sessionId, loading, error]);

    // 2. Ciclo de Vida de la Sesión CVA: Iniciar cva_gestures_session_start al tener sessionId
    useEffect(() => {
        if (!sessionId) return;

        let isCancelled = false;
        setSessionError(null);

        const startCvaSession = async () => {
            try {
                await invoke('cva_gestures_session_start', {
                    sessionId,
                    moduleId,
                });
                if (!isCancelled && currentSessionIdRef.current === sessionId) {
                    setSessionActive(true);
                    setSessionError(null);
                }
            } catch (err: any) {
                if (!isCancelled) {
                    const errMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
                    // Si la sesión ya estaba activa en backend, se reconoce como éxito y no se muestra error
                    if (errMsg.includes('SESSION_ALREADY_ACTIVE')) {
                        if (currentSessionIdRef.current === sessionId) {
                            setSessionActive(true);
                            setSessionError(null);
                        }
                    } else {
                        setSessionError(`Error al iniciar la sesión CVA: ${errMsg}`);
                        setSessionActive(false);
                    }
                }
            }
        };

        startCvaSession();

        // Limpieza: Detener sesión CVA al desmontar el componente o cambiar de sesión/módulo
        return () => {
            isCancelled = true;
            if (sessionId) {
                invoke('cva_gestures_session_stop', { sessionId }).catch(() => {});
            }
        };
    }, [sessionId, moduleId]);

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
                const encodeStart = performance.now();

                // Muestreo a 320x240 JPEG
                canvas.width = 320;
                canvas.height = 240;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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

    const handleEmergencyStop = async () => {
        setEmergencyStopped(true);
        if (sessionId) {
            try {
                await invoke('cva_gestures_session_stop', { sessionId });
            } catch (e) {}
        }
        setSessionActive(false);
    };

    const handleReset = async () => {
        setEmergencyStopped(false);
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

    // ── TARJETA DE CÁMARA LOCAL (SIMÉTRICA EN GEOMETRÍA CON CVA_LabCameraPanel) ──
    const localCameraCard = (
        <Card padding="md" radius="md" className="dribbble-card" style={{ height: '100%' }}>
            <Stack gap="sm" style={{ height: '100%' }}>
                <Group justify="space-between" align="center">
                    <Group gap="xs" align="center">
                        <Video size={16} style={{ color: 'var(--text-secondary)' }} />
                        <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                            Cámara Local
                        </Text>
                    </Group>
                    {camera.active && sessionActive && !emergencyStopped ? (
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', background: 'transparent' }}>
                            Transmitiendo ({realFps} FPS)
                        </Badge>
                    ) : camera.active ? (
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', background: 'transparent' }}>
                            Cámara lista
                        </Badge>
                    ) : (
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--danger, #EF4444)', color: 'var(--danger, #EF4444)', background: 'transparent' }}>
                            Desconectada
                        </Badge>
                    )}
                </Group>
                <Box
                    style={{
                        flex: 1,
                        minHeight: '380px',
                        backgroundColor: 'var(--background-tertiary, var(--surface-3, #0B1220))',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        position: 'relative',
                        padding: '8px',
                    }}
                >
                    {camera.active ? (
                        <Box
                            data-testid="local-video-aspect-container"
                            style={computeLocalVideoBoxStyle(videoAspectRatio)}
                        >
                            <video
                                ref={videoRef}
                                data-testid="local-video"
                                onLoadedMetadata={handleLoadedMetadata}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    transform: 'scaleX(-1)', // Espejo
                                }}
                                playsInline
                                muted
                            />
                            {showSkeleton && (
                                <canvas
                                    ref={skeletonCanvasRef}
                                    data-testid="skeleton-canvas"
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: '100%',
                                        height: '100%',
                                        pointerEvents: 'none',
                                        transform: 'scaleX(-1)', // Mismo transform espejo que el video
                                    }}
                                />
                            )}
                        </Box>
                    ) : (
                        <Stack align="center" gap="xs">
                            <ThemeIcon size="xl" radius="xl" variant="subtle" style={{ color: 'var(--text-secondary)' }}>
                                <VideoOff size={24} />
                            </ThemeIcon>
                            <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>
                                Cámara Desconectada
                            </Text>
                            <Text size="xs" style={{ color: 'var(--text-secondary)', maxWidth: 260, textAlign: 'center' }}>
                                Conecta o autoriza tu cámara web para iniciar el reconocimiento.
                            </Text>
                        </Stack>
                    )}
                </Box>
            </Stack>
        </Card>
    );

    // ── SECCIÓN UNIFICADA DE PARADA DE EMERGENCIA ──
    const emergencySection = emergencyStopped ? (
        <Card
            padding="md"
            radius="md"
            className="dribbble-card"
            style={{
                border: '1px solid var(--danger, #EF4444)',
                backgroundColor: 'rgba(239, 68, 68, 0.04)',
            }}
        >
            <Group gap="sm" align="flex-start">
                <AlertTriangle size={18} style={{ color: 'var(--danger, #EF4444)', marginTop: 2, flexShrink: 0 }} />
                <Stack gap="xs" style={{ flex: 1 }}>
                    <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                        Parada de Emergencia Activa
                    </Text>
                    <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                        La transmisión de frames hacia la Pi y la emisión de comandos hacia el hardware están detenidas.
                    </Text>
                    <Group mt="xs">
                        <Button
                            size="xs"
                            radius="md"
                            onClick={handleReset}
                            leftSection={<RefreshCw size={14} />}
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            Reanudar Transmisión
                        </Button>
                    </Group>
                </Stack>
            </Group>
        </Card>
    ) : (
        <Group justify="space-between" align="center" px="xs">
            <Text size="xs" c="dimmed">
                La transmisión procesa tus gestos en la Raspberry Pi. En caso de anomalía, activa la parada de emergencia.
            </Text>
            <Button
                size="xs"
                radius="md"
                variant="subtle"
                onClick={handleEmergencyStop}
                leftSection={<AlertTriangle size={14} />}
                style={{
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: 'var(--danger, #EF4444)',
                    background: 'transparent',
                }}
            >
                ABORTAR Y DETENER EQUIPOS
            </Button>
        </Group>
    );

    return (
        <Stack gap="lg">
            {/* Sidebar de Configuración */}
            <CVA_ConfigSidebar
                opened={sidebarOpened}
                onClose={() => setSidebarOpened(false)}
                showMetrics={showMetrics}
                onToggleShowMetrics={setShowMetrics}
                showSkeleton={showSkeleton}
                onToggleShowSkeleton={setShowSkeleton}
                skeletonColor={skeletonColor}
                onChangeSkeletonColor={setSkeletonColor}
                sensitivity={sensitivity}
                onChangeSensitivity={setSensitivity}
            />

            {/* Canvas Oculto para muestreo de frames */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Cabecera estándar de navegación y controles */}
            <Stack gap="xs">
                <Group justify="space-between" align="center">
                    <Button
                        variant="subtle"
                        size="sm"
                        radius="md"
                        leftSection={<ArrowLeft size={16} />}
                        onClick={handleLeave}
                    >
                        Volver a opciones
                    </Button>

                    <Group gap="xs" align="center">
                        <Button
                            variant="subtle"
                            size="xs"
                            radius="md"
                            leftSection={<Sliders size={14} />}
                            onClick={() => setSidebarOpened(true)}
                        >
                            Configuración
                        </Button>
                    </Group>
                </Group>

                <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
                    <Stack gap={4}>
                        <Title order={2} style={{ letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                            Práctica de Gestos — {moduleConfig?.name || (isDomotica ? 'Domótica' : 'Robot EV3')}
                        </Title>
                        <Text size="sm" c="dimmed" style={{ lineHeight: 1.55 }}>
                            {showLabCamera
                                ? 'Supervisa la cámara del laboratorio en tiempo real mientras interactúas mediante gestos capturados por tu cámara local.'
                                : 'Controla el módulo domótico ejecutando gestos reconocidos frente a tu cámara web.'}
                        </Text>
                    </Stack>
                </Group>
            </Stack>

            {/* BARRA SUPERIOR COMPACTA DE MÉTRICAS */}
            {showMetrics && (
                <Card padding="xs" radius="md" className="dribbble-card" style={{ backgroundColor: 'var(--background-secondary)' }}>
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Group gap="md">
                            <Box>
                                <Text size="xs" style={{ color: 'var(--text-secondary)' }}>Latencia IPC</Text>
                                <Text fw={700} size="sm" style={{ color: 'var(--text-primary)' }}>{latency} ms</Text>
                            </Box>
                            <Box>
                                <Text size="xs" style={{ color: 'var(--text-secondary)' }}>FPS Real</Text>
                                <Text fw={700} size="sm" style={{ color: 'var(--text-primary)' }}>{realFps} FPS</Text>
                            </Box>
                            <Box>
                                <Text size="xs" style={{ color: 'var(--text-secondary)' }}>Frames</Text>
                                <Text fw={700} size="sm" style={{ color: 'var(--text-primary)' }}>{totalFrames}</Text>
                            </Box>
                            <Box>
                                <Text size="xs" style={{ color: 'var(--text-secondary)' }}>CPU Cliente</Text>
                                <Text fw={700} size="sm" style={{ color: 'var(--text-primary)' }}>{cpuLoad}%</Text>
                            </Box>
                            <Box>
                                <Text size="xs" style={{ color: 'var(--text-secondary)' }}>Frame Size</Text>
                                <Text fw={700} size="sm" style={{ color: 'var(--text-primary)' }}>
                                    {lastBytes > 0 ? (lastBytes / 1024).toFixed(1) : 0} KB
                                </Text>
                            </Box>
                        </Group>
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: emergencyStopped ? 'var(--danger, #EF4444)' : sessionActive ? 'var(--accent-primary)' : 'var(--text-secondary)', background: 'transparent' }}>
                            {emergencyStopped ? 'Detenido' : sessionActive ? 'Túnel Activo' : 'Inactivo'}
                        </Badge>
                    </Group>
                </Card>
            )}

            {/* Alerta de Error de Sesión o Conexión SSH */}
            {sessionError && (
                <Box
                    p="md"
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                    }}
                >
                    <Group gap="xs" align="flex-start">
                        {!sessionId && loading ? (
                            <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--accent-primary, #3B82F6)', marginTop: 2 }} />
                        ) : (
                            <AlertTriangle size={16} style={{ color: 'var(--accent-warm, #F59E0B)', marginTop: 2 }} />
                        )}
                        <Stack gap={2} style={{ flex: 1 }}>
                            <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                {!sessionId && loading ? 'Conexión con el Laboratorio' : 'Estado de la Sesión CVA'}
                            </Text>
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                {sessionError}
                            </Text>
                            {!sessionId && error && handleRetry && (
                                <Group mt="xs">
                                    <Button
                                        size="xs"
                                        variant="subtle"
                                        leftSection={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />}
                                        loading={loading}
                                        onClick={handleRetry}
                                        style={{ border: '1px solid var(--border-subtle)', width: 'fit-content' }}
                                    >
                                        Reintentar conexión
                                    </Button>
                                </Group>
                            )}
                        </Stack>
                    </Group>
                </Box>
            )}

            {/* Grilla Simétrica de Cámaras y Controles */}
            {showLabCamera ? (
                <Stack gap="lg">
                    {/* Grilla simétrica de 2 columnas para cámaras */}
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" style={{ alignItems: 'stretch' }}>
                        {/* 1. Feed del Laboratorio (Cámara Remota) */}
                        <CVA_LabCameraPanel
                            groupKey={labCameraConfig?.groupKey}
                            cameraId={labCameraConfig?.cameraId}
                            label={labCameraConfig?.label}
                        />

                        {/* 2. Feed del Usuario (Cámara Local) */}
                        {localCameraCard}
                    </SimpleGrid>

                    {/* Parada de Emergencia unificada */}
                    {emergencySection}

                    {/* Log de Instrucciones de la Pi en tiempo real (Ancho completo) */}
                    <CVA_PiInstructionLog sessionId={sessionId} isPracticeActive={sessionActive && !emergencyStopped} />
                </Stack>
            ) : (
                <Box maw={760} mx="auto" w="100%">
                    <Stack gap="lg">
                        {localCameraCard}
                        {emergencySection}
                        <CVA_PiInstructionLog sessionId={sessionId} isPracticeActive={sessionActive && !emergencyStopped} />
                    </Stack>
                </Box>
            )}

            {/* Botón para terminar la práctica */}
            <Group justify="center" mt="md" pb="md">
                <Button
                    variant="subtle"
                    size="sm"
                    radius="md"
                    leftSection={<ArrowLeft size={16} />}
                    onClick={handleLeave}
                    style={{ border: '1px solid var(--border-subtle)' }}
                >
                    Terminar la práctica
                </Button>
            </Group>
        </Stack>
    );
};

export default CVA_GesturePracticePage;
