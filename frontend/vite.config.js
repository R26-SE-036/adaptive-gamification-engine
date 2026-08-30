import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The proxy target used to be hardcoded to 127.0.0.1:8000, which works locally
// and silently breaks when the team points at a shared Code Coach behind a
// Cloudflare tunnel. Read it from the environment instead.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const codeCoachTarget = env.VITE_CODE_COACH_ORIGIN || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    server: {
      // 5174, not Vite's default 5173 - that belongs to Study Guider's frontend.
      port: 5174,
      strictPort: true,
      proxy: {
        '/code-coach-api': {
          target: codeCoachTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/code-coach-api/, '')
        }
      }
    }
  }
})
