import React from 'react';
import { Badge, Button, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { BookOpen, Clock, Play, ShieldAlert, TerminalSquare } from 'lucide-react';
import type { RunnableLabPractice } from '../../services/labPractices.service';

interface ExternalPracticeCardProps {
    practice: RunnableLabPractice;
    onStart?: () => void;
    loading?: boolean;
}

/**
 * Práctica del catálogo (`cmd::integration::lab_practices`, contenido no
 * confiable: nunca trae host/credenciales). El botón "Iniciar" solo aparece
 * si `practice.runnable` — o sea, si existe un `LabConnectionProfile` local
 * para este id (ver cmd::practices::lab_connection). Sin binding local, la
 * práctica se ve pero es de solo lectura, igual que antes.
 */
const ExternalPracticeCard: React.FC<ExternalPracticeCardProps> = ({ practice, onStart, loading }) => {
    const needsConnection = practice.execution_requirements.connection_type !== 'none';

    return (
        <Card padding="lg" className="animate-reveal dribbble-card flex flex-col justify-between" style={{ minHeight: '100%' }}>
            <Stack gap="md" h="100%" style={{ flex: 1, justifyContent: 'space-between' }}>
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Badge variant="light" color="gray" size="sm" radius="sm" tt="none">
                        {practice.area} · {practice.level}
                    </Badge>
                    {practice.runnable ? (
                        <Badge variant="light" color="green" size="sm" radius="sm" tt="none">
                            Disponible aquí
                        </Badge>
                    ) : (
                        <Tooltip label="Contenido importado, sin entorno de laboratorio vinculado en este equipo" withArrow position="top">
                            <Badge variant="outline" color="orange" size="sm" radius="sm" tt="none" leftSection={<ShieldAlert size={11} />}>
                                Importada
                            </Badge>
                        </Tooltip>
                    )}
                </Group>

                <div style={{ flex: 1 }}>
                    <Text fw={600} size="md" mb={6} lineClamp={2} style={{ lineHeight: 1.35, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                        {practice.title}
                    </Text>
                    <Text size="sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }} lineClamp={3}>
                        {practice.description}
                    </Text>
                </div>

                <Group gap="lg">
                    <Group gap={6}>
                        <Clock size={13} style={{ color: 'var(--text-secondary)' }} />
                        <Text size="xs" c="dimmed">{practice.estimated_duration_minutes} min</Text>
                    </Group>
                    <Group gap={6}>
                        <BookOpen size={13} style={{ color: 'var(--text-secondary)' }} />
                        <Text size="xs" c="dimmed">{practice.objectives.length} objetivo{practice.objectives.length !== 1 ? 's' : ''}</Text>
                    </Group>
                    {needsConnection && (
                        <Tooltip label={`Requiere: ${practice.execution_requirements.capabilities.join(', ') || practice.execution_requirements.connection_type}`} withArrow position="top">
                            <Group gap={6}>
                                <TerminalSquare size={13} style={{ color: 'var(--text-secondary)' }} />
                                <Text size="xs" c="dimmed">{practice.execution_requirements.connection_type}</Text>
                            </Group>
                        </Tooltip>
                    )}
                </Group>

                <Text size="xs" c="dimmed" style={{ opacity: 0.7 }}>
                    Publicado por {practice.author.name} · {practice.source.application}
                </Text>

                {practice.runnable && (
                    <Button
                        size="sm"
                        radius="md"
                        leftSection={<Play size={14} />}
                        onClick={onStart}
                        loading={loading}
                        fullWidth
                    >
                        Iniciar práctica
                    </Button>
                )}
            </Stack>
        </Card>
    );
};

export default ExternalPracticeCard;
