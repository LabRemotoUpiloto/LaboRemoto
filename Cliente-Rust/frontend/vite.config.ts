import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { informePaquetes } from './vite.informe'

export default defineConfig(({ mode }) => ({
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
  build: {
    target: ["esnext"],
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          mantine: ["@mantine/core", "@mantine/hooks", "@mantine/modals", "@mantine/notifications"],
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          pdf: ["pdfjs-dist", "mammoth", "html2pdf.js"],
          xterm: ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-serialize", "@xterm/addon-web-links"],
        },
      },
    },
  }
}))
