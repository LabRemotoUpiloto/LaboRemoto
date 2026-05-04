import React from 'react';
import { Container, Title, Text, Button, SimpleGrid, Card, Group, Stack, rem, UnstyledButton, Box } from '@mantine/core';
import { ArrowRight, FlaskConical, Plus, Server, History, FolderOpen, Layers, ShieldCheck, Star, Play } from 'lucide-react';
import { useTour } from '../../tour';

interface LandingPageProps {
    onStartTutorial?: () => void;
    onOpenPanel?: (panelId: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartTutorial, onOpenPanel }) => {
    const { startTour } = useTour(onOpenPanel);
    
    const handleStartTutorial = () => {
        if (onStartTutorial) {
            onStartTutorial();
        }
        startTour();
    };

    const quickActions = [
        { 
            id: 'practices', 
            title: 'Prácticas de Laboratorio', 
            description: 'Eve3, Linux, Circuitos y más', 
            icon: <FlaskConical size={24} />,
            page: 'practices'
        },
        { 
            id: 'connect', 
            title: 'Nueva Conexión', 
            description: 'Conecta a un servidor SSH', 
            icon: <Plus size={24} />,
            page: 'connect'
        },
        { 
            id: 'hosts', 
            title: 'Mis Hosts', 
            description: 'Gestiona servidores guardados', 
            icon: <Server size={24} />,
            page: 'hosts'
        },
        { 
            id: 'logs', 
            title: 'Historial de Logs', 
            description: 'Revisa sesiones pasadas', 
            icon: <History size={24} />,
            page: 'logs'
        },
        { 
            id: 'sftp', 
            title: 'Explorador SFTP', 
            description: 'Transferencia de archivos', 
            icon: <FolderOpen size={24} />,
            page: 'sftp'
        }
    ];

    return (
        <Box 
            className="custom-scrollbar"
            style={{ 
                width: '100%', 
                height: '100%', 
                overflowY: 'auto', 
                overflowX: 'hidden',
                backgroundColor: 'var(--mantine-color-body)',
                paddingTop: rem(12)
            }}
        >
            <Container size={1000} pb={60}>
                {/* ── SECCIÓN HERO CTA ── */}
                <Box component="section" mb={40} className="animate-in fade-in duration-700">
                    <Card
                        padding={rem(48)}
                        radius={24}
                        withBorder
                        style={(theme) => ({
                            background: `linear-gradient(135deg, ${theme.colors.dark[7]} 0%, ${theme.colors.dark[8]} 100%)`,
                            borderColor: 'var(--mantine-color-default-border)',
                            textAlign: 'center',
                            overflow: 'hidden'
                        })}
                    >
                        <Title 
                            order={1} 
                            mb="md" 
                            style={{ 
                                fontSize: rem(42), 
                                fontWeight: 800, 
                                lineHeight: 1.1,
                                letterSpacing: '-0.02em',
                                color: 'var(--mantine-color-text)'
                            }}
                        >
                            Bienvenido al laboratorio remoto de la Universidad Piloto de Colombia
                        </Title>
                        <Text 
                            size="xl" 
                            c="dimmed" 
                            maw={640} 
                            mx="auto" 
                            mb={40} 
                            style={{ lineHeight: 1.6 }}
                        >
                            Domina Linux y la administración remota con el asistente SSH más inteligente. 
                            Conecta tu primer servidor en segundos.
                        </Text>
                        <Group justify="center" gap="md">
                            <Button 
                                size="lg" 
                                radius="xl" 
                                color="blue"
                                onClick={() => onOpenPanel?.('connect')}
                                rightSection={<ArrowRight size={18} />}
                                styles={{
                                    root: {
                                        padding: `0 ${rem(32)}`,
                                        height: rem(54),
                                        transition: 'all 0.3s ease',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: '0 8px 25px -5px rgba(34, 139, 230, 0.4)'
                                        }
                                    }
                                }}
                            >
                                Nueva Conexión
                            </Button>
                            <Button 
                                variant="outline" 
                                size="lg" 
                                radius="xl" 
                                color="gray"
                                onClick={handleStartTutorial}
                                styles={{
                                    root: {
                                        padding: `0 ${rem(32)}`,
                                        height: rem(54),
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)'
                                        }
                                    }
                                }}
                            >
                                Ver Tutorial
                            </Button>
                        </Group>
                    </Card>
                </Box>

                {/* ── ACCIONES RÁPIDAS ── */}
                <Box component="section" mb={60} className="animate-in slide-in-from-bottom-8 duration-700 delay-200 fill-mode-both">
                    <Text 
                        size="xs" 
                        fw={700} 
                        tt="uppercase" 
                        c="dimmed" 
                        ls={1.5} 
                        mb="xl"
                    >
                        Acceso Rápido
                    </Text>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        {quickActions.map(action => (
                            <UnstyledButton 
                                key={action.id}
                                onClick={() => onOpenPanel?.(action.page)}
                                className="group"
                                style={(theme) => ({
                                    backgroundColor: 'var(--mantine-color-dark-6)',
                                    border: `1px solid var(--mantine-color-default-border)`,
                                    borderRadius: theme.radius.lg,
                                    padding: theme.spacing.xl,
                                    transition: 'all 0.3s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: theme.spacing.lg,
                                    '&:hover': {
                                        backgroundColor: 'var(--mantine-color-dark-5)',
                                        borderColor: theme.colors.blue[6],
                                        transform: 'translateY(-4px)',
                                        boxShadow: theme.shadows.xl
                                    }
                                })}
                            >
                                <Box 
                                    style={(theme) => ({
                                        width: rem(48),
                                        height: rem(48),
                                        backgroundColor: `rgba(${theme.colors.blue[6]}, 0.1)`,
                                        color: theme.colors.blue[6],
                                        borderRadius: theme.radius.md,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    })}
                                >
                                    {action.icon}
                                </Box>
                                <Stack gap={2} style={{ flex: 1 }}>
                                    <Text 
                                        fw={600} 
                                        size="lg" 
                                        className="group-hover:text-blue-500 transition-colors"
                                        style={{ color: 'var(--mantine-color-text)' }}
                                    >
                                        {action.title}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        {action.description}
                                    </Text>
                                </Stack>
                                <Box 
                                    className="group-hover:translate-x-1 transition-transform"
                                    style={{ 
                                        opacity: 0.5, 
                                        color: 'var(--mantine-color-dimmed)' 
                                    }}
                                >
                                    <ArrowRight size={16} />
                                </Box>
                            </UnstyledButton>
                        ))}
                    </SimpleGrid>
                </Box>

                <Box 
                    mb={60} 
                    style={{ 
                        height: 1, 
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' 
                    }} 
                />

                {/* ── SECCIONES DE CONTENIDO ── */}
                <Stack gap="xl">
                    <Card
                        padding="xl"
                        radius="lg"
                        withBorder
                        style={(theme) => ({
                            backgroundColor: 'var(--mantine-color-dark-6)',
                            borderLeft: `${rem(4)} solid rgba(${theme.colors.blue[6]}, 0.4)`,
                            transition: 'border-left-color 0.3s ease',
                            '&:hover': {
                                borderLeftColor: theme.colors.blue[6]
                            }
                        })}
                    >
                        <Group align="flex-start" wrap="nowrap" gap="xl">
                            <Box 
                                style={(theme) => ({
                                    width: rem(56),
                                    height: rem(56),
                                    backgroundColor: `rgba(${theme.colors.blue[6]}, 0.1)`,
                                    color: theme.colors.blue[6],
                                    borderRadius: theme.radius.md,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                })}
                            >
                                <Layers size={32} />
                            </Box>
                            <div>
                                <Title order={2} mb="sm" size="h3">¿Qué es este proyecto?</Title>
                                <Text c="dimmed" style={{ lineHeight: 1.6 }}>
                                    El cliente ssh unipiloto es una herramienta innovadora diseñada específicamente para facilitar 
                                    el aprendizaje de Linux y la administración de sistemas remotos. Combinamos un cliente SSH 
                                    potente con un asistente de inteligencia artificial que te guía paso a paso en tu viaje 
                                    de aprendizaje.
                                </Text>
                            </div>
                        </Group>
                    </Card>

                    <Card
                        padding="xl"
                        radius="lg"
                        withBorder
                        style={(theme) => ({
                            backgroundColor: 'var(--mantine-color-dark-6)',
                            borderLeft: `${rem(4)} solid rgba(${theme.colors.blue[6]}, 0.4)`,
                            transition: 'border-left-color 0.3s ease',
                            '&:hover': {
                                borderLeftColor: theme.colors.blue[6]
                            }
                        })}
                    >
                        <Group align="flex-start" wrap="nowrap" gap="xl">
                            <Box 
                                style={(theme) => ({
                                    width: rem(56),
                                    height: rem(56),
                                    backgroundColor: `rgba(${theme.colors.blue[6]}, 0.1)`,
                                    color: theme.colors.blue[6],
                                    borderRadius: theme.radius.md,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                })}
                            >
                                <ShieldCheck size={32} />
                            </Box>
                            <div>
                                <Title order={2} mb="sm" size="h3">¿Qué es un cliente SSH?</Title>
                                <Text c="dimmed" mb="xl" style={{ lineHeight: 1.6 }}>
                                    SSH (Secure Shell) es un protocolo de red que permite conectarte de forma <strong>segura y 
                                    cifrada</strong> a otro equipo. Un cliente SSH es la aplicación que utilizas para establecer estas conexiones.
                                </Text>
                                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                                    <Group gap="md" p="md" style={{ backgroundColor: 'var(--mantine-color-dark-7)', borderRadius: rem(12) }}>
                                        <ShieldCheck size={20} color="var(--mantine-color-blue-6)" />
                                        <Text size="sm"><strong>Conexión Segura:</strong> Comunicación cifrada para proteger tus datos.</Text>
                                    </Group>
                                    <Group gap="md" p="md" style={{ backgroundColor: 'var(--mantine-color-dark-7)', borderRadius: rem(12) }}>
                                        <Server size={20} color="var(--mantine-color-blue-6)" />
                                        <Text size="sm"><strong>Control Remoto:</strong> Accede a servidores Linux desde cualquier lugar.</Text>
                                    </Group>
                                </SimpleGrid>
                            </div>
                        </Group>
                    </Card>

                    <Card
                        padding="xl"
                        radius="lg"
                        withBorder
                        style={(theme) => ({
                            backgroundColor: 'var(--mantine-color-dark-6)',
                            borderLeft: `${rem(4)} solid rgba(${theme.colors.blue[6]}, 0.4)`,
                            transition: 'border-left-color 0.3s ease',
                            '&:hover': {
                                borderLeftColor: theme.colors.blue[6]
                            }
                        })}
                    >
                        <Group align="flex-start" wrap="nowrap" gap="xl">
                            <Box 
                                style={(theme) => ({
                                    width: rem(56),
                                    height: rem(56),
                                    backgroundColor: `rgba(${theme.colors.blue[6]}, 0.1)`,
                                    color: theme.colors.blue[6],
                                    borderRadius: theme.radius.md,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                })}
                            >
                                <Star size={32} />
                            </Box>
                            <div>
                                <Title order={2} mb="sm" size="h3">Ventajas Educativas</Title>
                                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="md">
                                    <Stack gap="xs" p="xl" style={{ backgroundColor: 'var(--mantine-color-dark-7)', borderRadius: rem(12) }}>
                                        <Group gap="xs">
                                            <Box c="blue"><Play size={18} fill="currentColor" /></Box>
                                            <Text fw={600}>Asistente de IA Integrado</Text>
                                        </Group>
                                        <Text size="sm" c="dimmed">Aprende Linux conversando naturalmente con un compañero inteligente.</Text>
                                    </Stack>
                                    <Stack gap="xs" p="xl" style={{ backgroundColor: 'var(--mantine-color-dark-7)', borderRadius: rem(12) }}>
                                        <Group gap="xs">
                                            <Box c="blue"><Layers size={18} /></Box>
                                            <Text fw={600}>Interfaz Moderna</Text>
                                        </Group>
                                        <Text size="sm" c="dimmed">Diseño limpio que elimina la intimidación de la línea de comandos.</Text>
                                    </Stack>
                                </SimpleGrid>
                            </div>
                        </Group>
                    </Card>
                </Stack>
            </Container>
        </Box>
    );
};

export default LandingPage;
