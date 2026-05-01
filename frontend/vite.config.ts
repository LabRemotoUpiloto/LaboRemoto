import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    port: 5174,
    watch: { ignored: ["**/backend/**"] }
  },
  preview: {
    port: 5174
  },
  build: { target: ["esnext"], outDir: "dist" }
})
