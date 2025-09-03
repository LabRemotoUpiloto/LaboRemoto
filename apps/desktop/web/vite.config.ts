import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    port: 5173,
    watch: { ignored: ["**/src-tauri/**"] }
  },
  build: { target: ["es2020"], outDir: "dist" }
})
