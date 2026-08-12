import React from 'react';
import { Button, Card, Group, Stack, Text, ThemeIcon, Title, Badge } from '@mantine/core';
import { ArrowLeft, BookOpen, Video, Compass, Lock, ArrowRight } from 'lucide-react';

interface CVA_GesturesModulePageProps {
    moduleId: 'robot' | 'domotica';
    onBack: () => void;
    onStartPractice: () => void;
}

const CVA_GesturesModulePage: React.FC<CVA_GesturesModulePageProps> = ({ moduleId, onBack, onStartPractice }) => {
    const isDomotica = moduleId === 'domotica';
    const titleText = isDomotica ? 'Domótica (Arduino)' : 'Robot EV3';
    const colorTheme = isDomotica ? 'blue' : 'grape';

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
                    Volver al inicio de gestos
                </Button>
                <Badge color={colorTheme} variant="light" size="sm">
                    {isDomotica ? 'Domótica' : 'Robot'}
                </Badge>
            </Group>

            <Stack gap={6}>
                <Title order={1} style={{ letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    {titleText} — Control por Gestos
                </Title>
                <Text size="sm" c="dimmed" maw={620} style={{ lineHeight: 1.55 }}>
                    Selecciona una modalidad para tu práctica. Para interactuar con el hardware real del laboratorio remoto usando tu cámara, selecciona la opción de video personal.
                </Text>
            </Stack>

            <Stack gap="md" mt="md">
                {/* 1. Ver instrucciones (Mock/Bloqueado) */}
                <Card
                    padding="lg"
                    radius="md"
                    withBorder
                    style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'var(--mantine-color-default)' }}
                >
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Group gap="md" align="center">
                            <ThemeIcon size="xl" radius="md" variant="light" color="gray">
                                <BookOpen size={20} />
                            </ThemeIcon>
                            <div>
                                <Text fw={600} size="md">1. Ver instrucciones</Text>
                                <Text size="xs" c="dimmed">
                                    Consulta la guía interactiva de gestos y su correspondencia con acciones en el hardware.
                                </Text>
                            </div>
                        </Group>
                        <Badge color="gray" variant="light" leftSection={<Lock size={10} />}>
                            Por implementar
                        </Badge>
                    </Group>
                </Card>

                {/* 2. Practica con video personal (Activo) */}
                <Card
                    padding="lg"
                    radius="md"
                    className="animate-reveal dribbble-card dribbble-card-interactive group"
                    style={{ cursor: 'pointer' }}
                    onClick={onStartPractice}
                >
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Group gap="md" align="center">
                            <ThemeIcon size="xl" radius="md" variant="light" color={colorTheme}>
                                <Video size={20} />
                            </ThemeIcon>
                            <div>
                                <Text fw={600} size="md">2. Práctica con video personal</Text>
                                <Text size="xs" c="dimmed">
                                    Usa la webcam de tu computador para transmitir y controlar en tiempo real mediante gestos.
                                </Text>
                            </div>
                        </Group>
                        <Group gap="xs" align="center">
                            <Badge color="green" variant="light">Activo</Badge>
                            <ArrowRight 
                                size={16} 
                                className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" 
                                style={{ color: 'var(--text-secondary)' }}
                            />
                        </Group>
                    </Group>
                </Card>

                {/* 3. Practica guiada (Mock/Bloqueado) */}
                <Card
                    padding="lg"
                    radius="md"
                    withBorder
                    style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'var(--mantine-color-default)' }}
                >
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Group gap="md" align="center">
                            <ThemeIcon size="xl" radius="md" variant="light" color="gray">
                                <Compass size={20} />
                            </ThemeIcon>
                            <div>
                                <Text fw={600} size="md">3. Práctica guiada por el sistema</Text>
                                <Text size="xs" c="dimmed">
                                    Aprende a usar los gestos correctos a través de un tutorial paso a paso asistido.
                                </Text>
                            </div>
                        </Group>
                        <Badge color="gray" variant="light" leftSection={<Lock size={10} />}>
                            Por implementar
                        </Badge>
                    </Group>
                </Card>
            </Stack>
        </Stack>
    );
};

export default CVA_GesturesModulePage;
