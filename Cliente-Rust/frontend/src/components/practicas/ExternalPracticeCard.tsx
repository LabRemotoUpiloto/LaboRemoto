import React from 'react';
import { Badge, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { BookOpen, Clock, ShieldAlert, TerminalSquare } from 'lucide-react';
import type { ExternalLabPractice } from '../../services/labPractices.service';

interface ExternalPracticeCardProps {
    practice: ExternalLabPractice;
}

/**
 * Práctica del catálogo externo. Solo lectura: no tiene botón de "Iniciar"
 * porque no existe (todavía) un binding local a un entorno de laboratorio
 * real (host/credenciales) — mostrar contenido importado nunca debe sugerir
 * que ya se puede ejecutar. Ver cmd::integration::lab_practices para la
 * razón de diseño (contenido no confiable vs. conexión local).
 */
const ExternalPracticeCard: React.FC<ExternalPracticeCardProps> = ({ practice }) => {
    const needsConnection = practice.execution_requirements.connection_type !== 'none';

    return (
        <Card padding="lg" className="animate-reveal dribbble-card flex flex-col justify-between" style={{ minHeight: '100%' }}>
            <Stack gap="md" h="100%" style={{ flex: 1, justifyContent: 'space-between' }}>
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Badge variant="light" color="gray" size="sm" radius="sm" tt="none">
                        {practice.area} · {practice.level}
                    </Badge>
                    <Tooltip label="Contenido importado, sin entorno de laboratorio vinculado todavía" withArrow position="top">
                        <Badge variant="outline" color="orange" size="sm" radius="sm" tt="none" leftSection={<ShieldAlert size={11} />}>
                            Importada
                        </Badge>
                    </Tooltip>
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
            </Stack>
        </Card>
    );
};

export default ExternalPracticeCard;
