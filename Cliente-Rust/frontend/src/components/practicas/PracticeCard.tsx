import React from 'react';
import { ActionIcon, Button, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
import { Camera, MessageSquare, ArrowRight } from 'lucide-react';

interface PracticeCardProps {
    id: string;
    name: string;
    description: string;
    difficulty: string;
    hasCamera: boolean;
    hasChat: boolean;
    onStart: () => void;
    loading?: boolean;
}

const difficultyConfig: Record<string, { label: string; dot: string; className: string }> = {
    beginner: { label: 'Principiante', dot: 'var(--success, #10B981)', className: 'beginner' },
    intermediate: { label: 'Intermedio', dot: 'var(--warning, #F59E0B)', className: 'intermediate' },
    advanced: { label: 'Avanzado', dot: 'var(--danger, #EF4444)', className: 'advanced' },
};

const PracticeCard: React.FC<PracticeCardProps> = ({ name, description, difficulty, hasCamera, hasChat, onStart, loading = false }) => {
    const diff = difficultyConfig[difficulty] || difficultyConfig.beginner;

    return (
        <Card
            padding="lg"
            className="animate-reveal dribbble-card dribbble-card-interactive group flex flex-col justify-between"
            style={{ minHeight: '100%' }}
        >
            <Stack gap="md" h="100%" style={{ flex: 1, justifyContent: 'space-between' }}>
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Group gap={8} align="center">
                        <div 
                            className={`dribbble-difficulty-dot ${diff.className}`}
                            style={{ flexShrink: 0 }} 
                        />
                        <Text size="xs" style={{ color: 'var(--text-secondary)', letterSpacing: '0.06em', fontSize: 10.5 }} tt="uppercase" fw={600}>
                            {diff.label}
                        </Text>
                    </Group>
                    <Group gap={4}>
                        {hasCamera && (
                            <Tooltip label="Cámara del laboratorio" withArrow position="top">
                                <ActionIcon variant="subtle" style={{ color: 'var(--text-secondary)' }} size="sm" radius="md" aria-label="Cámara del laboratorio">
                                    <Camera size={14} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        {hasChat && (
                            <Tooltip label="Chat con asistente IA" withArrow position="top">
                                <ActionIcon variant="subtle" style={{ color: 'var(--text-secondary)' }} size="sm" radius="md" aria-label="Chat con asistente IA">
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
                    <Text size="sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }} lineClamp={3}>
                        {description}
                    </Text>
                </div>

                <Button
                    loading={loading}
                    onClick={onStart}
                    className="dribbble-btn-primary h-9 text-xs w-full"
                    rightSection={
                        <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-200" />
                    }
                    mt="auto"
                >
                    {loading ? 'Preparando...' : 'Iniciar Práctica'}
                </Button>
            </Stack>
        </Card>
    );
};

export default PracticeCard;
