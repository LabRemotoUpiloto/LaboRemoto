import React, { useState, useEffect, useRef } from 'react';
import { Button, Card, Checkbox, Group, Stack, Text, ThemeIcon, Title, Badge, Box, Alert, Select, Center } from '@mantine/core';
import { ArrowLeft, ShieldAlert, Video, VideoOff, Check, AlertTriangle, Settings, RefreshCw } from 'lucide-react';
import { UseLocalCameraResult } from '../../hooks/useLocalCamera';
import { useHandSkeleton } from '../../hooks/useHandSkeleton';

interface CVA_VideoVerificationPageProps {
    moduleId: 'robot' | 'domotica';
    sessionId?: string;
    camera: UseLocalCameraResult;
    loading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    connect?: () => void;
    onBack: () => void;
    onConfirm: () => void;
}

const CVA_VideoVerificationPage: React.FC<CVA_VideoVerificationPageProps> = ({
    moduleId,
    sessionId,
    camera,
    loading = false,
    error,
    onRetry,
    connect,
    onBack,
    onConfirm,
}) => {
    const handleRetry = connect || onRetry;
    const [consented, setConsented] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const { processAndDrawFrame } = useHandSkeleton(camera.active);

    // Conectar el stream de la cámara al elemento de video de HTML5 y ejecutar esqueleto decorativo
    useEffect(() => {
        let animationFrameId: number;

        if (videoRef.current) {
            videoRef.current.srcObject = camera.stream;
            if (camera.stream) {
                videoRef.current.play().catch((err) => {
                    console.error('Error al intentar reproducir el stream de video:', err);
                });
            } else {
                videoRef.current.pause();
            }
        }

        const renderSkeletonLoop = () => {
            const video = videoRef.current;
            const canvas = skeletonCanvasRef.current;
            if (video && canvas && !video.paused && !video.ended && video.videoWidth > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    processAndDrawFrame(ctx, video, 0);
                }
            }
            if (camera.active) {
                animationFrameId = requestAnimationFrame(renderSkeletonLoop);
            }
        };

        if (camera.active) {
            renderSkeletonLoop();
        }

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [camera.stream, camera.active, processAndDrawFrame]);

    const handleToggleCamera = async () => {
        if (camera.active) {
            camera.stopCamera();
        } else {
            await camera.startCamera();
        }
    };

    // Renderizar selector de dispositivo (si hay más de una cámara conectada)
    const deviceSelector = camera.devices.length > 1 && (
        <Select
            label="Seleccionar Cámara"
            description="Múltiples entradas de video detectadas:"
            leftSection={<Settings size={14} />}
            data={camera.devices.map((device) => ({
                value: device.deviceId,
                label: device.label || `Cámara (${device.deviceId.slice(0, 6)})`
            }))}
            value={camera.selectedDeviceId}
            onChange={async (value) => {
                camera.setSelectedDeviceId(value);
                // Si la cámara ya está activa, reiniciarla con el nuevo dispositivo
                if (camera.active) {
                    camera.stopCamera();
                    // Breve delay antes de reabrir
                    setTimeout(() => camera.startCamera(), 100);
                }
            }}
            size="xs"
            style={{ width: '100%' }}
        />
    );

    // ── 1. VISTA DE INICIO (CENTRED FLOATING PANEL - CÁMARA INACTIVA) ───────────
    if (!camera.active) {
        return (
            <Stack gap="md" style={{ height: '100%' }}>
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
                    {loading && !error && (
                        <Badge variant="light" color="blue" leftSection={<RefreshCw size={12} className="animate-spin" />}>
                            Conectando SSH con laboratorio...
                        </Badge>
                    )}
                </Group>

                <Center style={{ flex: 1, minHeight: '55vh' }}>
                    <Card
                        padding="xl"
                        radius="md"
                        className="animate-reveal dribbble-card"
                        style={{
                            width: '100%',
                            maxWidth: '520px',
                        }}
                    >
                        <Stack gap="lg">
                            <Stack gap={4} align="center">
                                <Badge variant="subtle" size="sm" mb={4}>
                                    Verificación de Cámara
                                </Badge>
                                <Title order={2} style={{ textAlign: 'center', letterSpacing: '-0.01em' }}>
                                    Autorización de Video
                                </Title>
                                <Text size="xs" c="dimmed" style={{ textAlign: 'center' }}>
                                    Concede los permisos para interactuar con el laboratorio remoto mediante gestos.
                                </Text>
                            </Stack>

                            {error && (
                                <Box
                                    p="md"
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: 'var(--radius-md)',
                                    }}
                                >
                                    <Group gap="xs" align="flex-start">
                                        <AlertTriangle size={16} style={{ color: 'var(--accent-warm, #F59E0B)', marginTop: 2 }} />
                                        <Stack gap="xs" style={{ flex: 1 }}>
                                            <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                                Error de conexión con el laboratorio
                                            </Text>
                                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                                {error}
                                            </Text>
                                            {handleRetry && (
                                                <Button
                                                    size="xs"
                                                    variant="subtle"
                                                    onClick={handleRetry}
                                                    leftSection={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />}
                                                    loading={loading}
                                                    style={{ border: '1px solid var(--border-subtle)', width: 'fit-content' }}
                                                >
                                                    Reintentar conexión
                                                </Button>
                                            )}
                                        </Stack>
                                    </Group>
                                </Box>
                            )}

                            {camera.error && (
                                <Box
                                    p="md"
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: 'var(--radius-md)',
                                    }}
                                >
                                    <Group gap="xs" align="flex-start">
                                        <AlertTriangle size={16} style={{ color: 'var(--accent-warm, #F59E0B)', marginTop: 2 }} />
                                        <Stack gap="xs" style={{ flex: 1 }}>
                                            <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                                Error de Cámara
                                            </Text>
                                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                                {camera.error}
                                            </Text>
                                            <Button size="xs" variant="subtle" onClick={() => camera.startCamera()} style={{ border: '1px solid var(--border-subtle)' }}>
                                                Reintentar conexión
                                            </Button>
                                        </Stack>
                                    </Group>
                                </Box>
                            )}

                            <Card
                                padding="md"
                                radius="md"
                                className="dribbble-card"
                            >
                                <Stack gap="xs">
                                    <Group gap="xs" align="center">
                                        <ShieldAlert size={16} style={{ color: 'var(--accent-primary)' }} />
                                        <Text fw={600} size="xs" style={{ color: 'var(--text-primary)' }}>
                                            Privacidad y Datos de Video
                                        </Text>
                                    </Group>
                                    <Text size="xs" style={{ lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                                        Tu video se transmitirá a través de un túnel SSH encriptado directamente a la Raspberry Pi 5 del laboratorio remoto. Se procesará localmente y de forma temporal en su memoria RAM (YOLO + OpenCV) para traducir tus gestos. **No se almacenará ningún archivo de video en ningún servidor.**
                                    </Text>
                                </Stack>
                            </Card>

                            {deviceSelector}

                            <Checkbox
                                label="Entiendo y autorizo la transmisión temporal de video para control de gestos"
                                checked={consented}
                                onChange={(e) => setConsented(e.currentTarget.checked)}
                                size="xs"
                                style={{ cursor: 'pointer' }}
                            />

                            <Group gap="md" mt="xs">
                                <Button
                                    className="dribbble-btn-primary h-9 text-xs w-full"
                                    onClick={handleToggleCamera}
                                    leftSection={<Video size={16} />}
                                >
                                    Probar Cámara
                                </Button>
                            </Group>
                        </Stack>
                    </Card>
                </Center>
            </Stack>
        );
    }

    // ── 2. VISTA DE VERIFICACIÓN (STREAM ACTIVO - PREVIEW SIDE-BY-SIDE) ────────
    return (
        <Stack gap="xl">
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
                <Group gap="xs">
                    {loading && !error && (
                        <Badge variant="light" color="blue" leftSection={<RefreshCw size={12} className="animate-spin" />}>
                            Conectando SSH con laboratorio...
                        </Badge>
                    )}
                    <Badge variant="outline" size="sm" style={{ border: '1px solid var(--border-subtle)', background: 'transparent' }}>
                        Verificación de Cámara
                    </Badge>
                </Group>
            </Group>

            <Stack gap={6}>
                <Title order={1} style={{ letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    Verifica tu Cámara
                </Title>
                <Text size="sm" c="dimmed" maw={620} style={{ lineHeight: 1.55 }}>
                    Comprueba el encuadre y la iluminación en la vista previa a la derecha antes de iniciar tu práctica.
                </Text>
            </Stack>

            {error && (
                <Box
                    p="md"
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                    }}
                >
                    <Group gap="xs" align="flex-start">
                        <AlertTriangle size={16} style={{ color: 'var(--accent-warm, #F59E0B)', marginTop: 2 }} />
                        <Stack gap="xs" style={{ flex: 1 }}>
                            <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                Error de conexión con el laboratorio
                            </Text>
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                {error}
                            </Text>
                            {handleRetry && (
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    onClick={handleRetry}
                                    leftSection={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />}
                                    loading={loading}
                                    style={{ border: '1px solid var(--border-subtle)', width: 'fit-content' }}
                                >
                                    Reintentar conexión
                                </Button>
                            )}
                        </Stack>
                    </Group>
                </Box>
            )}

            {camera.error && (
                <Box
                    p="md"
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                    }}
                >
                    <Group gap="xs" align="flex-start">
                        <AlertTriangle size={16} style={{ color: 'var(--accent-warm, #F59E0B)', marginTop: 2 }} />
                        <Stack gap="xs" style={{ flex: 1 }}>
                            <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                Error de Cámara
                            </Text>
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                {camera.error}
                            </Text>
                            <Button size="xs" variant="subtle" onClick={() => camera.startCamera()} style={{ border: '1px solid var(--border-subtle)' }}>
                                Reintentar
                            </Button>
                        </Stack>
                    </Group>
                </Box>
            )}

            <Group gap="xl" align="stretch" mt="md" wrap="wrap">
                {/* Panel de consentimiento y selección de dispositivo */}
                <Stack gap="lg" style={{ flex: '1 1 350px', justifyContent: 'space-between' }}>
                    <Stack gap="md">
                        <Card
                            padding="lg"
                            radius="md"
                            className="dribbble-card"
                        >
                            <Stack gap="xs">
                                <Group gap="xs" align="center">
                                    <ShieldAlert size={18} style={{ color: 'var(--accent-primary)' }} />
                                    <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                        Consentimiento Autorizado
                                    </Text>
                                </Group>
                                <Text size="xs" style={{ lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                                    Has aceptado el tratamiento temporal de video. La cámara está encendida. Cuando estés listo, presiona "Iniciar Práctica" para conectarte con el laboratorio remoto.
                                </Text>
                            </Stack>
                        </Card>

                        {deviceSelector}

                        <Checkbox
                            label="Entiendo y autorizo la transmisión temporal de video para control de gestos"
                            checked={consented}
                            onChange={(e) => setConsented(e.currentTarget.checked)}
                            size="xs"
                            style={{ cursor: 'pointer' }}
                        />
                    </Stack>

                    <Group gap="md" mt="xl">
                        <Button
                            variant="subtle"
                            onClick={handleToggleCamera}
                            leftSection={<VideoOff size={14} />}
                        >
                            Apagar Cámara
                        </Button>
                        <Button
                            className="dribbble-btn-primary h-9 text-xs"
                            disabled={!consented || !camera.active}
                            onClick={onConfirm}
                            leftSection={<Check size={14} />}
                            style={{ flex: 1 }}
                        >
                            Iniciar Práctica
                        </Button>
                    </Group>
                </Stack>

                {/* Visualizador de video real */}
                <Box style={{ flex: '1 1 300px', display: 'flex', justifyContent: 'center' }}>
                    <Card
                        padding={0}
                        radius="md"
                        className="dribbble-card"
                        style={{
                            width: '100%',
                            maxWidth: '420px',
                            aspectRatio: '4/3',
                            position: 'relative',
                            backgroundColor: 'var(--background-tertiary, var(--surface-3))',
                            border: '1px solid var(--border-subtle)',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
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
                        <canvas
                            ref={skeletonCanvasRef}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                pointerEvents: 'none',
                                transform: 'scaleX(-1)', // Espejo alineado con el video
                            }}
                        />
                    </Card>
                </Box>
            </Group>
        </Stack>
    );
};

export default CVA_VideoVerificationPage;
