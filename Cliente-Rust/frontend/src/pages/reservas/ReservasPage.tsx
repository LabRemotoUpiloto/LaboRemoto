import React, { useState, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Box, Container, Title, Text, Stack, Group, SimpleGrid,
  Paper, Button, ActionIcon, Tooltip, ScrollArea, Badge,
  Divider, Loader,
} from '@mantine/core';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock,
  Bot, Terminal, Cpu, CheckCircle2, XCircle, AlertCircle,
  Plus, ArrowLeft, ArrowRight, Camera, MessageSquare, Zap,
} from 'lucide-react';

// ── Tipos ────────────────────────────────────────────────────────────────────

type EstadoSlot = 'disponible' | 'ocupado' | 'mi-reserva' | 'bloqueado';

interface Slot { hora: string; estado: EstadoSlot; }

interface Practice {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  panels: { camera: boolean; chat: boolean; chat_context: string; chat_tutorial: string };
  connection: any;
  terminal: any;
  moodle_assignment_id?: number;
}

interface PracticeCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  practices: Practice[];
}

interface ReservaConfirmada {
  practice: Practice;
  categoryId: string;
  fecha: string;
  hora: string;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const HORAS = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

const categoryIconMap: Record<string, React.ElementType> = {
  robot: Bot,
  terminal: Terminal,
  circuit: Cpu,
};

const difficultyConfig: Record<string, { label: string; dot: string }> = {
  beginner:     { label: 'Principiante', dot: 'var(--success, #22c55e)' },
  intermediate: { label: 'Intermedio',   dot: 'var(--warning, #f59e0b)' },
  advanced:     { label: 'Avanzado',     dot: 'var(--danger,  #ef4444)' },
};

const ESTADO_CFG: Record<EstadoSlot, { bg: string; border: string; text: string; icon: React.ReactNode; label: string }> = {
  disponible:   { bg: 'var(--success-bg)',          border: 'var(--success-border)',  text: 'var(--success-text)', icon: <CheckCircle2 size={11}/>, label: 'Disponible' },
  'mi-reserva': { bg: 'var(--info-bg)',             border: 'var(--info-border)',     text: 'var(--info-text)',    icon: <CheckCircle2 size={11}/>, label: 'Mi reserva' },
  ocupado:      { bg: 'var(--danger-bg)',           border: 'var(--danger-border)',   text: 'var(--danger-text)',  icon: <XCircle size={11}/>,       label: 'Ocupado' },
  bloqueado:    { bg: 'var(--interactive-hover)',   border: 'var(--border-subtle)',   text: 'var(--text-muted)',   icon: <AlertCircle size={11}/>,   label: 'Bloqueado' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFecha(d: Date) { return d.toISOString().split('T')[0]; }
function labelFechaCorta(d: Date) {
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}

function horaActual() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/** Genera slots mock determinísticos por práctica + fecha. */
function generarSlots(
  practiceId: string,
  fecha: string,
  reservasUsuario: ReservaConfirmada[],
): Slot[] {
  const seed = practiceId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + fecha.charCodeAt(8);
  return HORAS.map((hora, i) => {
    if (hora === '12:00') return { hora, estado: 'bloqueado' };

    const yaReservada = reservasUsuario.some(
      r => r.practice.id === practiceId && r.fecha === fecha && r.hora === hora,
    );
    if (yaReservada) return { hora, estado: 'mi-reserva' };

    const n = (seed + i * 7) % 10;
    if (n < 3) return { hora, estado: 'ocupado' };
    return { hora, estado: 'disponible' };
  });
}

function proximoLibre(slots: Slot[]): string | null {
  const ahora = horaActual();
  for (const s of slots) {
    const [h, m] = s.hora.split(':').map(Number);
    if (h * 60 + m >= ahora && s.estado === 'disponible') return s.hora;
  }
  return null;
}

// ── Sub-componente: tarjeta de práctica ──────────────────────────────────────

interface PracticeOption {
  practice: Practice;
  category: PracticeCategory;
}

const PracticePickCard: React.FC<{
  opt: PracticeOption;
  onClick: () => void;
}> = ({ opt, onClick }) => {
  const Icon = categoryIconMap[opt.category.icon] || Terminal;
  const diff = difficultyConfig[opt.practice.difficulty] || difficultyConfig.beginner;

  return (
    <Box
      component="button"
      onClick={onClick}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 12,
        padding: 18, borderRadius: 12, height: '100%',
        border: '1.5px solid var(--border-subtle)',
        backgroundColor: 'var(--background-secondary)',
        transition: 'border-color 150ms, transform 150ms, background-color 150ms',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent-primary)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          backgroundColor: 'var(--accent-primary-subtle)',
          color: 'var(--accent-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} />
        </Box>
        <Group gap={6} align="center">
          <Box style={{
            width: 7, height: 7, borderRadius: '50%',
            background: diff.dot, boxShadow: `0 0 0 3px ${diff.dot}25`,
          }} />
          <Text size="xs" tt="uppercase" fw={600} style={{ letterSpacing: '0.06em', color: 'var(--text-muted)', fontSize: 10.5 }}>
            {diff.label}
          </Text>
        </Group>
      </Group>

      <Stack gap={6} style={{ flex: 1 }}>
        <Text fw={600} size="md" lineClamp={2} style={{ color: 'var(--text-primary)', lineHeight: 1.35 }}>
          {opt.practice.name}
        </Text>
        <Text size="xs" lineClamp={3} style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {opt.practice.description}
        </Text>
      </Stack>

      <Group justify="space-between" align="center" mt={4}>
        <Group gap={6}>
          {opt.practice.panels?.camera && (
            <Tooltip label="Cámara del laboratorio" withArrow>
              <Box style={{ color: 'var(--text-muted)', display: 'flex' }}>
                <Camera size={13} />
              </Box>
            </Tooltip>
          )}
          {opt.practice.panels?.chat && (
            <Tooltip label="Chat del asistente" withArrow>
              <Box style={{ color: 'var(--text-muted)', display: 'flex' }}>
                <MessageSquare size={13} />
              </Box>
            </Tooltip>
          )}
          <Badge
            size="xs" variant="light"
            style={{
              backgroundColor: 'var(--interactive-hover)',
              color: 'var(--text-secondary)',
              textTransform: 'none',
              fontWeight: 500,
            }}
          >
            {opt.category.name}
          </Badge>
        </Group>
        <Group gap={4} align="center" style={{ color: 'var(--accent-primary)' }}>
          <Text size="xs" fw={600}>Reservar</Text>
          <ArrowRight size={13} />
        </Group>
      </Group>
    </Box>
  );
};

// ── Sub-componente: slot horario ─────────────────────────────────────────────

const SlotBtn: React.FC<{ slot: Slot; seleccionado: boolean; onClick: () => void }> = ({ slot, seleccionado, onClick }) => {
  const cfg = ESTADO_CFG[slot.estado];
  const interactivo = slot.estado === 'disponible';

  return (
    <Tooltip label={cfg.label} withArrow position="top" disabled={slot.estado === 'disponible'}>
      <Box
        component="button"
        onClick={interactivo ? onClick : undefined}
        style={{
          all: 'unset', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 12px', borderRadius: 8, width: '100%',
          cursor: interactivo ? 'pointer' : 'default',
          border: `1px solid ${seleccionado ? 'var(--accent-primary)' : cfg.border}`,
          backgroundColor: seleccionado ? 'var(--accent-primary-subtle)' : cfg.bg,
          opacity: slot.estado === 'bloqueado' ? 0.5 : 1,
          transition: 'border-color 150ms, background-color 150ms',
        }}
      >
        <Box style={{ color: seleccionado ? 'var(--accent-primary)' : cfg.text, display: 'flex', flexShrink: 0 }}>
          {cfg.icon}
        </Box>
        <Text size="xs" fw={500} style={{
          fontVariantNumeric: 'tabular-nums',
          color: seleccionado ? 'var(--accent-primary)' : cfg.text,
        }}>
          {slot.hora}
        </Text>
        {slot.estado === 'mi-reserva' && (
          <Text size="xs" style={{ color: 'var(--info-text)', flex: 1 }} truncate>✓ Tuya</Text>
        )}
      </Box>
    </Tooltip>
  );
};

// ── Leyenda ──────────────────────────────────────────────────────────────────

const Leyenda: React.FC = () => (
  <Group gap={10} wrap="wrap">
    {(Object.entries(ESTADO_CFG) as [EstadoSlot, typeof ESTADO_CFG[EstadoSlot]][]).map(([key, cfg]) => (
      <Group key={key} gap={4} align="center">
        <Box style={{ color: cfg.text, display: 'flex' }}>{cfg.icon}</Box>
        <Text size="xs" style={{ color: 'var(--text-muted)' }}>{cfg.label}</Text>
      </Group>
    ))}
  </Group>
);

// ── Tarjeta compacta de reserva (mis reservas) ───────────────────────────────

const ReservaItem: React.FC<{
  r: ReservaConfirmada;
  category: PracticeCategory | undefined;
  onCancel: () => void;
}> = ({ r, category, onCancel }) => {
  const Icon = categoryIconMap[category?.icon || 'terminal'] || Terminal;
  return (
    <Paper withBorder radius="md" p="sm" style={{
      borderColor: 'var(--border-subtle)',
      backgroundColor: 'var(--background-secondary)',
    }}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Box style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            backgroundColor: 'var(--accent-primary-subtle)',
            color: 'var(--accent-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={14} />
          </Box>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} lineClamp={1} style={{ color: 'var(--text-primary)' }}>
              {r.practice.name}
            </Text>
            <Group gap={5}>
              <Clock size={11} style={{ color: 'var(--text-muted)' }} />
              <Text size="xs" style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {r.hora} · {r.fecha}
              </Text>
            </Group>
          </Stack>
        </Group>
        <Tooltip label="Cancelar reserva" withArrow>
          <ActionIcon variant="subtle" color="red" size="sm" onClick={onCancel}>
            <XCircle size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  );
};

// ── Página principal ─────────────────────────────────────────────────────────

const ReservasPage: React.FC = () => {
  const hoy = useMemo(() => new Date(), []);
  const [categories, setCategories] = useState<PracticeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [picked, setPicked] = useState<PracticeOption | null>(null);
  const [fecha, setFecha] = useState<Date>(hoy);
  const [slotSel, setSlotSel] = useState<string | null>(null);
  const [reservas, setReservas] = useState<ReservaConfirmada[]>([]);
  const [confirmando, setConfirmando] = useState(false);

  // Cargar prácticas desde el backend (mismo endpoint que PracticesPage)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cats = await invoke<PracticeCategory[]>('practicas_list_categories');
        if (!cancelled) setCategories(cats);
      } catch (err) {
        if (!cancelled) setError(`Error cargando prácticas: ${err}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allPractices: PracticeOption[] = useMemo(
    () => categories.flatMap(c => c.practices.map(p => ({ practice: p, category: c }))),
    [categories],
  );

  const fechaStr = formatFecha(fecha);

  const slots = useMemo(
    () => picked ? generarSlots(picked.practice.id, fechaStr, reservas) : [],
    [picked, fechaStr, reservas],
  );

  const proximoDisponible = useMemo(() => proximoLibre(slots), [slots]);
  const slotActual = slots.find(s => s.hora === slotSel);

  const diasSemana = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d = new Date(hoy); d.setDate(hoy.getDate() + i); return d;
  }), [hoy]);

  const irDia = (delta: number) => {
    const d = new Date(fecha); d.setDate(d.getDate() + delta);
    setFecha(d); setSlotSel(null);
  };

  const handlePick = (opt: PracticeOption) => {
    setPicked(opt);
    setFecha(hoy);
    setSlotSel(null);
  };

  const handleBack = () => {
    setPicked(null);
    setSlotSel(null);
  };

  const confirmarReserva = async () => {
    if (!picked || !slotSel || slotActual?.estado !== 'disponible') return;
    setConfirmando(true);
    await new Promise(r => setTimeout(r, 500));
    setReservas(prev => [...prev, {
      practice: picked.practice,
      categoryId: picked.category.id,
      fecha: fechaStr,
      hora: slotSel,
    }]);
    setSlotSel(null);
    setConfirmando(false);
  };

  // ── Renderizado ────────────────────────────────────────────────────────────

  return (
    <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
      <Container size="xl" pt={28} pb={60} px="xl">
        <Stack gap="xl">

          {/* ── Encabezado ── */}
          <Stack gap={4}>
            <Group gap="sm" align="center">
              <CalendarDays size={20} style={{ color: 'var(--accent-primary)' }} />
              <Title order={1} style={{ fontSize: '1.5rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                Reserva de Prácticas
              </Title>
            </Group>
            <Text size="sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {picked
                ? 'Elige el horario en el que quieres trabajar. Cada reserva bloquea el equipo durante 1 hora.'
                : 'Selecciona la práctica que quieres realizar. Luego elegirás día y horario.'}
            </Text>
          </Stack>

          {loading ? (
            <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
              <Stack align="center" gap="md">
                <Loader size="md" />
                <Text size="sm" style={{ color: 'var(--text-muted)' }}>Cargando prácticas...</Text>
              </Stack>
            </Box>
          ) : error ? (
            <Paper radius="md" p="md" style={{
              backgroundColor: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              <Text size="sm" style={{ color: 'var(--danger-text)' }}>{error}</Text>
            </Paper>
          ) : !picked ? (
            // ── PASO 1: Selección de práctica ──────────────────────────────
            <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="xl" style={{ alignItems: 'start' }}>
              <Stack gap="lg" style={{ gridColumn: 'span 2' }}>
                <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Prácticas disponibles
                </Text>

                {allPractices.length === 0 ? (
                  <Paper withBorder radius="md" p="xl" style={{
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: 'var(--background-secondary)',
                    textAlign: 'center',
                  }}>
                    <Text size="sm" style={{ color: 'var(--text-muted)' }}>
                      No hay prácticas configuradas todavía.
                    </Text>
                  </Paper>
                ) : (
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    {allPractices.map(opt => (
                      <PracticePickCard
                        key={`${opt.category.id}/${opt.practice.id}`}
                        opt={opt}
                        onClick={() => handlePick(opt)}
                      />
                    ))}
                  </SimpleGrid>
                )}
              </Stack>

              {/* Sidebar: Mis reservas */}
              <MisReservasPanel
                reservas={reservas}
                categories={categories}
                onCancel={(i) => setReservas(prev => prev.filter((_, j) => j !== i))}
              />
            </SimpleGrid>
          ) : (
            // ── PASO 2: Horarios para la práctica seleccionada ─────────────
            <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="xl" style={{ alignItems: 'start' }}>

              {/* Columna izquierda: práctica + fecha + slots */}
              <Stack gap="lg" style={{ gridColumn: 'span 2' }}>

                {/* Cabecera de práctica seleccionada */}
                <Paper radius="lg" p="md" style={{
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--background-secondary)',
                }}>
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Group gap="md" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
                      <Box style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        backgroundColor: 'var(--accent-primary-subtle)',
                        color: 'var(--accent-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {(() => {
                          const Icon = categoryIconMap[picked.category.icon] || Terminal;
                          return <Icon size={22} />;
                        })()}
                      </Box>
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Text size="xs" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                          {picked.category.name}
                        </Text>
                        <Text fw={600} size="md" lineClamp={1} style={{ color: 'var(--text-primary)' }}>
                          {picked.practice.name}
                        </Text>
                      </Stack>
                    </Group>
                    <Button
                      variant="subtle" color="gray" size="xs" radius="md"
                      leftSection={<ArrowLeft size={13} />}
                      onClick={handleBack}
                      style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                    >
                      Cambiar
                    </Button>
                  </Group>
                </Paper>

                {/* Banner: próximo disponible */}
                {proximoDisponible ? (
                  <Paper
                    radius="md" p="md"
                    style={{
                      backgroundColor: 'var(--accent-primary-subtle)',
                      border: '1px solid var(--accent-primary)',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <Box style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      backgroundColor: 'var(--accent-primary)', color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Zap size={18} />
                    </Box>
                    <Stack gap={2} style={{ flex: 1 }}>
                      <Text size="xs" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em', color: 'var(--accent-primary)' }}>
                        Próximo horario disponible
                      </Text>
                      <Text size="lg" fw={700} style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {proximoDisponible} – {String(parseInt(proximoDisponible) + 1).padStart(2, '0')}:00
                      </Text>
                    </Stack>
                    <Button
                      size="sm" radius="md"
                      style={{ backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none' }}
                      onClick={() => setSlotSel(proximoDisponible)}
                    >
                      Reservar
                    </Button>
                  </Paper>
                ) : (
                  <Paper radius="md" p="md" style={{
                    backgroundColor: 'var(--danger-bg)',
                    border: '1px solid var(--danger-border)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                    <Text size="sm" style={{ color: 'var(--danger-text)' }}>
                      No hay horarios disponibles para esta práctica el {labelFechaCorta(fecha)}. Prueba otro día.
                    </Text>
                  </Paper>
                )}

                {/* Selector de fecha */}
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                      Día
                    </Text>
                    <Group gap={4}>
                      <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => irDia(-1)} aria-label="Día anterior">
                        <ChevronLeft size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => irDia(1)} aria-label="Día siguiente">
                        <ChevronRight size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>

                  <Group gap="sm" wrap="nowrap" style={{ overflowX: 'auto', paddingBottom: 2 }}>
                    {diasSemana.map(d => {
                      const ds = formatFecha(d);
                      const activo = ds === fechaStr;
                      return (
                        <Box
                          key={ds}
                          component="button"
                          aria-pressed={activo}
                          onClick={() => { setFecha(d); setSlotSel(null); }}
                          style={{
                            all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                            padding: '8px 14px', borderRadius: 10, flexShrink: 0,
                            border: `1.5px solid ${activo ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                            backgroundColor: activo ? 'var(--accent-primary-subtle)' : 'var(--background-secondary)',
                            transition: 'border-color 150ms, background-color 150ms',
                          }}
                          onMouseEnter={e => { if (!activo) e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                          onMouseLeave={e => { if (!activo) e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                        >
                          <Text size="xs" tt="uppercase" fw={500} style={{ color: 'var(--text-muted)' }}>
                            {d.toLocaleDateString('es-CO', { weekday: 'short' })}
                          </Text>
                          <Text fw={activo ? 700 : 500} style={{
                            fontSize: 18, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                            color: activo ? 'var(--accent-primary)' : 'var(--text-primary)',
                          }}>
                            {d.getDate()}
                          </Text>
                        </Box>
                      );
                    })}
                  </Group>
                </Stack>

                {/* Grid de slots */}
                <Stack gap="sm">
                  <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                    <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                      Horarios — {labelFechaCorta(fecha)}
                    </Text>
                    <Leyenda />
                  </Group>

                  <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="xs">
                    {slots.map(slot => (
                      <SlotBtn
                        key={slot.hora}
                        slot={slot}
                        seleccionado={slotSel === slot.hora}
                        onClick={() => setSlotSel(slotSel === slot.hora ? null : slot.hora)}
                      />
                    ))}
                  </SimpleGrid>
                </Stack>
              </Stack>

              {/* Columna derecha: confirmación + mis reservas */}
              <Stack gap="lg">
                <Paper withBorder radius="lg" p="md" style={{
                  borderColor: 'var(--border-subtle)',
                  backgroundColor: 'var(--background-secondary)',
                }}>
                  <Stack gap="md">
                    <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>Confirmar reserva</Text>

                    {slotSel && slotActual?.estado === 'disponible' ? (
                      <Stack gap="sm">
                        <Stack gap={8} p="sm" style={{
                          backgroundColor: 'var(--background-tertiary)',
                          borderRadius: 8,
                          border: '1px solid var(--border-subtle)',
                        }}>
                          <Group gap={8} wrap="nowrap">
                            <Box style={{
                              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                              backgroundColor: 'var(--accent-primary-subtle)',
                              color: 'var(--accent-primary)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {(() => {
                                const Icon = categoryIconMap[picked.category.icon] || Terminal;
                                return <Icon size={14} />;
                              })()}
                            </Box>
                            <Text size="sm" fw={600} lineClamp={1} style={{ color: 'var(--text-primary)' }}>
                              {picked.practice.name}
                            </Text>
                          </Group>
                          <Group gap={6} align="center">
                            <CalendarDays size={12} style={{ color: 'var(--text-muted)' }} />
                            <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                              {labelFechaCorta(fecha)}
                            </Text>
                          </Group>
                          <Group gap={6} align="center">
                            <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                            <Text size="xs" style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                              {slotSel} – {String(parseInt(slotSel) + 1).padStart(2, '0')}:00 (1 hora)
                            </Text>
                          </Group>
                        </Stack>

                        <Button
                          fullWidth radius="md" size="sm"
                          loading={confirmando}
                          leftSection={<Plus size={14} />}
                          onClick={confirmarReserva}
                          style={{ backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none' }}
                        >
                          {confirmando ? 'Reservando...' : 'Confirmar reserva'}
                        </Button>

                        <Button
                          fullWidth variant="subtle" color="gray" radius="md" size="xs"
                          onClick={() => setSlotSel(null)}
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          Cancelar
                        </Button>
                      </Stack>
                    ) : (
                      <Box style={{
                        padding: '24px 12px', textAlign: 'center',
                        border: '1px dashed var(--border-strong)', borderRadius: 8,
                      }}>
                        <Clock size={26} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                        <Text size="xs" style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
                          Selecciona un horario disponible para continuar
                        </Text>
                      </Box>
                    )}
                  </Stack>
                </Paper>

                <Divider style={{ borderColor: 'var(--border-subtle)' }} />

                <MisReservasPanel
                  reservas={reservas}
                  categories={categories}
                  onCancel={(i) => setReservas(prev => prev.filter((_, j) => j !== i))}
                />
              </Stack>
            </SimpleGrid>
          )}

        </Stack>
      </Container>
    </Box>
  );
};

// ── Sub-panel: Mis reservas (reutilizable entre paso 1 y paso 2) ────────────

const MisReservasPanel: React.FC<{
  reservas: ReservaConfirmada[];
  categories: PracticeCategory[];
  onCancel: (index: number) => void;
}> = ({ reservas, categories, onCancel }) => (
  <Stack gap="sm">
    <Group justify="space-between" align="center">
      <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>Mis reservas</Text>
      {reservas.length > 0 && (
        <Badge
          size="sm"
          style={{
            backgroundColor: 'var(--accent-primary-subtle)',
            color: 'var(--accent-primary)',
            border: '1px solid var(--accent-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {reservas.length}
        </Badge>
      )}
    </Group>

    {reservas.length === 0 ? (
      <Paper withBorder radius="md" p="md" style={{
        textAlign: 'center',
        borderColor: 'var(--border-subtle)',
        backgroundColor: 'var(--background-secondary)',
      }}>
        <Text size="xs" style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
          No tienes reservas activas.<br />Elige una práctica para empezar.
        </Text>
      </Paper>
    ) : (
      <ScrollArea.Autosize mah={360}>
        <Stack gap="xs">
          {reservas.map((r, i) => (
            <ReservaItem
              key={i}
              r={r}
              category={categories.find(c => c.id === r.categoryId)}
              onCancel={() => onCancel(i)}
            />
          ))}
        </Stack>
      </ScrollArea.Autosize>
    )}
  </Stack>
);

export default ReservasPage;
