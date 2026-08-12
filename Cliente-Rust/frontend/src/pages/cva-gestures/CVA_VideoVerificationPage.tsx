import React, { useState } from 'react';
import { Button, Card, Checkbox, Group, Stack, Text, ThemeIcon, Title, Badge, Box } from '@mantine/core';
import { ArrowLeft, ShieldAlert, Video, VideoOff, Check } from 'lucide-react';

interface CVA_VideoVerificationPageProps {
    moduleId: 'robot' | 'domotica';
    onBack: () => void;
    onConfirm: () => void;
}

const CVA_VideoVerificationPage: React.FC<CVA_VideoVerificationPageProps> = ({ moduleId, onBack, onConfirm }) => {
    const [consented, setConsented] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);

    const handleToggleCamera = () => {
        setCameraActive(prev => !prev);
    };

    return (
        <Stack gap="xl">
            <Group justify="space-between" align="center">
                <Button
                    variant="subtle"
                    color="gray"
                    size="sm"
                    radius="md"
                    leftSection={<ArrowLeft size={14} />}
                    onClick={onBack}
                >
                    Volver a opciones
                </Button>
                <Badge color="red" variant="filled" size="sm">
                    Verificación de Cámara
                </Badge>
            </Group>

            <Stack gap={6}>
                <Title order={1} style={{ letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    Autorización y Verificación de Video
                </Title>
                <Text size="sm" c="dimmed" maw={620} style={{ lineHeight: 1.55 }}>
                    Por favor, otorga los permisos necesarios y verifica el encuadre de tu cámara antes de iniciar la práctica controlada por gestos.
                </Text>
            </Stack>

            <Group gap="xl" align="flex-start" mt="md" wrap="wrap">
                {/* 1. Panel de consentimiento e información legal */}
                <Stack gap="lg" style={{ flex: '1 1 350px' }}>
                    <Card padding="lg" radius="md" withBorder style={{ backgroundColor: 'rgba(232, 64, 61, 0.05)', borderColor: 'rgba(232, 64, 61, 0.2)' }}>
                        <Stack gap="xs">
                            <Group gap="xs" align="center">
                                <ShieldAlert size={18} style={{ color: 'var(--unipiloto-red-6, #e8403d)' }} />
                                <Text fw={600} size="sm" style={{ color: 'var(--unipiloto-red-7, #d51f22)' }}>
                                    Consentimiento de Privacidad
                                </Text>
                            </Group>
                            <Text size="xs" style={{ lineHeight: 1.5 }}>
                                Al iniciar la práctica, tu cámara capturará frames que serán transmitidos a través de un túnel SSH seguro hacia la Raspberry Pi 5 del laboratorio remoto. Estos frames se procesarán en la memoria RAM de la Pi utilizando YOLO + OpenCV y no serán almacenados permanentemente en ningún servidor. Puedes revocar este permiso en cualquier momento apagando la cámara en la interfaz.
                              </Text>
                        </Stack>
                    </Card>

                    <Checkbox
                        label="Entiendo y autorizo la transmisión temporal de video para control de gestos"
                        checked={consented}
                        onChange={(e) => setConsented(e.currentTarget.checked)}
                        size="xs"
                        style={{ cursor: 'pointer' }}
                    />

                    <Group gap="md">
                        <Button
                            variant="light"
                            color={cameraActive ? 'red' : 'blue'}
                            onClick={handleToggleCamera}
                            leftSection={cameraActive ? <VideoOff size={14} /> : <Video size={14} />}
                        >
                            {cameraActive ? 'Apagar Cámara (Simulado)' : 'Probar Cámara (Simulado)'}
                        </Button>
                        <Button
                            color="green"
                            disabled={!consented}
                            onClick={onConfirm}
                            leftSection={<Check size={14} />}
                        >
                            Iniciar Práctica
                        </Button>
                    </Group>
                </Stack>

                {/* 2. Visualizador de video (Simulado para Fase 1) */}
                <Box style={{ flex: '1 1 300px', display: 'flex', justifyContent: 'center' }}>
                    <Card
                        padding={0}
                        radius="md"
                        withBorder
                        style={{
                            width: '100%',
                            maxWidth: '400px',
                            aspectRatio: '4/3',
                            position: 'relative',
                            backgroundColor: '#0F172A',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {cameraActive ? (
                            <Stack align="center" gap="xs">
                                <ThemeIcon size="xl" radius="xl" variant="filled" color="green">
                                    <Video size={24} />
                                </ThemeIcon>
                                <Text size="sm" fw={600} style={{ color: '#F8FAFC' }}>
                                    Cámara Activa (Simulado)
                                </Text>
                                <Text size="xs" style={{ color: '#94A3B8' }}>
                                    Fase 1: Simulación de flujo de cámara local
                                </Text>
                            </Stack>
                        ) : (
                            <Stack align="center" gap="xs">
                                <ThemeIcon size="xl" radius="xl" variant="filled" color="gray">
                                    <VideoOff size={24} />
                                </ThemeIcon>
                                <Text size="sm" fw={600} style={{ color: '#94A3B8' }}>
                                    Cámara Inactiva
                                </Text>
                                <Text size="xs" style={{ color: '#64748B' }}>
                                    Haz clic en "Probar Cámara" para simular la vista previa
                                </Text>
                            </Stack>
                        )}

                        {cameraActive && (
                            <Badge
                                color="red"
                                variant="filled"
                                size="xs"
                                style={{ position: 'absolute', top: 12, right: 12 }}
                            >
                                LIVE MOCK
                            </Badge>
                        )}
                    </Card>
                </Box>
            </Group>
        </Stack>
    );
};

export default CVA_VideoVerificationPage;
