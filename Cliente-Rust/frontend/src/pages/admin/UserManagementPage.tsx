import React, { useEffect, useMemo, useState } from 'react';
import { adminService, KeycloakUser } from '../../services/admin.service';
import { Container, Title, Text, TextInput, Stack, Group, ActionIcon, Loader, Box, Select, Paper } from '@mantine/core';
import { X, Search, Users } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import Swal from 'sweetalert2';

// ─── Modelo: UN rol por persona ──────────────────────────────────────────────
// Keycloak permite múltiples realm roles, pero aquí cada persona tiene un
// rol efectivo (el de mayor privilegio). Cambiarlo asigna el nuevo y quita
// los demás; "Estudiante" = no tener ninguno de los especiales.

const specialRoles = ['admin_lab', 'semillerista', 'laboratorista'];

const ROLE_LABELS: Record<string, string> = {
    estudiante: 'Estudiante',
    semillerista: 'Semillerista',
    laboratorista: 'Laboratorista',
    admin_lab: 'Administrador',
};

// Mayor privilegio primero.
const roleOrder = ['admin_lab', 'laboratorista', 'semillerista', 'estudiante'];
const ROLE_SELECT_OPTIONS = roleOrder.map(r => ({ value: r, label: ROLE_LABELS[r] }));
const FILTER_OPTIONS = [{ value: 'all', label: 'Todos los roles' }, ...ROLE_SELECT_OPTIONS];

function effectiveRole(activeSpecialRoles: string[]): string {
    if (activeSpecialRoles.includes('admin_lab')) return 'admin_lab';
    if (activeSpecialRoles.includes('laboratorista')) return 'laboratorista';
    if (activeSpecialRoles.includes('semillerista')) return 'semillerista';
    return 'estudiante';
}

function fullNameOf(user: KeycloakUser) {
    return user.firstName || user.lastName
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : '';
}

function initialsOf(user: KeycloakUser) {
    const fn = fullNameOf(user);
    if (fn) return fn.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
    return (user.username || user.email || 'U').slice(0, 2).toUpperCase();
}

function formatDate(ms?: number) {
    if (!ms) return '—';
    try { return new Date(ms).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return '—'; }
}

// El avatar deriva un tono estable del nombre — variedad visual sin asignar
// color por rol (eso sería volver a los badges de colores). Es solo
// decoración del avatar, el dato real (rol) va aparte en texto.
const AVATAR_TINTS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];
function tintOf(user: KeycloakUser) {
    const key = user.username || user.id;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

interface Row { user: KeycloakUser; role: string; }

// ─── Fila ────────────────────────────────────────────────────────────────────

interface PersonRowProps {
    row: Row;
    onChangeRole: (user: KeycloakUser, currentRole: string, newRole: string) => void;
    last: boolean;
}

const PersonRow: React.FC<PersonRowProps> = ({ row, onChangeRole, last }) => {
    const { user, role } = row;
    const tint = tintOf(user);
    return (
        <Group
            wrap="nowrap"
            align="center"
            px="lg"
            py="md"
            className="person-row"
            style={{ borderBottom: last ? 'none' : '1px solid var(--border-subtle)' }}
        >
            {/* Usuario */}
            <Group gap={12} wrap="nowrap" style={{ flex: 2.4, minWidth: 0 }}>
                <Box
                    style={{
                        width: 40, height: 40, borderRadius: 999, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, color: '#fff',
                        background: `color-mix(in srgb, ${tint} 82%, #000 8%)`,
                    }}
                    aria-hidden
                >
                    {initialsOf(user)}
                </Box>
                <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>{fullNameOf(user) || user.username}</Text>
                    <Text size="xs" c="dimmed" truncate>{user.email || user.username}</Text>
                </div>
            </Group>

            {/* Rol (texto, sin badge) */}
            <Text size="sm" fw={500} style={{ flex: 1.1, minWidth: 0 }} truncate>{ROLE_LABELS[role]}</Text>

            {/* Fecha registro */}
            <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 0 }} truncate visibleFrom="sm">
                {formatDate(user.createdTimestamp)}
            </Text>

            {/* Acciones: selector de rol */}
            <Box style={{ flexShrink: 0 }}>
                <Select
                    aria-label={`Cambiar rol de ${user.username}`}
                    data={ROLE_SELECT_OPTIONS}
                    value={role}
                    onChange={(newRole) => { if (newRole && newRole !== role) onChangeRole(user, role, newRole); }}
                    allowDeselect={false}
                    size="sm"
                    w={168}
                    comboboxProps={{ withinPortal: true }}
                    styles={{
                        input: {
                            background: 'var(--background-secondary)',
                            border: '1px solid var(--border-subtle)',
                            fontWeight: 500,
                        },
                    }}
                />
            </Box>
        </Group>
    );
};

// ─── Página ──────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
    const [query, setQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');

    // Se carga el universo completo una vez: usuarios por cada rol especial +
    // todos los usuarios (para derivar Estudiante). Con eso se arma una lista
    // plana con el rol efectivo de cada quien — el filtro y la búsqueda son
    // del lado del cliente, instantáneos.
    const [roleMembers, setRoleMembers] = useState<Record<string, KeycloakUser[]>>({});
    const [allUsers, setAllUsers] = useState<KeycloakUser[]>([]);
    const [loading, setLoading] = useState(true);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [special, all] = await Promise.all([
                Promise.all(specialRoles.map(r => adminService.listUsersByRole(r).then(us => [r, us] as const))),
                adminService.listAllUsers(),
            ]);
            setRoleMembers(Object.fromEntries(special));
            setAllUsers(all);
        } catch (err: any) {
            notifications.show({ title: 'Error', message: err.toString(), color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadAll();
    }, []);

    // Lista plana: cada usuario con su rol efectivo, ordenada por privilegio.
    const rows: Row[] = useMemo(() => {
        const roleById = new Map<string, string>();
        for (const r of specialRoles) {
            for (const u of roleMembers[r] || []) {
                // Si ya tiene uno más alto asignado, no lo pises (precedencia).
                if (!roleById.has(u.id)) roleById.set(u.id, r);
                else roleById.set(u.id, effectiveRole([roleById.get(u.id)!, r]));
            }
        }
        const all = allUsers.length > 0 ? allUsers : Object.values(roleMembers).flat();
        // dedup por id (allUsers ya es el universo; el fallback puede repetir)
        const seen = new Set<string>();
        const list: Row[] = [];
        for (const u of all) {
            if (seen.has(u.id)) continue;
            seen.add(u.id);
            list.push({ user: u, role: roleById.get(u.id) || 'estudiante' });
        }
        list.sort((a, b) => {
            const ra = roleOrder.indexOf(a.role), rb = roleOrder.indexOf(b.role);
            if (ra !== rb) return ra - rb;
            return (fullNameOf(a.user) || a.user.username).localeCompare(fullNameOf(b.user) || b.user.username);
        });
        return list;
    }, [roleMembers, allUsers]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: rows.length };
        for (const r of roleOrder) c[r] = 0;
        for (const row of rows) c[row.role]++;
        return c;
    }, [rows]);

    const filteredRows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter(({ user, role }) => {
            if (roleFilter !== 'all' && role !== roleFilter) return false;
            if (!q) return true;
            return (user.username || '').toLowerCase().includes(q)
                || (user.email || '').toLowerCase().includes(q)
                || fullNameOf(user).toLowerCase().includes(q);
        });
    }, [rows, query, roleFilter]);

    const escapeHtml = (value: string) => value
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

    const changeRole = async (user: KeycloakUser, currentRole: string, newRole: string) => {
        const userLabel = user.username || user.email || 'este usuario';
        const result = await Swal.fire({
            html: `
                <style>
                    .role-confirm-popup { padding:0!important; border-radius:14px!important; background:var(--background-secondary)!important; color:var(--text-primary)!important; border:1px solid var(--border-subtle)!important; box-shadow:var(--shadow)!important; width:min(92vw,440px)!important; }
                    .role-confirm-html { margin:0!important; padding:0!important; }
                    .role-confirm-shell { text-align:left; padding:24px 24px 8px; }
                    .role-confirm-title { color:var(--text-primary); font-size:20px; font-weight:700; margin-bottom:12px; }
                    .role-confirm-copy { color:var(--text-secondary); font-size:15px; line-height:1.6; }
                    .role-confirm-copy strong { color:var(--text-primary); }
                    .role-confirm-actions { gap:10px!important; margin:0!important; padding:16px 24px 22px!important; justify-content:flex-end!important; }
                    .role-confirm-confirm, .role-confirm-cancel { border-radius:8px; min-width:110px; min-height:44px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer; }
                    .role-confirm-confirm { border:0; background:var(--accent-primary); color:var(--text-inverse); }
                    .role-confirm-cancel { background:transparent; color:var(--text-secondary); border:1px solid var(--border-subtle); }
                    .role-confirm-confirm:focus-visible, .role-confirm-cancel:focus-visible { outline:2px solid var(--accent-primary); outline-offset:2px; }
                </style>
                <div class="role-confirm-shell">
                    <div class="role-confirm-title">¿Cambiar rol?</div>
                    <div class="role-confirm-copy">
                        <strong>${escapeHtml(userLabel)}</strong> pasará de
                        <strong>${escapeHtml(ROLE_LABELS[currentRole])}</strong> a
                        <strong>${escapeHtml(ROLE_LABELS[newRole])}</strong>.
                        Esto cambia lo que puede ver y hacer en la aplicación.
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Cambiar rol',
            cancelButtonText: 'Cancelar',
            buttonsStyling: false,
            reverseButtons: true,
            customClass: {
                container: 'swal-fullscreen', popup: 'role-confirm-popup', htmlContainer: 'role-confirm-html',
                actions: 'role-confirm-actions', confirmButton: 'role-confirm-confirm', cancelButton: 'role-confirm-cancel',
            },
        });
        if (!result.isConfirmed) return;

        try {
            if (newRole !== 'estudiante') await adminService.toggleUserRole(user.id, newRole, true);
            for (const roleName of specialRoles) {
                if (roleName !== newRole && (roleMembers[roleName] || []).some(u => u.id === user.id)) {
                    await adminService.toggleUserRole(user.id, roleName, false);
                }
            }
            await loadAll();
            notifications.show({ title: 'Rol actualizado', message: `${user.username} ahora es ${ROLE_LABELS[newRole]}.`, color: 'green' });
        } catch (err: any) {
            notifications.show({ title: 'Error', message: `Error cambiando rol: ${err.toString()}`, color: 'red' });
        }
    };

    return (
        <Container size="lg" py="xl" px="xl" h="100%" style={{ overflow: 'auto' }}>
            <style>{`.person-row:hover { background: var(--background-tertiary, var(--background-secondary)); }`}</style>
            <Stack gap="lg">
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                    <Group gap={12} align="center" wrap="nowrap">
                        <Users size={26} style={{ color: 'var(--accent-primary)' }} aria-hidden />
                        <div>
                            <Title order={1} style={{ fontSize: 26, letterSpacing: '-.02em' }}>Gestión de Usuarios</Title>
                            <Text size="sm" c="dimmed">Administra los roles y accesos de las personas registradas.</Text>
                        </div>
                    </Group>
                    <TextInput
                        radius="xl"
                        placeholder="Buscar usuario…"
                        aria-label="Buscar usuario"
                        value={query}
                        onChange={(e) => setQuery(e.currentTarget.value)}
                        leftSection={<Search size={16} aria-hidden />}
                        rightSection={query && (
                            <ActionIcon variant="subtle" color="gray" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">
                                <X size={14} />
                            </ActionIcon>
                        )}
                        w={280}
                        styles={{ input: { background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)' } }}
                    />
                </Group>

                <Group gap="sm" justify="space-between" wrap="wrap">
                    <Select
                        aria-label="Filtrar por rol"
                        data={FILTER_OPTIONS.map(o => ({
                            value: o.value,
                            label: `${o.label}${loading ? '' : ` (${counts[o.value] ?? 0})`}`,
                        }))}
                        value={roleFilter}
                        onChange={(v) => setRoleFilter(v || 'all')}
                        allowDeselect={false}
                        w={230}
                        comboboxProps={{ withinPortal: true }}
                        styles={{ input: { background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)', fontWeight: 600 } }}
                    />
                    <Text size="sm" c="dimmed">
                        {loading ? 'Cargando…' : `${filteredRows.length} ${filteredRows.length === 1 ? 'persona' : 'personas'}`}
                    </Text>
                </Group>

                <Paper radius="lg" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                    {/* Encabezados */}
                    <Group wrap="nowrap" px="lg" py="sm" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--background-tertiary, transparent)' }}>
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ flex: 2.4, letterSpacing: '.05em' }}>Usuario</Text>
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ flex: 1.1, letterSpacing: '.05em' }}>Rol</Text>
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ flex: 1, letterSpacing: '.05em' }} visibleFrom="sm">Fecha registro</Text>
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ width: 168, textAlign: 'right', letterSpacing: '.05em' }}>Acciones</Text>
                    </Group>

                    {loading ? (
                        <Group py={48} justify="center"><Loader size="sm" /><Text size="sm" c="dimmed">Cargando usuarios…</Text></Group>
                    ) : filteredRows.length === 0 ? (
                        <Text size="sm" c="dimmed" ta="center" py={48}>
                            {query.trim() ? 'No se encontró a nadie con ese nombre.' : 'No hay personas en esta vista.'}
                        </Text>
                    ) : (
                        filteredRows.map((row, i) => (
                            <PersonRow key={row.user.id} row={row} onChangeRole={changeRole} last={i === filteredRows.length - 1} />
                        ))
                    )}
                </Paper>
            </Stack>
        </Container>
    );
}
