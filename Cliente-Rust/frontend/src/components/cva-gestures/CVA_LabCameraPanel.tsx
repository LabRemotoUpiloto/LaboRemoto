import React, { useEffect, useMemo } from 'react';
import { Box, Card, Group, Stack, Text, Badge, Button, ThemeIcon } from '@mantine/core';
import { Camera, AlertTriangle, VideoOff, RefreshCw, SearchX, AlertCircle } from 'lucide-react';
import { useNvrCameras } from '../../hooks/useNvrCameras';
import CameraPane from '../raspberry/CameraPane';

export interface CVA_LabCameraPanelProps {
    groupKey?: string | null;
    cameraId?: string | null;
    label?: string;
    isActive?: boolean;
}

export const CVA_LabCameraPanel: React.FC<CVA_LabCameraPanelProps> = ({
    groupKey,
    cameraId,
    label,
    isActive = true,
}) => {
    const isConfigured = Boolean(groupKey && cameraId);
    const { cameras, status, error, start, stop } = useNvrCameras(isConfigured && isActive ? groupKey! : null);

    // Control de sondeo según isActive y configuración (Fail-Safe UI para CPU)
    useEffect(() => {
        if (!isConfigured || !isActive) {
            void stop();
            return;
        }

        void start();
        return () => {
            void stop();
        };
    }, [isConfigured, isActive, start, stop]);

    // Búsqueda de la cámara por ID o Nombre (case-insensitive)
    const targetCamera = useMemo(() => {
        if (!cameraId || cameras.length === 0) return null;
        const normalizedTarget = cameraId.trim().toLowerCase();
        return cameras.find(
            (c) => c.id.toLowerCase() === normalizedTarget || c.name.toLowerCase() === normalizedTarget
        ) || null;
    }, [cameraId, cameras]);

    // Estado derivado para renderizado
    const isOffline = targetCamera?.status === 'offline' || (targetCamera != null && !targetCamera.stream_url);
    const isCameraActive = targetCamera != null && !isOffline && (targetCamera.status === 'active' || Boolean(targetCamera.stream_url));
    const isNotFound = status === 'active' && !targetCamera;
    const isConnecting = status === 'connecting' || (status === 'idle' && isConfigured && isActive);
    const isNvrError = status === 'error' || Boolean(error);

    const handleRetry = () => {
        if (isConfigured && isActive) {
            void start();
        }
    };

    return (
        <Card padding="md" radius="md" className="dribbble-card">
            <Stack gap="sm" style={{ height: '100%' }}>
                {/* Encabezado */}
                <Group justify="space-between" align="center">
                    <Group gap="xs" align="center">
                        <Camera size={16} style={{ color: 'var(--text-secondary)' }} />
                        <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                            {label || 'Cámara del Laboratorio'}
                        </Text>
                    </Group>

                    {/* Badge de Estado Semántico */}
                    {!isConfigured ? (
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', background: 'transparent' }}>
                            No configurada
                        </Badge>
                    ) : isNvrError ? (
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--danger, #EF4444)', color: 'var(--danger, #EF4444)', background: 'transparent' }}>
                            Error NVR
                        </Badge>
                    ) : isNotFound ? (
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--warning, #F59E0B)', color: 'var(--warning, #F59E0B)', background: 'transparent' }}>
                            No encontrada
                        </Badge>
                    ) : isOffline ? (
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--danger, #EF4444)', color: 'var(--danger, #EF4444)', background: 'transparent' }}>
                            Desconectada
                        </Badge>
                    ) : isConnecting ? (
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--warning, #F59E0B)', color: 'var(--warning, #F59E0B)', background: 'transparent' }}>
                            Conectando
                        </Badge>
                    ) : isCameraActive ? (
                        <Badge size="xs" variant="outline" style={{ border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', background: 'transparent' }}>
                            En vivo
                        </Badge>
                    ) : null}
                </Group>

                {/* Contenedor de visualización */}
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
                    }}
                >
                    {/* 1. Estado: No configurada */}
                    {!isConfigured ? (
                        <Stack align="center" gap="xs" p="md" style={{ textAlign: 'center' }}>
                            <ThemeIcon size="xl" radius="xl" variant="subtle" style={{ color: 'var(--text-tertiary)' }}>
                                <AlertCircle size={28} />
                            </ThemeIcon>
                            <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>
                                Cámara no configurada
                            </Text>
                            <Text size="xs" style={{ color: 'var(--text-secondary)', maxWidth: 280 }}>
                                No se ha definido un groupKey o identificador de cámara para este módulo.
                            </Text>
                        </Stack>
                    ) : isNvrError ? (
                        /* 2. Estado: Error del NVR */
                        <Stack align="center" gap="xs" p="md" style={{ textAlign: 'center' }}>
                            <ThemeIcon size="xl" radius="xl" variant="subtle" style={{ color: 'var(--danger, #EF4444)' }}>
                                <AlertTriangle size={28} />
                            </ThemeIcon>
                            <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>
                                Error al consultar el NVR
                            </Text>
                            <Text size="xs" style={{ color: 'var(--text-secondary)', maxWidth: 280 }}>
                                {error || 'No fue posible comunicarse con el servicio de video del laboratorio.'}
                            </Text>
                            <Button
                                size="xs"
                                variant="subtle"
                                onClick={handleRetry}
                                leftSection={<RefreshCw size={14} />}
                                style={{
                                    marginTop: '8px',
                                    border: '1px solid var(--border-subtle)',
                                    color: 'var(--text-primary)',
                                    background: 'transparent',
                                }}
                            >
                                Reintentar
                            </Button>
                        </Stack>
                    ) : isNotFound ? (
                        /* 3. Estado: Cámara no encontrada en el grupo */
                        <Stack align="center" gap="xs" p="md" style={{ textAlign: 'center' }}>
                            <ThemeIcon size="xl" radius="xl" variant="subtle" style={{ color: 'var(--warning, #F59E0B)' }}>
                                <SearchX size={28} />
                            </ThemeIcon>
                            <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>
                                Cámara no encontrada
                            </Text>
                            <Text size="xs" style={{ color: 'var(--text-secondary)', maxWidth: 280 }}>
                                La cámara con identificador «{cameraId}» no existe en el grupo «{groupKey}».
                            </Text>
                        </Stack>
                    ) : isOffline ? (
                        /* 4. Estado: Cámara offline / desconectada */
                        <Stack align="center" gap="xs" p="md" style={{ textAlign: 'center' }}>
                            <ThemeIcon size="xl" radius="xl" variant="subtle" style={{ color: 'var(--danger, #EF4444)' }}>
                                <VideoOff size={28} />
                            </ThemeIcon>
                            <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>
                                Cámara desconectada
                            </Text>
                            <Text size="xs" style={{ color: 'var(--text-secondary)', maxWidth: 280 }}>
                                La cámara «{targetCamera?.name || cameraId}» se encuentra fuera de línea en el laboratorio.
                            </Text>
                        </Stack>
                    ) : isConnecting ? (
                        /* 5. Estado: Conectando */
                        <Stack align="center" gap="xs" p="md" style={{ textAlign: 'center' }}>
                            <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                            <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>
                                Conectando al stream...
                            </Text>
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                Obteniendo transmisión en vivo desde el NVR...
                            </Text>
                        </Stack>
                    ) : isCameraActive && targetCamera ? (
                        /* 6. Estado: Activa (reutiliza CameraPane sin modificarlo) */
                        <Box style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
                            <CameraPane
                                streamUrl={targetCamera.stream_url}
                                label={label || targetCamera.name}
                                camId={targetCamera.id}
                                isActive={isActive}
                                ptzEnabled={targetCamera.ptz}
                            />
                        </Box>
                    ) : null}
                </Box>
            </Stack>
        </Card>
    );
};

export default CVA_LabCameraPanel;
