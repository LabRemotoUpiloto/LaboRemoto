import React, { useState, useMemo } from 'react';
import {
  Box, Container, Title, Text, Stack, Group, SimpleGrid,
  Paper, Button, ActionIcon, Tooltip, ScrollArea, Badge,
  Divider, ThemeIcon,
} from '@mantine/core';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock,
  FlaskConical, Monitor, Cpu, Bot, CheckCircle2,
  XCircle, AlertCircle, Plus, Info, Zap,
} from 'lucide-react';

// ── Tipos ────────────────────────────────────────────────────────────────────

type EstadoSlot = 'disponible' | 'ocupado' | 'mi-reserva' | 'bloqueado';

interface Slot { hora: string; estado: EstadoSlot; practica?: string; }
interface Laboratorio {
  id: string; nombre: string;
  tipo: 'robot' | 'linux' | 'circuitos' | 'iot';
  capacidad: number; descripcion: string;
}
interface ReservaConfirmada { lab: Laboratorio; fecha: string; hora: string; }

// ── Datos ────────────────────────────────────────────────────────────────────

const LABORATORIOS: Laboratorio[] = [
  { id: 'eve3',     nombre: 'Robot Eve3',      tipo: 'robot',     capacidad: 1, descripcion: 'Robot de brazo articulado para prácticas de control y cinemática.' },
  { id: 'linux-a',  nombre: 'Linux A',          tipo: 'linux',     capacidad: 8, descripcion: 'Servidores Linux para prácticas de redes y administración de sistemas.' },
  { id: 'linux-b',  nombre: 'Linux B',          tipo: 'linux',     capacidad: 8, descripcion: 'Servidores Linux para prácticas de redes y administración de sistemas.' },
  { id: 'circuitos',nombre: 'Circuitos',        tipo: 'circuitos', capacidad: 4, descripcion: 'Estaciones con FPGA y osciloscopios para diseño digital.' },
  { id: 'iot',      nombre: 'IoT / Raspberry',  tipo: 'iot',       capacidad: 6, descripcion: 'Kits Raspberry Pi para domótica e IoT.' },
];

const HORAS = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

function generarSlots(labId: string, fecha: string): Slot[] {
  const semilla = labId.charCodeAt(0) + fecha.charCodeAt(8);
  return HORAS.map((hora, i) => {
    const n = (semilla + i * 7) % 10;
    if (hora === '12:00') return { hora, estado: 'bloqueado' };
    if (labId === 'eve3' && (i === 2 || i === 5)) return { hora, estado: 'mi-reserva', practica: 'Control Eve3 — P1' };
    if (n < 3) return { hora, estado: 'ocupado' };
    return { hora, estado: 'disponible' };
  });
}

function formatFecha(d: Date) { return d.toISOString().split('T')[0]; }
function labelFechaCorta(d: Date) {
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Helpers de disponibilidad ────────────────────────────────────────────────

function horaActual() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function proximoLibre(slots: Slot[]): string | null {
  const ahora = horaActual();
  for (const s of slots) {
    const [h, m] = s.hora.split(':').map(Number);
    const mins = h * 60 + m;
    if (mins >= ahora && s.estado === 'disponible') return s.hora;
  }
  return null;
}

function estadoAhora(slots: Slot[]): EstadoSlot {
  const ahora = horaActual();
  for (const s of slots) {
    const [h] = s.hora.split(':').map(Number);
    if (h === new Date().getHours()) return s.estado;
  }
  return 'disponible';
}

// ── Colores del tema (sin depender de Mantine hardcoded) ─────────────────────

const TIPO_ACCENT: Record<Laboratorio['tipo'], { bg: string; color: string }> = {
  robot:     { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
  linux:     { bg: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)' },
  circuitos: { bg: 'rgba(249,115,22,0.12)',  color: '#f97316' },
  iot:       { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
};

const ESTADO_CFG: Record<EstadoSlot, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  disponible:   { bg: 'var(--success-bg)',  border: 'var(--success-border)', text: 'var(--success-text)',  icon: <CheckCircle2 size={11}/> },
  'mi-reserva': { bg: 'var(--info-bg)',     border: 'var(--info-border)',    text: 'var(--info-text)',     icon: <CheckCircle2 size={11}/> },
  ocupado:      { bg: 'var(--danger-bg)',   border: 'var(--danger-border)',  text: 'var(--danger-text)',   icon: <XCircle size={11}/> },
  bloqueado:    { bg: 'var(--interactive-hover)', border: 'var(--border-subtle)', text: 'var(--text-muted)', icon: <AlertCircle size={11}/> },
};

// ── Sub-componente: tarjeta de lab ───────────────────────────────────────────

const LabCard: React.FC<{
  lab: Laboratorio;
  activo: boolean;
  slots: Slot[];
  onClick: () => void;
}> = ({ lab, activo, slots, onClick }) => {
  const accent = TIPO_ACCENT[lab.tipo];
  const libre = proximoLibre(slots);
  const ahora = estadoAhora(slots);
  const disponibleAhora = ahora === 'disponible' || ahora === 'mi-reserva';

  return (
    <Box
      component="button"
      onClick={onClick}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        cursor: 'pointer',
        display: 'block',
        padding: '12px 14px',
        borderRadius: 12,
        border: `1.5px solid ${activo ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
        backgroundColor: activo ? 'var(--accent-primary-subtle)' : 'var(--background-secondary)',
        transition: 'border-color 150ms, background-color 150ms',
        width: '100%',
        textAlign: 'left',
      }}
      onMouseEnter={e => { if (!activo) e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
      onMouseLeave={e => { if (!activo) e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
    >
      <Group justify="space-between" wrap="nowrap" mb={6}>
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <Box style={{
            width: 30, height: 30, borderRadius: 8, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            backgroundColor: accent.bg, color: accent.color,
          }}>
            {lab.tipo === 'robot' ? <Bot size={15}/> : lab.tipo === 'linux' ? <Monitor size={15}/> : lab.tipo === 'circuitos' ? <Cpu size={15}/> : <FlaskConical size={15}/>}
          </Box>
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} truncate style={{ color: 'var(--text-primary)' }}>{lab.nombre}</Text>
            <Text size="xs" style={{ color: 'var(--text-muted)' }}>Cap. {lab.capacidad}</Text>
          </Stack>
        </Group>
        {/* Pill de estado */}
        <Box style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
          borderRadius: 99, flexShrink: 0,
          backgroundColor: disponibleAhora ? 'var(--success-bg)' : 'var(--danger-bg)',
          border: `1px solid ${disponibleAhora ? 'var(--success-border)' : 'var(--danger-border)'}`,
        }}>
          <Box style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: disponibleAhora ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }} />
          <Text size="xs" fw={500} style={{ color: disponibleAhora ? 'var(--success-text)' : 'var(--danger-text)', whiteSpace: 'nowrap' }}>
            {disponibleAhora ? 'Disponible' : libre ? `Libre ${libre}` : 'Sin slots'}
          </Text>
        </Box>
      </Group>
    </Box>
  );
};

// ── Sub-componente: slot horario ─────────────────────────────────────────────

const SlotBtn: React.FC<{ slot: Slot; seleccionado: boolean; onClick: () => void }> = ({ slot, seleccionado, onClick }) => {
  const cfg = ESTADO_CFG[slot.estado];
  const interactivo = slot.estado === 'disponible' || slot.estado === 'mi-reserva';

  return (
    <Tooltip label={slot.practica ?? cfg.icon} withArrow position="top" disabled={slot.estado === 'disponible'}>
      <Box
        component="button"
        onClick={interactivo ? onClick : undefined}
        style={{
          all: 'unset', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 10px', borderRadius: 8, width: '100%',
          cursor: interactivo ? 'pointer' : 'default',
          border: `1px solid ${seleccionado ? 'var(--accent-primary)' : cfg.border}`,
          backgroundColor: seleccionado ? 'var(--accent-primary-subtle)' : cfg.bg,
          opacity: slot.estado === 'bloqueado' ? 0.5 : 1,
          transition: 'border-color 150ms, background-color 150ms',
        }}
      >
        <Box style={{ color: seleccionado ? 'var(--accent-primary)' : cfg.text, display: 'flex', flexShrink: 0 }}>{cfg.icon}</Box>
        <Text size="xs" fw={500} style={{ fontVariantNumeric: 'tabular-nums', color: seleccionado ? 'var(--accent-primary)' : cfg.text }}>
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

const Leyenda = () => (
  <Group gap={10} wrap="wrap">
    {(Object.entries(ESTADO_CFG) as [EstadoSlot, typeof ESTADO_CFG[EstadoSlot]][]).map(([key, cfg]) => (
      <Group key={key} gap={4} align="center">
        <Box style={{ color: cfg.text, display: 'flex' }}>{cfg.icon}</Box>
        <Text size="xs" style={{ color: 'var(--text-muted)' }}>
          {key === 'disponible' ? 'Disponible' : key === 'mi-reserva' ? 'Mi reserva' : key === 'ocupado' ? 'Ocupado' : 'Bloqueado'}
        </Text>
      </Group>
    ))}
  </Group>
);

// ── Página principal ─────────────────────────────────────────────────────────

const ReservasPage: React.FC = () => {
  const hoy = new Date();
  const [fecha, setFecha] = useState(hoy);
  const [labSel, setLabSel] = useState<Laboratorio>(LABORATORIOS[0]);
  const [slotSel, setSlotSel] = useState<string | null>(null);
  const [reservas, setReservas] = useState<ReservaConfirmada[]>([]);
  const [confirmando, setConfirmando] = useState(false);

  const fechaStr = formatFecha(fecha);
  const hoyStr = formatFecha(hoy);
  const slots = useMemo(() => generarSlots(labSel.id, fechaStr), [labSel.id, fechaStr]);

  // Slots de hoy para calcular disponibilidad en las tarjetas de lab
  const slotsPorLab = useMemo(() =>
    Object.fromEntries(LABORATORIOS.map(l => [l.id, generarSlots(l.id, hoyStr)])),
    [hoyStr]
  );

  const diasSemana = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d = new Date(hoy); d.setDate(hoy.getDate() + i); return d;
  }), []);

  const proximoDisponible = useMemo(() => proximoLibre(slots), [slots]);
  const slotActual = slots.find(s => s.hora === slotSel);

  const irDia = (delta: number) => {
    const d = new Date(fecha); d.setDate(d.getDate() + delta);
    setFecha(d); setSlotSel(null);
  };

  const confirmarReserva = async () => {
    if (!slotSel || !slotActual) return;
    setConfirmando(true);
    await new Promise(r => setTimeout(r, 600));
    setReservas(prev => [...prev, { lab: labSel, fecha: fechaStr, hora: slotSel }]);
    setSlotSel(null);
    setConfirmando(false);
  };

  return (
    <Box w="100%" h="100%" style={{ overflow: 'auto', backgroundColor: 'var(--background-primary)' }}>
      <Container size="xl" pt={28} pb={60} px="xl">
        <Stack gap="xl">

          {/* ── Encabezado ── */}
          <Stack gap={4}>
            <Group gap="sm" align="center">
              <CalendarDays size={20} style={{ color: 'var(--accent-primary)' }} />
              <Title order={1} style={{ fontSize: '1.5rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                Reserva de Laboratorios
              </Title>
            </Group>
            <Text size="sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Reserva un horario para trabajar en los equipos del laboratorio remoto.
              Cada reserva bloquea el acceso exclusivo durante 1 hora.
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="xl" style={{ alignItems: 'start' }}>

            {/* ── Columna izquierda ── */}
            <Stack gap="lg" style={{ gridColumn: 'span 2' }}>

              {/* 1. Selección de laboratorio */}
              <Stack gap="xs">
                <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Laboratorio
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
                  {LABORATORIOS.map(lab => (
                    <LabCard
                      key={lab.id}
                      lab={lab}
                      activo={lab.id === labSel.id}
                      slots={slotsPorLab[lab.id]}
                      onClick={() => { setLabSel(lab); setSlotSel(null); }}
                    />
                  ))}
                </SimpleGrid>
                <Group gap={6} align="flex-start" mt={2}>
                  <Info size={13} style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }} />
                  <Text size="xs" style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>{labSel.descripcion}</Text>
                </Group>
              </Stack>

              <Divider style={{ borderColor: 'var(--border-subtle)' }} />

              {/* 2. Próximo disponible — banner destacado */}
              {proximoDisponible ? (
                <Paper
                  radius="md"
                  p="md"
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
                    size="sm"
                    radius="md"
                    style={{ backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none' }}
                    onClick={() => setSlotSel(proximoDisponible)}
                  >
                    Reservar
                  </Button>
                </Paper>
              ) : (
                <Paper radius="md" p="md" style={{ backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                  <Text size="sm" style={{ color: 'var(--danger-text)' }}>
                    No hay horarios disponibles para <strong>{labSel.nombre}</strong> hoy. Selecciona otro día.
                  </Text>
                </Paper>
              )}

              {/* 3. Selector de fecha */}
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                    Semana actual
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

              {/* 4. Grid de slots */}
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

            {/* ── Columna derecha ── */}
            <Stack gap="lg">

              {/* Panel de confirmación */}
              <Paper withBorder radius="lg" p="md" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--background-secondary)' }}>
                <Stack gap="md">
                  <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>Confirmar reserva</Text>

                  {slotSel && slotActual?.estado === 'disponible' ? (
                    <Stack gap="sm">
                      <Stack gap={8} p="sm" style={{ backgroundColor: 'var(--background-tertiary)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                        <Group gap={8} wrap="nowrap">
                          <Box style={{
                            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                            backgroundColor: TIPO_ACCENT[labSel.tipo].bg,
                            color: TIPO_ACCENT[labSel.tipo].color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {labSel.tipo === 'robot' ? <Bot size={14}/> : labSel.tipo === 'linux' ? <Monitor size={14}/> : labSel.tipo === 'circuitos' ? <Cpu size={14}/> : <FlaskConical size={14}/>}
                          </Box>
                          <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>{labSel.nombre}</Text>
                        </Group>
                        <Group gap={6} align="center">
                          <CalendarDays size={12} style={{ color: 'var(--text-muted)' }} />
                          <Text size="xs" style={{ color: 'var(--text-secondary)' }}>{labelFechaCorta(fecha)}</Text>
                        </Group>
                        <Group gap={6} align="center">
                          <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                          <Text size="xs" style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                            {slotSel} – {String(parseInt(slotSel) + 1).padStart(2, '0')}:00 (1 hora)
                          </Text>
                        </Group>
                      </Stack>

                      <Button
                        fullWidth
                        radius="md"
                        size="sm"
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
                      <CalendarDays size={26} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                      <Text size="xs" style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
                        Selecciona un horario disponible en el calendario para continuar
                      </Text>
                    </Box>
                  )}
                </Stack>
              </Paper>

              {/* Mis reservas */}
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>Mis reservas</Text>
                  <Badge
                    size="sm"
                    style={{ backgroundColor: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {reservas.length}
                  </Badge>
                </Group>

                {reservas.length === 0 ? (
                  <Paper withBorder radius="md" p="md" style={{ textAlign: 'center', borderColor: 'var(--border-subtle)', backgroundColor: 'var(--background-secondary)' }}>
                    <Text size="xs" style={{ color: 'var(--text-muted)', lineHeight: 1.55 }}>
                      No tienes reservas activas.<br />Selecciona un horario para comenzar.
                    </Text>
                  </Paper>
                ) : (
                  <ScrollArea.Autosize mah={300}>
                    <Stack gap="xs">
                      {reservas.map((r, i) => (
                        <Paper key={i} withBorder radius="md" p="sm" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--background-secondary)' }}>
                          <Group justify="space-between" wrap="nowrap">
                            <Group gap="sm" wrap="nowrap">
                              <Box style={{
                                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                backgroundColor: TIPO_ACCENT[r.lab.tipo].bg,
                                color: TIPO_ACCENT[r.lab.tipo].color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {r.lab.tipo === 'robot' ? <Bot size={14}/> : r.lab.tipo === 'linux' ? <Monitor size={14}/> : r.lab.tipo === 'circuitos' ? <Cpu size={14}/> : <FlaskConical size={14}/>}
                              </Box>
                              <Stack gap={2}>
                                <Text size="sm" fw={600} lineClamp={1} style={{ color: 'var(--text-primary)' }}>{r.lab.nombre}</Text>
                                <Group gap={5}>
                                  <Clock size={11} style={{ color: 'var(--text-muted)' }} />
                                  <Text size="xs" style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                    {r.hora} · {r.fecha}
                                  </Text>
                                </Group>
                              </Stack>
                            </Group>
                            <Tooltip label="Cancelar reserva" withArrow>
                              <ActionIcon variant="subtle" color="red" size="sm" onClick={() => setReservas(prev => prev.filter((_, j) => j !== i))}>
                                <XCircle size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  </ScrollArea.Autosize>
                )}
              </Stack>

            </Stack>
          </SimpleGrid>
        </Stack>
      </Container>
    </Box>
  );
};

export default ReservasPage;
