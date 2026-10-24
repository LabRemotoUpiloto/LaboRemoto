import { afterEach, describe, expect, it } from 'vitest';
import { ASSIGNABLE_ROLES, canAccessPage, getEffectiveRole, puedeAdministrarCamaras, puedeVerComo, rolVerComo, setRolVerComo } from '@/features/cuenta/usePermissions';
import { useAppStore } from '../../src/store/app';

describe('rol docente', () => {
  it('lo reconoce venga del directorio (user_type) o asignado a mano: ambos llegan en roles', () => {
    expect(getEffectiveRole(['docente'])).toBe('docente');
  });

  it('es asignable desde Gestión de Usuarios', () => {
    expect(ASSIGNABLE_ROLES).toContain('docente');
  });

  it('un rol de personal pesa más que docente', () => {
    expect(getEffectiveRole(['docente', 'laboratorista'])).toBe('laboratorista');
    expect(getEffectiveRole(['docente', 'semillerista'])).toBe('semillerista');
  });

  it('pesa más que estudiante y sin roles sigue siendo estudiante', () => {
    expect(getEffectiveRole(['docente', 'estudiante'])).toBe('docente');
    expect(getEffectiveRole([])).toBe('estudiante');
  });

  it('no es personal del laboratorio: sin vigilancia (cámaras), dashboard ni administración', () => {
    for (const page of ['vigilancia', 'dashboard', 'encuestas', 'admin-users', 'connect', 'hosts']) {
      expect(canAccessPage(page, 'docente'), page).toBe(false);
    }
  });

  it('ve prácticas, mis cursos y logs; el estudiante no ve logs ni mis cursos', () => {
    for (const page of ['practices', 'mis-cursos', 'logs']) {
      expect(canAccessPage(page, 'docente'), page).toBe(true);
    }
    expect(canAccessPage('logs', 'estudiante')).toBe(false);
    expect(canAccessPage('mis-cursos', 'estudiante')).toBe(false);
    expect(canAccessPage('practices', 'estudiante')).toBe(true);
  });

  it('la terminal local es solo de semillerista y admin_lab', () => {
    for (const role of ['docente', 'estudiante', 'laboratorista', 'jefe_laboratorio', 'coordinador_laboratorio'] as const) {
      expect(canAccessPage('local-terminal-new', role), role).toBe(false);
    }
    expect(canAccessPage('local-terminal-new', 'semillerista')).toBe(true);
    expect(canAccessPage('local-terminal-new', 'admin_lab')).toBe(true);
  });

  it('solo el administrador gestiona cámaras (crear, editar, eliminar, claves)', () => {
    expect(puedeAdministrarCamaras('admin_lab')).toBe(true);
    for (const role of ['jefe_laboratorio', 'coordinador_laboratorio', 'laboratorista', 'semillerista', 'docente', 'estudiante'] as const) {
      expect(puedeAdministrarCamaras(role), role).toBe(false);
    }
  });

  it('Reservas está oculta solo para los estudiantes mientras se termina', () => {
    expect(canAccessPage('reservas', 'estudiante')).toBe(false);
    for (const role of ['admin_lab', 'docente', 'laboratorista'] as const) {
      expect(canAccessPage('reservas', role), role).toBe(true);
    }
  });
});

describe('«Ver como»: solo para administradores y solo de vista', () => {
  const entrarCon = (roles: string[]) =>
    useAppStore.setState({ user: { preferred_username: 'prueba', user_type: '', roles, access_expires_at: 0 } as never });
  afterEach(() => { setRolVerComo(null); useAppStore.setState({ user: null as never }); });

  it('solo lo puede usar quien tiene el rol REAL de administrador', () => {
    expect(puedeVerComo(['admin_lab'])).toBe(true);
    for (const r of ['jefe_laboratorio', 'coordinador_laboratorio', 'laboratorista', 'semillerista', 'docente']) {
      expect(puedeVerComo([r])).toBe(false);
    }
    expect(puedeVerComo([])).toBe(false);
    expect(puedeVerComo(undefined)).toBe(false);
  });

  it('un administrador puede mirar la app como otro rol y volver a su rol real', () => {
    entrarCon(['admin_lab']);
    setRolVerComo('estudiante');
    expect(rolVerComo()).toBe('estudiante');
    setRolVerComo(null);
    expect(rolVerComo()).toBeNull();
  });

  it('cualquier otro rol no puede activarlo: no hace nada', () => {
    for (const r of ['semillerista', 'docente', 'jefe_laboratorio']) {
      entrarCon([r]);
      setRolVerComo('admin_lab');
      expect(rolVerComo()).toBeNull();
    }
    entrarCon([]);
    setRolVerComo('admin_lab');
    expect(rolVerComo()).toBeNull();
  });

  it('si la sesión deja de ser de un administrador, lo que quedó activado se ignora', () => {
    entrarCon(['admin_lab']);
    setRolVerComo('estudiante');
    entrarCon(['estudiante']);
    expect(rolVerComo()).toBeNull();
    useAppStore.setState({ user: null as never });
    expect(rolVerComo()).toBeNull();
  });

  it('no toca el rol real que llega en el token', () => {
    entrarCon(['admin_lab']);
    setRolVerComo('estudiante');
    expect(getEffectiveRole(useAppStore.getState().user?.roles)).toBe('admin_lab');
  });
});
