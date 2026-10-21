// PracticesPage — Página de prácticas de laboratorio.
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import Swal from 'sweetalert2';
import { ActionIcon, Button, Modal, Container, Divider, Group, Paper, ScrollArea, SimpleGrid, Stack, Text, Title, Box } from '@mantine/core';
import { ArrowLeft, MessageSquareHeart, X } from 'lucide-react';
import CategoryCard from '../../components/practicas/CategoryCard';
import { EsqueletoCategorias } from '../../components/practicas/EsqueletoPracticas';
import PracticeCard from '../../components/practicas/PracticeCard';
import { getInsigniaForPractice } from '../../components/practicas/badges/insigniaRegistry';
import LinuxPasswordPrompt from '../../components/practicas/linux/LinuxPasswordPrompt';
import { linuxGetModule, type LinuxModule } from '../../services/linuxPractice.service';
import { useEffectiveRole } from '../../hooks/usePermissions';
import EncuestaPracticaModal from '../../components/practicas/EncuestaPracticaModal';
import { encuestasService } from '../../services/encuestas.service';
import type { Practice } from '../../types';
import type { LinuxPracticeSessionApi } from '../../hooks/useLinuxPracticeSession';
import { useEarnedBadges } from '../../services/badges.service';
import { consumePendingPracticesFocus, consumePendingPracticeOpen, onPracticeOpenRequest, consumirVistaPracticas, alPedirVistaPracticas } from '../../services/practiceNavigation.service';
import { notifications } from '@mantine/notifications';

export type { Practice };

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
     * App.tsx) — se usa al entrar a un módulo desde su tarjeta; vive arriba
     * para que el polling de revalidación sobreviva a la navegación entre pestañas. Sirve a los
     * módulos de Linux y de EV3.
     */
    linuxSession?: LinuxPracticeSessionApi;
    /** «Repetir de cero» del administrador al reabrir un módulo completo -- ver App.tsx. */
    onRestartLinuxModule?: (moduleId: string) => Promise<void>;
}

interface LogEntry {
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
    timestamp: string;
}

/** Prácticas cuya encuesta ya se ofreció en esta sesión de la app (al decir «Ahora no» no se insiste hasta volver a abrirla). */
const encuestaOfrecida = new Set<string>();

const PracticesPage: React.FC<PracticesPageProps> = ({ onStartPractice, onNewSession, setChatOpen, linuxSession, onRestartLinuxModule }) => {
    const [categories, setCategories] = useState<PracticeCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<PracticeCategory | null>(null);
    const [loading, setLoading] = useState(true);
    const [startingPractice, setStartingPractice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [setupLogs, setSetupLogs] = useState<LogEntry[]>([]);
    // Módulo de la Pi (Linux o EV3) que se está conectando: su título va en el modal de la contraseña.
    const [moduloEnCurso, setModuloEnCurso] = useState<LinuxModule | null>(null);
    // Admin que reabre un módulo ya completo: elige ver, repetir o salir antes de entrar.
    const [eleccionAdmin, setEleccionAdmin] = useState<LinuxModule | null>(null);
    const [repitiendo, setRepitiendo] = useState(false);
    const rol = useEffectiveRole();
    const logEndRef = useRef<HTMLDivElement>(null);
    // `abrirModulo` (más abajo) también lo usa el enlace desde Moodle, que se registra antes en un efecto.
    const abrirModuloRef = useRef<(id: string) => Promise<void>>(async () => {});

    // Insignias ganadas -- keyed por el mismo id de práctica que usa la Pi
    // (ej. "linux-m1"), ver services/badges.service.ts. Reactivo: si el
    // estudiante termina un módulo y vuelve acá (ver App.tsx:
    // onModuleCompleted), la tarjeta ya muestra la medalla sin recargar.
    const earnedBadges = useEarnedBadges();

    // Encuesta al terminar la práctica completa (todos sus módulos con insignia).
    const [encuestaAbierta, setEncuestaAbierta] = useState(false);
    const [encuestaRespondida, setEncuestaRespondida] = useState<Record<string, boolean>>({});
    const practicaCompleta = !!selectedCategory && selectedCategory.practices.length > 0
        && selectedCategory.practices.every(p => p.id in earnedBadges);

    useEffect(() => {
        if (!practicaCompleta || !selectedCategory || encuestaOfrecida.has(selectedCategory.id)) return;
        const id = selectedCategory.id;
        encuestaOfrecida.add(id);
        let activo = true;
        encuestasService.mia(id)
            .then((respondida) => {
                if (!activo) return;
                setEncuestaRespondida((r) => ({ ...r, [id]: respondida }));
                if (!respondida) setEncuestaAbierta(true);
            })
            // Sin conexión con el servidor no se ofrece: la práctica sigue igual y el botón de la cabecera queda disponible.
            .catch((e) => console.warn('[encuestas] no se pudo consultar:', e));
        return () => { activo = false; };
    }, [practicaCompleta, selectedCategory]);

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

    // Enlace laboremoto://practica/<id> (p. ej. desde una tarea de Moodle): abre la categoría de esa práctica y, si es un módulo del
    // servicio (Linux/EV3), su pantalla. Nunca arranca la práctica por sí solo: el estudiante pulsa «Comenzar» como siempre.
    const abrirPracticaPedida = useCallback(() => {
        if (categories.length === 0) return; // el catálogo aún carga: el pedido queda pendiente y se aplica al terminar
        const id = consumePendingPracticeOpen();
        if (!id) return;
        const cat = categories.find(c => c.practices.some(p => p.id === id));
        if (!cat) {
            notifications.show({ title: 'Práctica no disponible', message: `La práctica «${id}» no está en tu catálogo.`, color: 'yellow' });
            return;
        }
        setSelectedCategory(cat);
        if (cat.id === 'linux' || id.startsWith('ev3-')) void abrirModuloRef.current(id);
    }, [categories]);

    useEffect(() => {
        abrirPracticaPedida();
        return onPracticeOpenRequest(abrirPracticaPedida);
    }, [abrirPracticaPedida]);

    // El tutorial de bienvenida muestra la lista de temas o abre uno (sin arrancar ninguna práctica).
    const aplicarVistaPedida = useCallback(() => {
        if (categories.length === 0) return; // se aplica cuando terminen de cargar los temas
        const v = consumirVistaPracticas();
        if (!v) return;
        setSelectedCategory(v.categoria ? categories.find(c => c.id === v.categoria) ?? null : null);
    }, [categories]);

    useEffect(() => {
        aplicarVistaPedida();
        return alPedirVistaPracticas(aplicarVistaPedida);
    }, [aplicarVistaPedida]);

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
            // Linux va primero (es la práctica de entrada); el resto, en el orden que manda la Pi.
            setCategories([...cats].sort((a, b) => Number(b.id === 'linux') - Number(a.id === 'linux')));
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
    };

    // Los módulos que sirve la Pi (todos los de Linux y los ev3-*) piden la
    // contraseña directo desde su tarjeta (ver abrirModulo); las demás prácticas (legacy, desde .env) arrancan
    // con el flujo de setup + sesión compartida.
    const isServiceModule = (categoryId: string, practiceId: string) =>
        categoryId === 'linux' || practiceId.startsWith('ev3-');

    // Entrar a un módulo de la Pi (Linux o EV3) desde su tarjeta: sin página intermedia, directo a la contraseña.
    //  - Si ya hay una sesión abierta de ese módulo, se va a su pestaña.
    //  - El admin que reabre uno ya completo elige antes: ver, repetir de cero o salir.
    const conectarModulo = async (module: LinuxModule) => {
        if (!linuxSession) return;
        setModuloEnCurso(module);
        try {
            await linuxSession.connect(module);
        } catch (e) {
            const mensaje = e instanceof Error ? e.message : String(e);
            if (mensaje !== 'Conexión cancelada') {
                notifications.show({ title: 'No se pudo entrar a la práctica', message: mensaje, color: 'red' });
            }
        } finally {
            setModuloEnCurso(null);
        }
    };

    const abrirModulo = async (id: string) => {
        if (!linuxSession || startingPractice) return;
        const sesionAbierta = Object.entries(linuxSession.sessionModuleMap).find(([, mid]) => mid === id)?.[0];
        if (sesionAbierta) {
            onNewSession?.({ id: sesionAbierta, label: '' });
            return;
        }
        setStartingPractice(id);
        let module: LinuxModule;
        try {
            module = await linuxGetModule(id);
        } catch (e) {
            notifications.show({ title: 'No se pudo cargar el módulo', message: e instanceof Error ? e.message : String(e), color: 'red' });
            return;
        } finally {
            setStartingPractice(null);
        }
        if (rol === 'admin_lab' && id in earnedBadges) {
            setEleccionAdmin(module);
            return;
        }
        void conectarModulo(module);
    };
    abrirModuloRef.current = abrirModulo;

    const repetirModulo = async () => {
        if (!eleccionAdmin || repitiendo) return;
        setRepitiendo(true);
        try {
            await onRestartLinuxModule?.(eleccionAdmin.id);
            const module = eleccionAdmin;
            setEleccionAdmin(null);
            void conectarModulo(module);
        } finally {
            setRepitiendo(false);
        }
    };


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
                            <EsqueletoCategorias />
                        ) : (
                            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" data-tour="practicas-categorias">
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
                            <Group gap="sm">
                                {practicaCompleta && (
                                    <Button
                                        variant="light"
                                        size="xs"
                                        leftSection={<MessageSquareHeart size={14} />}
                                        onClick={() => setEncuestaAbierta(true)}
                                    >
                                        {encuestaRespondida[selectedCategory.id] ? 'Cambiar mi opinión' : 'Dar mi opinión'}
                                    </Button>
                                )}
                            </Group>
                        </Group>

                        <EncuestaPracticaModal
                            opened={encuestaAbierta}
                            practica={selectedCategory.id}
                            nombre={selectedCategory.name}
                            onClose={() => setEncuestaAbierta(false)}
                            onEnviada={() => setEncuestaRespondida((r) => ({ ...r, [selectedCategory.id]: true }))}
                        />

                        <Stack gap={6}>
                            <Title order={1} style={{ fontSize: '1.875rem', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                                {selectedCategory.name}
                            </Title>
                            <Text size="sm" c="dimmed" maw={620} style={{ lineHeight: 1.55 }}>
                                {selectedCategory.description}
                            </Text>
                        </Stack>

                        <Divider />

                        <div className="grilla-fichas">
                            {selectedCategory.practices.map(practice => (
                                <PracticeCard
                                    key={practice.id}
                                    id={practice.id}
                                    name={practice.name}
                                    description={practice.description}
                                    hasCamera={practice.panels.camera}
                                    onStart={() => (
                                        isServiceModule(selectedCategory.id, practice.id)
                                            ? void abrirModulo(practice.id)
                                            : handleStartPractice(practice)
                                    )}
                                    loading={startingPractice === practice.id}
                                    completada={practice.id in earnedBadges}
                                    resumen={practice.resumen}
                                    badge={practice.id in earnedBadges ? getInsigniaForPractice(practice.id) : undefined}
                                />
                            ))}
                        </div>

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

            {/* Contraseña para entrar al módulo (la pide useLinuxPracticeSession.connect) */}
            {linuxSession && (
                <LinuxPasswordPrompt
                    opened={!!linuxSession.passwordPrompt}
                    username={linuxSession.passwordPrompt?.username ?? ''}
                    modulo={moduloEnCurso?.title}
                    loading={linuxSession.submittingPassword}
                    errorMessage={linuxSession.connectError}
                    onSubmit={linuxSession.submitPassword}
                    onCancel={linuxSession.cancelPassword}
                />
            )}

            {/* Admin que reabre un módulo ya completo */}
            <Modal opened={!!eleccionAdmin} onClose={() => setEleccionAdmin(null)} title={eleccionAdmin?.title} centered size="md">
                <Stack gap="lg">
                    <Text size="sm" style={{ color: 'var(--text-secondary)' }}>
                        Ya completaste este módulo. Como administrador, elige qué hacer para revisar comportamientos.
                    </Text>
                    <Group justify="flex-end" gap="sm">
                        <Button variant="subtle" color="gray" onClick={() => setEleccionAdmin(null)}>Salir</Button>
                        <Button
                            variant="outline"
                            onClick={() => { const m = eleccionAdmin; setEleccionAdmin(null); if (m) void conectarModulo(m); }}
                        >
                            Ver
                        </Button>
                        <Button loading={repitiendo} onClick={() => void repetirModulo()}>Repetir de cero</Button>
                    </Group>
                </Stack>
            </Modal>
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
