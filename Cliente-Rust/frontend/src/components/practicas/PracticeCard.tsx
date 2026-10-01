import React from 'react';
import { ActionIcon, Button, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { Camera, MessageSquare, ArrowRight } from 'lucide-react';

interface PracticeCardProps {
    id: string;
    name: string;
    description: string;
    hasCamera: boolean;
    hasChat: boolean;
    onStart: () => void;
    loading?: boolean;
    /** Insignia ya resuelta para esta práctica puntual (ver
     * badges/insigniaRegistry.tsx) -- `null` si todavía no se ganó o la
     * práctica no tiene una propia. PracticeCard no sabe nada de insignias
     * concretas, solo la pinta como hermana de la card (nunca como hija:
     * Mantine le pone `overflow: hidden` a Card por defecto, y cualquier
     * insignia que sobresalga de la esquina quedaría recortada). */
    badge?: React.ReactNode | null;
}

const PracticeCard: React.FC<PracticeCardProps> = ({ name, description, hasCamera, hasChat, onStart, loading = false, badge = null }) => {
    // El backend compone la descripción como "Módulo X · ~Y min" (ver
    // practicas.rs) -- el nivel de dificultad no se muestra más (no aportaba
    // nada); en su lugar, arriba va el módulo y abajo queda solo el tiempo.
    const [moduleLabel, ...rest] = description.split(' · ');
    const timeLabel = rest.join(' · ');

    return (
        <div className="relative h-full">
            {badge}
            <Card
                padding="lg"
                className="animate-reveal dribbble-card flex flex-col justify-between"
                style={{ minHeight: '100%' }}
            >
                <Stack gap="md" h="100%" style={{ flex: 1, justifyContent: 'space-between' }}>
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Text size="xs" style={{ color: 'var(--text-secondary)', letterSpacing: '0.06em', fontSize: 10.5 }} tt="uppercase" fw={600}>
                        {moduleLabel}
                    </Text>
                    <Group gap={4}>
                        {hasCamera && (
                            <Tooltip label="Cámara del laboratorio" withArrow position="top">
                                <ActionIcon variant="subtle" style={{ color: 'var(--text-secondary)' }} size="sm" radius="md" aria-label="Cámara del laboratorio">
                                    <Camera size={14} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        {hasChat && (
                            <Tooltip label="Chat del asistente" withArrow position="top">
                                <ActionIcon variant="subtle" style={{ color: 'var(--text-secondary)' }} size="sm" radius="md" aria-label="Chat del asistente">
                                    <MessageSquare size={14} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                </Group>

                <div style={{ flex: 1, marginTop: 4 }}>
                    <Text fw={600} size="md" mb={6} lineClamp={2} style={{ lineHeight: 1.35, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                        {name}
                    </Text>
                    {timeLabel && (
                        <Text size="sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                            {timeLabel}
                        </Text>
                    )}
                </div>

                <Button
                    loading={loading}
                    onClick={onStart}
                    className="dribbble-btn-primary h-9 text-xs w-full group"
                    rightSection={
                        <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-200" />
                    }
                    mt="auto"
                >
                    {loading ? 'Preparando...' : 'Iniciar Práctica'}
                </Button>
                </Stack>
            </Card>
        </div>
    );
};

export default PracticeCard;
