import React from 'react';
import { Drawer, Stack, Text, SegmentedControl, Group, Button, Card, Badge, Box, Select, Slider, Switch, UnstyledButton, Tooltip } from '@mantine/core';
import { Settings, Activity, Palette, Camera, Cpu, Volume2 } from 'lucide-react';
import SkeletonColorPicker from './SkeletonColorPicker';

interface CVA_ConfigSidebarProps {
    opened: boolean;
    onClose: () => void;
    onOpen?: () => void;
    onToggleOpened: (val: boolean) => void;
    showMetrics: boolean;
    onToggleShowMetrics: (val: boolean) => void;
    showSkeleton?: boolean;
    onToggleShowSkeleton?: (val: boolean) => void;
    skeletonColor: string;
    onChangeSkeletonColor: (color: string) => void;
    sensitivity: string;
    onChangeSensitivity: (val: string) => void;
}

export const CVA_ConfigSidebar: React.FC<CVA_ConfigSidebarProps> = ({
    opened,
    onClose,
    onOpen,
    onToggleOpened,
    showMetrics,
    onToggleShowMetrics,
    showSkeleton,
    onToggleShowSkeleton,
    skeletonColor,
    onChangeSkeletonColor,
    sensitivity,
    onChangeSensitivity,
}) => {
    return (
        <>
            {/* Botón / Tira colapsada en el borde derecho que se expande al pasar el mouse o dar clic */}
            <Tooltip label="Configuración" position="left" withArrow disabled={opened}>
                <UnstyledButton
                    onClick={() => onToggleOpened(!opened)}
                    onMouseEnter={() => {
                        if (onOpen) onOpen();
                    }}
                    style={{
                        position: 'fixed',
                        right: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        zIndex: 99,
                        backgroundColor: 'var(--background-secondary, #0F172A)',
                        border: '1px solid var(--border-subtle)',
                        borderRight: 'none',
                        borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                        padding: '12px 10px',
                        boxShadow: 'var(--shadow-card)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.25s ease',
                    }}
                    aria-label="Abrir panel de configuración"
                >
                    <Settings
                        size={22}
                        style={{
                            color: 'var(--accent-primary)',
                            transform: opened ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.3s ease',
                        }}
                    />
                </UnstyledButton>
            </Tooltip>

            {/* Sidebar / Drawer deslizante desde la derecha */}
            <Drawer
                opened={opened}
                onClose={onClose}
                title={
                    <Group gap="xs">
                        <Settings size={18} style={{ color: 'var(--accent-primary)' }} />
                        <Text fw={600} size="md" style={{ color: 'var(--text-primary)' }}>
                            Configuración
                        </Text>
                    </Group>
                }
                position="right"
                size="md"
                padding="md"
                styles={{
                    content: {
                        backgroundColor: 'var(--background-secondary, #0F172A)',
                        color: 'var(--text-primary)',
                        borderLeft: '1px solid var(--border-subtle)',
                    },
                    header: {
                        backgroundColor: 'var(--background-secondary, #0F172A)',
                        borderBottom: '1px solid var(--border-subtle)',
                    },
                }}
            >
                <Stack gap="md" mt="xs">
                    {/* 1. SECCIÓN ACTIVA: Rendimiento y Transmisión */}
                    <Card padding="sm" radius="md" className="dribbble-card">
                        <Stack gap="xs">
                            <Group justify="space-between" align="center">
                                <Group gap="xs">
                                    <Activity size={16} style={{ color: 'var(--accent-primary)' }} />
                                    <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                        Rendimiento & Transmisión
                                    </Text>
                                </Group>
                                <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: 'var(--accent-primary)', background: 'transparent' }}>
                                    Activo
                                </Badge>
                            </Group>

                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                Ajusta la tasa de muestreo IPC y la visualización de métricas en pantalla.
                            </Text>

                            <Group justify="space-between" align="center" mt="xs">
                                <Text size="xs" fw={500} style={{ color: 'var(--text-primary)' }}>
                                    Barra superior de métricas
                                </Text>
                                <Switch
                                    checked={showMetrics}
                                    onChange={(e) => onToggleShowMetrics(e.currentTarget.checked)}
                                    size="xs"
                                />
                            </Group>

                            <Stack gap={4} mt="xs">
                                <Text fw={600} size="xs" style={{ color: 'var(--text-primary)' }}>
                                    Tasa de Muestreo (Sensibilidad)
                                </Text>
                                <SegmentedControl
                                    value={sensitivity}
                                    onChange={onChangeSensitivity}
                                    data={[
                                        { label: '6 FPS', value: 'preciso' },
                                        { label: '7 FPS', value: 'balanceado' },
                                        { label: '8 FPS', value: 'rapido' },
                                    ]}
                                    size="xs"
                                    radius="md"
                                />
                            </Stack>
                        </Stack>
                    </Card>

                    {/* 2. SECCIÓN ACTIVA: Esqueleto de mano */}
                    <Card padding="sm" radius="md" className="dribbble-card">
                        <Stack gap="xs">
                            <Group justify="space-between" align="center">
                                <Group gap="xs">
                                    <Palette size={16} style={{ color: 'var(--accent-primary)' }} />
                                    <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                        Esqueleto de mano
                                    </Text>
                                </Group>
                                <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: 'var(--accent-primary)', background: 'transparent' }}>
                                    Activo
                                </Badge>
                            </Group>

                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                Trazo permanente de los 21 landmarks de la mano sobre el video. Selecciona un color brillante:
                            </Text>

                            <Box mt="xs">
                                <SkeletonColorPicker color={skeletonColor} onChange={onChangeSkeletonColor} />
                            </Box>
                        </Stack>
                    </Card>

                    {/* 3. SECCIÓN FUTURA: Configuración de Cámara & Dispositivo (Fase 6+) */}
                    <Card padding="sm" radius="md" className="dribbble-card" style={{ opacity: 0.85 }}>
                        <Stack gap="xs">
                            <Group justify="space-between" align="center">
                                <Group gap="xs">
                                    <Camera size={16} style={{ color: 'var(--text-secondary)' }} />
                                    <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                        Cámara & Dispositivo
                                    </Text>
                                </Group>
                                <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: 'var(--accent-warm, #F59E0B)', background: 'transparent' }}>
                                    Fase 6+
                                </Badge>
                            </Group>

                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                Opciones para selección de webcam física, resolución de muestreo y rotación.
                            </Text>

                            <Stack gap="xs" mt="xs">
                                <Select
                                    label="Dispositivo de entrada"
                                    size="xs"
                                    placeholder="Cámara predeterminada del sistema"
                                    data={['Cámara Web Integrada (640x480)', 'Cámara USB Externa (HD)']}
                                    disabled
                                />
                                <Group justify="space-between" align="center">
                                    <Text size="xs" style={{ color: 'var(--text-muted)' }}>
                                        Modo espejo (espejar horizontalmente)
                                    </Text>
                                    <Switch checked disabled size="xs" />
                                </Group>
                            </Stack>
                        </Stack>
                    </Card>

                    {/* 4. SECCIÓN FUTURA: Modelo YOLO & Umbrales de Confianza (Fase 8+) */}
                    <Card padding="sm" radius="md" className="dribbble-card" style={{ opacity: 0.85 }}>
                        <Stack gap="xs">
                            <Group justify="space-between" align="center">
                                <Group gap="xs">
                                    <Cpu size={16} style={{ color: 'var(--text-secondary)' }} />
                                    <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                        Visión YOLO & Umbrales
                                    </Text>
                                </Group>
                                <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: 'var(--accent-warm, #F59E0B)', background: 'transparent' }}>
                                    Fase 8+
                                </Badge>
                            </Group>

                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                Ajustes del detector de gestos YOLOv8/v11 que correrá en la Raspberry Pi 5.
                            </Text>

                            <Stack gap="xs" mt="xs">
                                <Box>
                                    <Group justify="space-between" align="center" mb={4}>
                                        <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                            Umbral de Confianza Mínima
                                        </Text>
                                        <Text size="xs" fw={600} style={{ color: 'var(--text-primary)' }}>
                                            75%
                                        </Text>
                                    </Group>
                                    <Slider
                                        value={75}
                                        min={50}
                                        max={95}
                                        step={5}
                                        disabled
                                        size="xs"
                                    />
                                </Box>
                                <Group justify="space-between" align="center">
                                    <Text size="xs" style={{ color: 'var(--text-muted)' }}>
                                        Filtro de suavizado de gestos (Debounce)
                                    </Text>
                                    <Switch checked disabled size="xs" />
                                </Group>
                            </Stack>
                        </Stack>
                    </Card>

                    {/* 5. SECCIÓN FUTURA: Feedback Háptico & Sonoro (Fase 9+) */}
                    <Card padding="sm" radius="md" className="dribbble-card" style={{ opacity: 0.85 }}>
                        <Stack gap="xs">
                            <Group justify="space-between" align="center">
                                <Group gap="xs">
                                    <Volume2 size={16} style={{ color: 'var(--text-secondary)' }} />
                                    <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                        Feedback & Notificaciones
                                    </Text>
                                </Group>
                                <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: 'var(--accent-warm, #F59E0B)', background: 'transparent' }}>
                                    Fase 9+
                                </Badge>
                            </Group>

                            <Group justify="space-between" align="center" mt="xs">
                                <Text size="xs" style={{ color: 'var(--text-muted)' }}>
                                    Señal sonora al ejecutar gesto exitoso
                                </Text>
                                <Switch disabled size="xs" />
                            </Group>
                            <Group justify="space-between" align="center">
                                <Text size="xs" style={{ color: 'var(--text-muted)' }}>
                                    Notificaciones emergentes (Toasts)
                                </Text>
                                <Switch checked disabled size="xs" />
                            </Group>
                        </Stack>
                    </Card>

                    <Button
                        className="dribbble-btn-secondary"
                        size="xs"
                        radius="md"
                        onClick={onClose}
                        fullWidth
                        mt="xs"
                    >
                        Cerrar Configuración
                    </Button>
                </Stack>
            </Drawer>
        </>
    );
};

export default CVA_ConfigSidebar;
