/**
 * store/app.ts — store raíz de la aplicación (Zustand), patrón de "slices".
 *
 * Compone los distintos slices de estado global de la app:
 * - `AuthSlice`: sesión de autenticación.
 * - `QueryCacheSlice` (Batch 3, REFACTOR #4): cache de datos obtenidos vía
 *   `invoke()`, usado por el hook `useQueryData`.
 *
 * Batches futuros pueden seguir agregando sus propios slices aquí sin
 * necesidad de crear stores independientes ni cambiar los consumidores
 * existentes.
 *
 * Theme/Toast/Loading permanecen como React Context (UI state puro) — no
 * se migran a este store, por decisión de arquitectura confirmada.
 */
import { create } from 'zustand'
import { AuthSlice, createAuthSlice } from './auth'
import { QueryCacheSlice, createQueryCacheSlice } from './queryCache'

export type AppState = AuthSlice & QueryCacheSlice

export const useAppStore = create<AppState>()((...a) => ({
  ...createAuthSlice(...a),
  ...createQueryCacheSlice(...a),
}))
