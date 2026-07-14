/**
 * store/app.ts — store raíz de la aplicación (Zustand), patrón de "slices".
 *
 * Compone los distintos slices de estado global de la app. Por ahora solo
 * incluye el slice de autenticación (`AuthSlice`); batches futuros de
 * REFACTOR #4 (ej. sesiones de terminal) agregarán sus propios slices aquí
 * sin necesidad de crear stores independientes ni cambiar los consumidores
 * existentes.
 *
 * Theme/Toast/Loading permanecen como React Context (UI state puro) — no
 * se migran a este store, por decisión de arquitectura confirmada.
 */
import { create } from 'zustand'
import { AuthSlice, createAuthSlice } from './auth'

export type AppState = AuthSlice

export const useAppStore = create<AppState>()((...a) => ({
  ...createAuthSlice(...a),
}))
