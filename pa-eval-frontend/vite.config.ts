import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { viteMockServe } from 'vite-plugin-mock'

const booleanEnv = (value: string | undefined) => value === 'true'

const normalizeBasePath = (value: string | undefined) => {
  if (!value) {
    return '/'
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash
    : `${withLeadingSlash}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_PROXY_TARGET

  return {
    base: normalizeBasePath(env.VITE_APP_BASE_PATH),
    publicDir: 'public',
    plugins: [
      react(),
      tailwindcss(),
      viteMockServe({
        mockPath: './mock',
        enable: env.VITE_ENABLE_MOCK === 'true',
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router', 'zustand', 'axios'],
    },
    build: {
      sourcemap: booleanEnv(env.VITE_BUILD_SOURCEMAP),
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-router')) {
              return 'router-vendor'
            }

            if (
              id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom')
            ) {
              return 'react-vendor'
            }

            if (
              id.includes('node_modules/@radix-ui') ||
              id.includes('node_modules/lucide-react')
            ) {
              return 'ui-vendor'
            }

            if (id.includes('node_modules/zustand')) {
              return 'state-vendor'
            }
          },
        },
      },
    },
  }
})
