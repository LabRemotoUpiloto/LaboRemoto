// PracticesPage — Página de prácticas de laboratorio.
import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import Swal from 'sweetalert2';
import { ActionIcon, Alert, Button, Container, Divider, Group, Loader, Paper, ScrollArea, SimpleGrid, Stack, Text, ThemeIcon, Title, Box } from '@mantine/core';
import { ArrowLeft, Bot, Cpu, Terminal, X, type LucideIcon } from 'lucide-react';
import CategoryCard from '../../components/practicas/CategoryCard';
import PracticeCard from '../../components/practicas/PracticeCard';
import { getInsigniaForPractice } from '../../components/practicas/badges/insigniaRegistry';
import LinuxModulePage from './LinuxModulePage';
import type { Practice } from '../../types';
import type { LinuxPracticeSessionApi } from '../../hooks/useLinuxPracticeSession';
import { useEarnedBadges } from '../../services/badges.service';
import { consumePendingPracticesFocus } from '../../services/practiceNavigation.service';

export type { Practice };

const categoryIconMap: Record<string, LucideIcon> = {
    robot: Bot,
    terminal: Terminal,
    circuit: Cpu,
};

interface PracticeCategory {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    practices: Practice[];
}

interface PracticesPageProps {
    onStartPractice?: (payload: {
        practice: Practice;
        student: { id: number; username: string; fullname: string; email: string };
    }) => Promise<void>;
    /** Requerido para los módulos de la Pi (Linux y EV3): abre la pestaña de la sesión SSH real. */
    onNewSession?: (info: { id: string; label: string }) => void;
    /** Requerido para los módulos de la Pi (Linux y EV3): abre el panel de chat al conectar. */
    setChatOpen?: (open: boolean) => void;
    /**
     * Instancia única de useLinuxPracticeSession (vive a nivel de App, ver
     * App.tsx) — se threadea hasta LinuxModulePage para que el polling de
     * revalidación sobreviva a la navegación entre pestañas. Sirve a los
     * módulos de Linux y de EV3.
     */
    linuxSession?: LinuxPracticeSessionApi;
    /** "Repetir" del administrador en LinuxModulePage -- ver App.tsx. */
    onRestartLinuxModule?: (moduleId: string) => Promise<void>;
}

interface LogEntry {
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
    timestamp: string;
}

const PracticesPage: React.FC<PracticesPageProps> = ({ onStartPractice, onNewSession, setChatOpen, linuxSession, onRestartLinuxModule }) => {
    const [categories, setCategories] = useState<PracticeCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<PracticeCategory | null>(null);
    const [loading, setLoading] = useState(true);
    const [startingPractice, setStartingPractice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [setupLogs, setSetupLogs] = useState<LogEntry[]>([]);
    // Módulo del servicio de la Pi (Linux o EV3) abierto en pantalla.
    const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    // Insignias ganadas -- keyed por el mismo id de práctica que usa la Pi
    // (ej. "linux-m1"), ver services/badges.service.ts. Reactivo: si el
    // estudiante termina un módulo y vuelve acá (ver App.tsx:
    // onModuleCompleted), la tarjeta ya muestra la medalla sin recargar.
    const earnedBadges = useEarnedBadges();

    useEffect(() => {
        loadCategories();
    }, []);

    // Ver services/practiceNavigation.service.ts -- al volver de terminar un
    // módulo (App.tsx: onModuleCompleted), aterriza directo en su categoría
    // en vez de en la grilla de categorías, así el estudiante ve de una la
    // tarjeta con la medalla nueva.
    useEffect(() => {
        if (categories.length === 0) return;
        const pendingCategoryId = consumePendingPracticesFocus();
        if (!pendingCategoryId) return;
        const cat = categories.find(c => c.id === pendingCategoryId);
        if (cat) setSelectedCategory(cat);
    }, [categories]);

    // Auto-scroll logs
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [setupLogs]);

    // Listen to practice:log events
    useEffect(() => {
        let unlisten: UnlistenFn | null = null;
        listen<{ practice_id: string; level: string; message: string }>('practice:log', (event) => {
            const { level, message } = event.payload;
            const now = new Date();
            const timestamp = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setSetupLogs(prev => [...prev, { level: level as LogEntry['level'], message, timestamp }]);
        }).then(fn => { unlisten = fn; });

        return () => { unlisten?.(); };
    }, []);

    const loadCategories = async () => {
        try {
            setLoading(true);
            const cats = await invoke<PracticeCategory[]>('practicas_list_categories');
            setCategories(cats);
        } catch (err) {
            setError(`Error cargando prácticas: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleStartPractice = async (practice: Practice) => {
        if (startingPractice) return;
        setStartingPractice(practice.id);
        setSetupLogs([]); // Reset logs
        setError(null);

        const addLog = (level: LogEntry['level'], message: string) => {
            const now = new Date();
            const timestamp = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setSetupLogs(prev => [...prev, { level, message, timestamp }]);
        };

        try {
            // 1. Ejecutar setup commands (ej: levantar servidor del robot)
            // Los logs de este paso llegan via evento practice:log desde Rust
            await invoke<string[]>('practicas_run_setup', { practiceId: practice.id });

            // 2. Obtener configuración completa (con credenciales) desde el backend
            addLog('info', 'Obteniendo configuración de la práctica...');
            const fullConfig = await invoke<Practice>('practicas_get_config', { practiceId: practice.id });
            addLog('success', 'Configuración obtenida');

            // 3. Notificar al parent para abrir sesión SSH + workspace
            await onStartPractice?.({
                practice: fullConfig,
                student: { id: 0, username: '', fullname: 'Estudiante', email: '' },
            });

        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            addLog('error', `Práctica detenida por error — ${errMsg}`);
            Swal.fire({
                title: 'Error al iniciar práctica',
                text: errMsg,
                icon: 'error',
                confirmButtonText: 'Cerrar',
                confirmButtonColor: 'var(--danger, #EF4444)',
                position: 'center',
                customClass: { container: 'swal-fullscreen' },
            });
            setStartingPractice(null);
            return;
        }

        setStartingPractice(null);
    };

    const handleBack = () => {
        setSelectedCategory(null);
        setSetupLogs([]);
        setSelectedModuleId(null);
    };

    // Los módulos que sirve la Pi (todos los de Linux y los ev3-*) se abren en
    // la pantalla de módulo; las demás prácticas (legacy, desde .env) arrancan
    // con el flujo de setup + sesión compartida.
    const isServiceModule = (categoryId: string, practiceId: string) =>
        categoryId === 'linux' || practiceId.startsWith('ev3-');

    if (selectedModuleId) {
        if (!linuxSession) {
            // No debería pasar en la app real (App.tsx siempre instancia y pasa
            // useLinuxPracticeSession hacia acá) — guard defensivo para no
            // reventar si algún día PracticesPage se usa sin ese hook arriba.
            return (
                <Container size="sm" py="xl">
                    <Alert color="red" title="Práctica no disponible">
                        No se pudo inicializar la sesión de la práctica.
                    </Alert>
                    <Button mt="md" variant="subtle" leftSection={<ArrowLeft size={14} />} onClick={() => setSelectedModuleId(null)}>
                        Volver
                    </Button>
                </Container>
            );
        }
        return (
            <LinuxModulePage
                practiceId={selectedModuleId}
                categoryName={selectedCategory?.name ?? 'Prácticas'}
                onBack={() => setSelectedModuleId(null)}
                linuxSession={linuxSession}
                onRestartModule={onRestartLinuxModule}
            />
        );
    }

    const levelColor: Record<LogEntry['level'], string> = {
        info: 'gray',
        success: 'green',
        warning: 'orange',
        error: 'red',
    };

    return (
        <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
            <Container size="lg" py="xl" px="xl">
                {!selectedCategory ? (
                    <Stack gap="xl">
                        <Stack gap="sm">
                            <Title order={1}>Prácticas de Laboratorio</Title>
                            <Text size="md" c="dimmed" maw={580}>
                                Selecciona una categoría para ver las prácticas disponibles. Cada práctica configura automáticamente tu entorno de trabajo.
                            </Text>
                        </Stack>

                        {loading ? (
                            // Solo esta parte (las cards) muestra el loading -- el título y la
                            // descripción ya se ven arriba. Antes un `if (loading) return ...`
                            // tapaba la página entera mientras practicas_list_categories
                            // esperaba a la Pi (hasta 20s si no responde).
                            <Stack align="center" gap="md" py="xl">
                                <Loader size="md" />
                                <Text c="dimmed" size="sm">Cargando prácticas...</Text>
                            </Stack>
                        ) : (
                            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                                {categories.map(cat => (
                                    <CategoryCard
                                        key={cat.id}
                                        id={cat.id}
                                        name={cat.name}
                                        description={cat.description}
                                        icon={cat.icon}
                                        color={cat.color}
                                        practiceCount={cat.practices.length}
                                        onClick={() => cat.practices.length > 0 && setSelectedCategory(cat)}
                                    />
                                ))}
                            </SimpleGrid>
                        )}
                    </Stack>
                ) : (
                    <Stack gap="xl">
                        <Group justify="space-between" align="center">
                            <Button
                                variant="subtle"
                                color="gray"
                                size="sm"
                                radius="md"
                                leftSection={<ArrowLeft size={14} />}
                                onClick={handleBack}
                            >
                                Volver a categorías
                            </Button>
                            <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                                {selectedCategory.practices.length} práctica{selectedCategory.practices.length !== 1 ? 's' : ''}
                            </Text>
                        </Group>

                        <Group gap="md" align="flex-start" wrap="nowrap">
                            <ThemeIcon size={52} radius="lg" variant="light" color="blue">
                                {(() => {
                                    const Icon = categoryIconMap[selectedCategory.icon] || Terminal;
                                    return <Icon size={26} />;
                                })()}
                            </ThemeIcon>
                            <Stack gap={6}>
                                <Title order={1} style={{ fontSize: '1.875rem', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                                    {selectedCategory.name}
                                </Title>
                                <Text size="sm" c="dimmed" maw={620} style={{ lineHeight: 1.55 }}>
                                    {selectedCategory.description}
                                </Text>
                            </Stack>
                        </Group>

                        <Divider />

                        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                            {selectedCategory.practices.map(practice => (
                                <PracticeCard
                                    key={practice.id}
                                    id={practice.id}
                                    name={practice.name}
                                    description={practice.description}
                                    hasCamera={practice.panels.camera}
                                    hasChat={practice.panels.chat}
                                    onStart={() => (
                                        isServiceModule(selectedCategory.id, practice.id)
                                            ? setSelectedModuleId(practice.id)
                                            : handleStartPractice(practice)
                                    )}
                                    loading={startingPractice === practice.id}
                                    badge={practice.id in earnedBadges ? getInsigniaForPractice(practice.id) : undefined}
                                />
                            ))}
                        </SimpleGrid>

                        {setupLogs.length > 0 && (
                            <SetupLogPanel
                                logs={setupLogs}
                                levelColor={levelColor}
                                isRunning={!!startingPractice}
                                onClear={() => setSetupLogs([])}
                                logEndRef={logEndRef}
                            />
                        )}
                    </Stack>
                )}
            </Container>
        </Box>
    );
};

/** Panel de log de inicialización de las prácticas que arrancan con setup (legacy, desde .env). */
const SetupLogPanel: React.FC<{
    logs: LogEntry[];
    levelColor: Record<LogEntry['level'], string>;
    isRunning: boolean;
    onClear: () => void;
    logEndRef: React.RefObject<HTMLDivElement>;
}> = ({ logs, levelColor, isRunning, onClear, logEndRef }) => (
    <Paper withBorder radius="md">
        <Group
            px="md"
            py="xs"
            justify="space-between"
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
        >
            <Text size="xs" fw={600} c="dimmed">Log de Inicialización</Text>
            {!isRunning && (
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={onClear}>
                    <X size={14} />
                </ActionIcon>
            )}
        </Group>
        <ScrollArea h={280} p="md">
            <Stack gap={4}>
                {logs.map((log, i) => (
                    <Group key={i} gap="sm" align="flex-start" wrap="nowrap">
                        <Text size="xs" c="dimmed" style={{ minWidth: 65, flexShrink: 0, fontFamily: 'monospace' }}>
                            {log.timestamp}
                        </Text>
                        <Text size="xs" c={levelColor[log.level]} style={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                            {log.message}
                        </Text>
                    </Group>
                ))}
                {isRunning && (
                    <Text size="xs" c="green" style={{ fontFamily: 'monospace' }}>▌</Text>
                )}
                <div ref={logEndRef} />
            </Stack>
        </ScrollArea>
    </Paper>
);

export default PracticesPage;
