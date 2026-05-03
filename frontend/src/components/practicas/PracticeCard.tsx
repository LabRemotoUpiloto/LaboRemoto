import React from 'react';
import { Button, Card, Group, Stack, Text, Tooltip } from '@mantine/core';
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
            radius="md" 
            padding="lg" 
            className="group animate-reveal"
            sx={{
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                    transform: 'translateY(-4px) scale(1.01)',
                    boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(34, 139, 230, 0.1)',
                }
            }}
        >
            <Stack gap="md">
                <Group justify="space-between" align="center">
                    <Group gap={6} align="center">
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: diff.dot, flexShrink: 0 }} />
                        <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>{diff.label}</Text>
                    </Group>
                    <Group gap="xs">
                        {hasCamera && (
                            <Tooltip label="Cámara del laboratorio" withArrow>
                                <Camera size={18} className="opacity-60 group-hover:opacity-100 group-hover:text-blue-500 transition-all duration-200" />
                            </Tooltip>
                        )}
                        {hasChat && (
                            <Tooltip label="Chat con asistente IA" withArrow>
                                <MessageSquare size={18} className="opacity-60 group-hover:opacity-100 group-hover:text-blue-500 transition-all duration-200" />
                            </Tooltip>
                        )}
                    </Group>
                </Group>

                <div>
                    <Text fw={600} size="lg" mb={4}>{name}</Text>
                    <Text size="sm" c="dimmed">{description}</Text>
                </div>

                <Button
                    variant="light"
                    color="blue"
                    loading={loading}
                    onClick={onStart}
                    rightSection={<ArrowRight size={16} className="group-hover:translate-x-1 transition-transform duration-200" />}
                    className="group-hover:shadow-md transition-all duration-200"
                >
                    {loading ? 'Preparando...' : 'Iniciar Práctica'}
                </Button>
            </Stack>
        </Card>
    );
};

export default PracticeCard;
