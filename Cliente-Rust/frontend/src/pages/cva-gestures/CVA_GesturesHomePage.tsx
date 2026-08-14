import React from 'react';
import { Button, Card, Container, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Badge } from '@mantine/core';
import { ArrowLeft, Bot, Home, ArrowRight } from 'lucide-react';

interface CVA_GesturesHomePageProps {
    onSelectModule: (module: 'robot' | 'domotica') => void;
    onBack: () => void;
}

const CVA_GesturesHomePage: React.FC<CVA_GesturesHomePageProps> = ({ onSelectModule, onBack }) => {
    return (
        <Stack gap="xl">
            <Group justify="space-between" align="center">
                <Button
                    variant="subtle"
                    size="sm"
                    radius="md"
                    leftSection={<ArrowLeft size={14} />}
                    onClick={onBack}
                >
                    Volver a prácticas
                </Button>
            </Group>

            <Stack gap={6}>
                <Title order={1} style={{ letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    Control de Video Analítica (CVA)
                </Title>
                <Text size="sm" c="dimmed" maw={620} style={{ lineHeight: 1.55 }}>
                    Selecciona un módulo del laboratorio remoto para interactuar y controlar dispositivos físicos en tiempo real utilizando la cámara de tu computador y algoritmos de visión por computadora.
                </Text>
            </Stack>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" mt="md">
                {/* Modulo Domotica */}
                <Card
                    padding="xl"
                    radius="md"
                    className="animate-reveal dribbble-card dribbble-card-interactive group"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectModule('domotica')}
                >
                    <Stack gap="lg" style={{ height: '100%', justifyContent: 'space-between' }}>
                        <Stack gap="md">
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <ThemeIcon
                                    size={48}
                                    radius="lg"
                                    variant="subtle"
                                    style={{
                                        color: 'var(--accent-primary)',
                                    }}
                                >
                                    <Home size={24} />
                                </ThemeIcon>
                                <Badge variant="subtle">Disponible</Badge>
                            </Group>
                            <div>
                                <Text fw={600} size="xl" mb={4}>Domótica (Arduino)</Text>
                                <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
                                    Controla luces, ventilación y otros actuadores domésticos del laboratorio remoto utilizando gestos con tu mano.
                                </Text>
                            </div>
                        </Stack>
                        <Group justify="flex-end" align="center">
                            <ArrowRight 
                                size={16} 
                                className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" 
                                style={{ color: 'var(--text-secondary)' }}
                            />
                        </Group>
                    </Stack>
                </Card>

                {/* Modulo Robot EV3 */}
                <Card
                    padding="xl"
                    radius="md"
                    className="animate-reveal dribbble-card dribbble-card-interactive group"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectModule('robot')}
                >
                    <Stack gap="lg" style={{ height: '100%', justifyContent: 'space-between' }}>
                        <Stack gap="md">
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <ThemeIcon
                                    size={48}
                                    radius="lg"
                                    variant="subtle"
                                    style={{
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    <Bot size={24} />
                                </ThemeIcon>
                                <Badge variant="subtle" c="dimmed">Próximamente</Badge>
                            </Group>
                            <div>
                                <Text fw={600} size="xl" mb={4}>Robot EV3</Text>
                                <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
                                    Envía comandos de movimiento y giros al robot EV3 en la pista de pruebas utilizando gestos dinámicos.
                                </Text>
                            </div>
                        </Stack>
                        <Group justify="flex-end" align="center">
                            <ArrowRight 
                                size={16} 
                                className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" 
                                style={{ color: 'var(--text-secondary)' }}
                            />
                        </Group>
                    </Stack>
                </Card>
            </SimpleGrid>
        </Stack>
    );
};

export default CVA_GesturesHomePage;
