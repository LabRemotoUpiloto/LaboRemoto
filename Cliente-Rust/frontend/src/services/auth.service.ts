import { invoke } from '@tauri-apps/api/core';

export interface AuthSessionInfo {
  preferred_username: string;
  user_type: string;
  roles: string[];
  given_name?: string;
  family_name?: string;
  email?: string;
  name?: string;
  access_expires_at: number;
}

export const authService = {
  /**
   * Solicita al backend iniciar el flujo OAuth.
   * El backend genera PKCE, inicia el loopback server y abre el navegador web.
   * El resultado se notifica asíncronamente mediante el evento `auth://session-ready`.
   */
  loginUrl: (): Promise<string> => invoke('auth_login_url'),

  /**
   * Obtiene el estado actual de la sesión.
   * Retorna los claims institucionales si hay una sesión activa en memoria de Rust.
   */
  status: (): Promise<AuthSessionInfo | null> => invoke('auth_status'),

  /**
   * Finaliza la sesión actual.
   * El backend limpia la memoria y revoca el token en Keycloak.
   * Al terminar, emite el evento `auth://logged-out`.
   */
  logout: (): Promise<void> => invoke('auth_logout'),

  /**
   * API de cuenta propia (self-service) contra Keycloak -- no requiere
   * admin_lab, cualquier usuario autenticado puede leer/editar su propio
   * avatar. Se guarda como atributo custom `avatar` (data URL, ya
   * redimensionada/comprimida del lado del cliente antes de subir).
   */
  getAvatar: (): Promise<string | null> => invoke('account_get_avatar'),
  setAvatar: (avatarDataUrl: string): Promise<void> => invoke('account_set_avatar', { avatarDataUrl }),
};
