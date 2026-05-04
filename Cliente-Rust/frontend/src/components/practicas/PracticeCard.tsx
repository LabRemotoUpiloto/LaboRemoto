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

const difficultyConfig: Record<string, { label: string; dot: string }> = {
    beginner: { label: 'Principiante', dot: 'var(--mantine-color-green-5)' },
    intermediate: { label: 'Intermedio', dot: 'var(--mantine-color-yellow-5)' },
    advanced: { label: 'Avanzado', dot: 'var(--mantine-color-red-5)' },
};

const PracticeCard: React.FC<PracticeCardProps> = ({ name, description, difficulty, hasCamera, hasChat, onStart, loading = false }) => {
    const diff = difficultyConfig[difficulty] || difficultyConfig.beginner;

    return (
        <Card
            withBorder
            radius="lg"
            padding="lg"
            h="100%"
            className="group animate-reveal"
            sx={(theme) => ({
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--mantine-color-body)',
                borderColor: 'var(--mantine-color-default-border)',
                transition: 'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
                '&:hover': {
                    borderColor: theme.colors.blue[6],
                    boxShadow: `0 0 0 1px ${theme.colors.blue[6]}40, 0 8px 24px -12px rgba(0,0,0,0.35)`,
                    transform: 'translateY(-2px)',
                },
            })}
        >
            <Stack gap="md" h="100%">
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Group gap={8} align="center">
                        <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: diff.dot,
                            boxShadow: `0 0 0 3px ${diff.dot}25`,
                            flexShrink: 0,
                        }} />
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.06em', fontSize: 10.5 }}>
                            {diff.label}
                        </Text>
                    </Group>
                    <Group gap={4}>
                        {hasCamera && (
                            <Tooltip label="Cámara del laboratorio" withArrow position="top">
                                <ActionIcon variant="subtle" color="gray" size="sm" radius="md" aria-label="Cámara del laboratorio">
                                    <Camera size={14} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        {hasChat && (
                            <Tooltip label="Chat con asistente IA" withArrow position="top">
                                <ActionIcon variant="subtle" color="gray" size="sm" radius="md" aria-label="Chat con asistente IA">
                                    <MessageSquare size={14} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                </Group>

                <div style={{ flex: 1 }}>
                    <Text fw={600} size="md" mb={6} lineClamp={2} style={{ lineHeight: 1.35, letterSpacing: '-0.01em' }}>
                        {name}
                    </Text>
                    <Text size="sm" c="dimmed" lineClamp={3} style={{ lineHeight: 1.55 }}>
                        {description}
                    </Text>
                </div>

                <Button
                    variant="filled"
                    color="blue"
                    size="sm"
                    radius="md"
                    fullWidth
                    loading={loading}
                    onClick={onStart}
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
