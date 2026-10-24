// Usuarios: de las listas de Keycloak a una fila por persona con UN rol efectivo.
import { describe, expect, it } from 'vitest';
import {
  armarPersonas, contarPorRol, esDocenteDeDirectorio, filtrarPersonas, inicialesDe, nombreDe,
} from '@/features/usuarios/personas';
import type { KeycloakUser } from '@/features/usuarios/admin.service';

const u = (id: string, firstName = '', lastName = '', extra: Partial<KeycloakUser> = {}): KeycloakUser =>
  ({ id, username: `u${id}`, email: `u${id}@upc.edu.co`, firstName, lastName, ...extra });

const ana = u('1', 'Ana', 'Ruiz');
const beto = u('2', 'Beto', 'Pardo');
const carla = u('3', 'Carla', 'Díaz');
const dora = u('4', 'Dora', 'Mesa', { attributes: { postalCode: ['Docente'] } });

describe('armarPersonas', () => {
  it('quien está en dos roles queda con el de mayor jerarquía', () => {
    const [p] = armarPersonas({ laboratorista: [ana], admin_lab: [ana] }, [ana]);
    expect(p.rol).toBe('admin_lab');
  });

  it('sin rol especial es estudiante, salvo el docente del directorio', () => {
    const personas = armarPersonas({}, [beto, dora]);
    expect(personas.map((p) => [p.user.id, p.rol])).toEqual([['4', 'docente'], ['2', 'estudiante']]);
  });

  it('ordena por jerarquía y luego por nombre, sin repetir a nadie', () => {
    const personas = armarPersonas({ admin_lab: [carla], semillerista: [beto, ana] }, [ana, beto, carla, ana]);
    expect(personas.map((p) => p.user.id)).toEqual(['3', '1', '2']);
  });

  it('si la lista completa no llegó, arma el universo con los de cada rol', () => {
    expect(armarPersonas({ semillerista: [ana], laboratorista: [ana, beto] }, []).map((p) => p.user.id).sort()).toEqual(['1', '2']);
  });
});

describe('conteo y filtro', () => {
  const personas = armarPersonas({ admin_lab: [ana] }, [ana, beto, carla]);

  it('cuenta cuántas personas hay de cada rol', () => {
    expect(contarPorRol(personas)).toEqual({ admin_lab: 1, estudiante: 2 });
  });

  it('filtra por rol y busca por nombre, usuario o correo sin importar mayúsculas', () => {
    expect(filtrarPersonas(personas, 'estudiante', '').map((p) => p.user.id)).toEqual(['2', '3']);
    expect(filtrarPersonas(personas, 'todos', 'DÍAZ').map((p) => p.user.id)).toEqual(['3']);
    expect(filtrarPersonas(personas, 'todos', 'u2@').map((p) => p.user.id)).toEqual(['2']);
    expect(filtrarPersonas(personas, 'admin_lab', 'beto')).toEqual([]);
  });
});

describe('datos de cada persona', () => {
  it('nombre e iniciales; sin nombre, el usuario', () => {
    expect(nombreDe(ana)).toBe('Ana Ruiz');
    expect(inicialesDe(u('9', 'María José', 'Peña'))).toBe('MJ');
    expect(nombreDe(u('7'))).toBe('u7');
    expect(inicialesDe(u('7'))).toBe('U7');
  });

  it('docente del directorio por postalCode o user_type', () => {
    expect(esDocenteDeDirectorio(dora)).toBe(true);
    expect(esDocenteDeDirectorio(u('5', '', '', { attributes: { user_type: [' docente '] } }))).toBe(true);
    expect(esDocenteDeDirectorio(ana)).toBe(false);
  });
});
