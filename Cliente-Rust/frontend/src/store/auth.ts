/**
 * store/auth.ts — slice de autenticación (migrado desde contexts/AuthContext.tsx).
 *
 * Contiene el estado y la lógica de negocio de la sesión de autenticación.
 * No crea el store por sí mismo: exporta un `StateCreator` (slice) que es
 * compuesto dentro de `store/app.ts`, siguiendo el patrón de "slices" de Zustand.
 * Esto permite que batches futuros (ej. terminal/sesiones) agreguen más slices
 * al mismo store raíz sin duplicar la infraestructura.
 */
import { StateCreator } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import { notifications } from '@mantine/notifications'
import { authService, AuthSessionInfo } from '../services/auth.service'

export interface AuthSlice {
  user: AuthSessionInfo | null
  isAuthenticated: boolean
  isLoading: boolean
  login: () => Promise<void>
  logout: () => Promise<void>
  /**
   * Inicializa la sesión: consulta el estado actual al backend y registra
   * los listeners de eventos Tauri `auth://session-ready` y `auth://logged-out`.
   * Devuelve una función de cleanup que remueve ambos listeners.
   * Debe invocarse una única vez en el nivel superior de la app (idempotente
   * si se llama más de una vez gracias al cleanup devuelto por cada llamada).
   */
  initAuth: () => () => void
}

export const createAuthSlice: StateCreator<AuthSlice, [], [], AuthSlice> = (set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async () => {
    try {
      await authService.loginUrl()
      // Nota: El backend abrirá el navegador.
      // Cuando se complete, 'auth://session-ready' será emitido.
    } catch (error) {
      console.error('Failed to initialize login flow:', error)
      notifications.show({
        title: 'Error',
        message: 'Error al iniciar sesión',
        color: 'red',
        autoClose: 4000,
        withBorder: true,
      })
    }
  },

  logout: async () => {
    try {
      // Indicamos que cargue mientras el backend hace el request a Keycloak
      set({ isLoading: true })
      await authService.logout()
      // El backend limpiará y emitirá 'auth://logged-out'
    } catch (error) {
      console.error('Failed to logout:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  initAuth: () => {
    const checkStatus = async () => {
      try {
        const session = await authService.status()
        set({ user: session, isAuthenticated: !!session })
      } catch (error) {
        console.error('Failed to check auth status:', error)
        set({ user: null, isAuthenticated: false })
      } finally {
        set({ isLoading: false })
      }
    }

    checkStatus()

    const unlistenReadyPromise = listen<AuthSessionInfo>('auth://session-ready', (event) => {
      console.log('Session ready event received', event.payload.preferred_username)

      // Evaluamos el estado previo para no disparar la notificación en cada refresco silencioso
      if (!get().user) {
        notifications.show({
          title: 'Éxito',
          message: 'Sesión iniciada correctamente',
          color: 'teal',
          autoClose: 4000,
          withBorder: true,
        })
      }

      set({ user: event.payload, isAuthenticated: true })
    })

    const unlistenLogoutPromise = listen('auth://logged-out', () => {
      console.log('Logged out event received')
      set({ user: null, isAuthenticated: false })
    })

    // Cleanup: manejamos las promesas para evitar que se acumulen listeners en el Strict Mode
    return () => {
      unlistenReadyPromise.then((unlisten) => unlisten())
      unlistenLogoutPromise.then((unlisten) => unlisten())
    }
  },
})
