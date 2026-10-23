import React from 'react';
import { Drawer, Stack, Text, SegmentedControl, Group, Button, Card, Badge, Box, Switch } from '@mantine/core';
import { Settings, Activity, Palette, Download } from 'lucide-react';
import SkeletonColorPicker from './SkeletonColorPicker';

export type HandSkeletonStatus = 'activo' | 'pausado por carga' | 'recuperando' | 'error';

interface CVA_ConfigSidebarProps {
    opened: boolean;
    onClose: () => void;
    onOpen?: () => void;
    onToggleOpened?: (val: boolean) => void;
    showMetrics: boolean;
    onToggleShowMetrics: (val: boolean) => void;
    showSkeleton?: boolean;
    onToggleShowSkeleton?: (val: boolean) => void;
    skeletonColor: string;
    onChangeSkeletonColor: (color: string) => void;
    skeletonStatus?: HandSkeletonStatus;
    sensitivity: string;
    onChangeSensitivity: (val: string) => void;
    onExportDiagnostics?: () => void;
    diagnosticsCount?: number;
}

export const CVA_ConfigSidebar: React.FC<CVA_ConfigSidebarProps> = ({
    opened,
    onClose,
    showMetrics,
    onToggleShowMetrics,
    showSkeleton = true,
    onToggleShowSkeleton,
    skeletonColor,
    onChangeSkeletonColor,
    skeletonStatus = 'activo',
    sensitivity,
    onChangeSensitivity,
    onExportDiagnostics,
    diagnosticsCount = 0,
}) => {
    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="xs">
                    <Settings size={18} style={{ color: 'var(--accent-primary)' }} />
                    <Text fw={600} size="md" style={{ color: 'var(--text-primary)' }}>
                        Configuración de Práctica
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
                {/* 1. SECCIÓN: Rendimiento y Transmisión */}
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
                            Ajusta la tasa de muestreo enviada a la Raspberry Pi y la visualización de métricas en pantalla.
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
                                    { label: '6 FPS (Preciso)', value: 'preciso' },
                                    { label: '7 FPS (Balanceado)', value: 'balanceado' },
                                    { label: '8 FPS (Rápido)', value: 'rapido' },
                                ]}
                                size="xs"
                                radius="md"
                            />
                        </Stack>
                    </Stack>
                </Card>

                {/* 2. SECCIÓN: Esqueleto de mano (MediaPipe) */}
                <Card padding="sm" radius="md" className="dribbble-card">
                    <Stack gap="xs">
                        <Group justify="space-between" align="center">
                            <Group gap="xs">
                                <Palette size={16} style={{ color: 'var(--accent-primary)' }} />
                                <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                    Esqueleto de Mano
                                </Text>
                            </Group>
                            {skeletonStatus === 'pausado por carga' ? (
                                <Badge size="xs" variant="outline" style={{ border: '1px solid var(--accent-warm, #F59E0B)', color: 'var(--accent-warm, #F59E0B)', background: 'transparent' }}>
                                    Pausado por carga
                                </Badge>
                            ) : skeletonStatus === 'recuperando' ? (
                                <Badge size="xs" variant="outline" style={{ border: '1px solid var(--accent-warm, #F59E0B)', color: 'var(--accent-warm, #F59E0B)', background: 'transparent' }}>
                                    Recuperando
                                </Badge>
                            ) : skeletonStatus === 'error' ? (
                                <Badge size="xs" variant="outline" style={{ border: '1px solid var(--danger, #EF4444)', color: 'var(--danger, #EF4444)', background: 'transparent' }}>
                                    Error
                                </Badge>
                            ) : (
                                <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: 'var(--accent-primary)', background: 'transparent' }}>
                                    Activo
                                </Badge>
                            )}
                        </Group>

                        <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                            Trazo sobre los 21 puntos clave de la mano. Puedes activar/desactivar la guía visual o cambiar el color:
                        </Text>

                        {onToggleShowSkeleton && (
                            <Group justify="space-between" align="center" mt="xs">
                                <Text size="xs" fw={500} style={{ color: 'var(--text-primary)' }}>
                                    Mostrar esqueleto en video
                                </Text>
                                <Switch
                                    checked={showSkeleton}
                                    onChange={(e) => onToggleShowSkeleton(e.currentTarget.checked)}
                                    size="xs"
                                />
                            </Group>
                        )}

                        {showSkeleton && (
                            <Box mt="xs">
                                <SkeletonColorPicker color={skeletonColor} onChange={onChangeSkeletonColor} />
                            </Box>
                        )}
                    </Stack>
                </Card>

                {/* 3. SECCIÓN: Diagnóstico de Estabilidad (3 horas) */}
                <Card padding="sm" radius="md" className="dribbble-card">
                    <Stack gap="xs">
                        <Group justify="space-between" align="center">
                            <Group gap="xs">
                                <Activity size={16} style={{ color: 'var(--accent-primary)' }} />
                                <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                    Diagnóstico de Sesión
                                </Text>
                            </Group>
                            <Badge size="xs" variant="outline" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', background: 'transparent' }}>
                                {diagnosticsCount} muestras
                            </Badge>
                        </Group>

                        <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                            Registro continuo en búfer circular (hasta 1.200 muestras, ~3.3 h) de métricas de IPC, tasa de cuadros, tareas largas y memoria JS.
                        </Text>

                        {onExportDiagnostics && (
                            <Button
                                variant="subtle"
                                size="xs"
                                radius="md"
                                leftSection={<Download size={14} />}
                                onClick={onExportDiagnostics}
                                disabled={diagnosticsCount === 0}
                                style={{
                                    border: '1px solid var(--border-subtle)',
                                    color: 'var(--text-primary)',
                                    marginTop: 4,
                                }}
                            >
                                Exportar registro (CSV)
                            </Button>
                        )}
                    </Stack>
                </Card>

                <Button
                    variant="subtle"
                    size="xs"
                    radius="md"
                    onClick={onClose}
                    fullWidth
                    mt="xs"
                    style={{ border: '1px solid var(--border-subtle)' }}
                >
                    Cerrar Configuración
                </Button>
            </Stack>
        </Drawer>
    );
};

export default CVA_ConfigSidebar;
