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
import { QueryCacheSlice } from './queryCache'

export interface AuthSlice {
  user: AuthSessionInfo | null
  isAuthenticated: boolean
  isLoading: boolean
  /**
   * Hay un login abierto en el navegador esperando respuesta. Va aparte de
   * `isLoading` (consulta inicial de sesión): si el usuario cierra la ventana
   * del navegador no llega ningún evento, y con un solo flag la app se quedaba
   * en «Iniciando…» hasta 5 min sin forma de reintentar.
   */
  isLoggingIn: boolean
  login: () => Promise<void>
  /** Abandona el login en curso para poder empezar otro. */
  cancelLogin: () => Promise<void>
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

export const createAuthSlice: StateCreator<AuthSlice & QueryCacheSlice, [], [], AuthSlice> = (set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isLoggingIn: false,

  login: async () => {
    // Solo mientras se consulta la sesión inicial. Reintentar con un login ya
    // abierto SÍ está permitido (botón «Abrir de nuevo»): el backend numera los
    // intentos y el anterior queda obsoleto en silencio, así que ya no se pisan.
    if (get().isLoading) return

    set({ isLoggingIn: true })
    try {
      await authService.loginUrl()
      // Nota: El backend abrirá el navegador.
      // Cuando se complete, 'auth://session-ready' (o 'auth://error') será emitido.
    } catch (error) {
      console.error('Failed to initialize login flow:', error)
      set({ isLoggingIn: false })
      notifications.show({
        title: 'Error',
        message: 'Error al iniciar sesión',
        color: 'red',
        autoClose: 4000,
        withBorder: true,
      })
    }
  },

  cancelLogin: async () => {
    set({ isLoggingIn: false })
    try {
      await authService.cancelLogin()
    } catch (error) {
      console.error('Failed to cancel login:', error)
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
      // Fix REFACTOR #4 (hallazgo de @security/@pr-reviewer): invalidamos todo
      // el queryCache al cerrar sesión para que ningún dato cacheado de la
      // sesión saliente quede accesible si otro estudiante inicia sesión en
      // la misma app sin reiniciarla.
      get().invalidateAllQueries()
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

      set({ user: event.payload, isAuthenticated: true, isLoading: false, isLoggingIn: false })
    })

    const unlistenLogoutPromise = listen('auth://logged-out', () => {
      console.log('Logged out event received')
      set({ user: null, isAuthenticated: false })
      // Fix REFACTOR #4: mismo motivo que en logout() — este evento puede
      // llegar también sin haber pasado por logout() (ej. sesión expirada o
      // revocada del lado del backend), así que invalidamos el cache acá
      // también para no depender de un único punto de entrada.
      get().invalidateAllQueries()
    })

    // El backend emite esto si falla el intercambio de código por tokens
    // (timeout, PKCE verifier pisado por un segundo intento de login, etc.).
    // Sin este listener el error se perdía en silencio y la app se quedaba
    // en la pantalla de login sin ningún feedback ni forma de reintentar.
    const unlistenErrorPromise = listen<string>('auth://error', (event) => {
      console.error('Auth error event received', event.payload)
      set({ isLoading: false, isLoggingIn: false })
      notifications.show({
        title: 'Error al iniciar sesión',
        message: event.payload || 'No se pudo completar el inicio de sesión. Intenta de nuevo.',
        color: 'red',
        autoClose: 5000,
        withBorder: true,
      })
    })

    // Cleanup: manejamos las promesas para evitar que se acumulen listeners en el Strict Mode
    return () => {
      unlistenReadyPromise.then((unlisten) => unlisten())
      unlistenLogoutPromise.then((unlisten) => unlisten())
      unlistenErrorPromise.then((unlisten) => unlisten())
    }
  },
})
