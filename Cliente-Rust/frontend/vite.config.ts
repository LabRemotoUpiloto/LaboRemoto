import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { informePaquetes } from './vite.informe'

export default defineConfig(({ command, mode }) => ({
  // `vite build --mode informe` (npm run build:informe): qué pesa cada paquete y qué se carga al arrancar
  plugins: [react(), ...(mode === 'informe' ? [informePaquetes()] : [])],
  // `@/` = src/ (también en tsconfig.json y vitest.config.ts)
  resolve: { alias: { '@': '/src' } },
  server: {
    strictPort: true,
    port: 5174,
    watch: { ignored: ["**/backend/**"] }
  },
  preview: {
    port: 5174
  },
  // En el build los console.* no van (antes se apagaban al arrancar, en main.tsx, pero el código seguía en el paquete)
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : undefined,
  build: {
    target: ["esnext"],
    outDir: "dist",
    rollupOptions: {
      output: {
        // Sin grupos a mano para three, pdf y xterm: al juntarlos, Rollup metía ahí también lo que comparten con el resto
        // (react-dom terminaba en el paquete de three) y todo se cargaba al arrancar. Ahora cada pieza diferida
        // (src/app/diferidos.ts) sale en su propio paquete.
        manualChunks: {
          mantine: ["@mantine/core", "@mantine/hooks", "@mantine/modals", "@mantine/notifications"],
        },
      },
    },
  }
}))
