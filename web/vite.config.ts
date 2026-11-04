import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')

const config = read(process.env.ALERTBOARD_CONFIG ?? root + 'config.yaml')
// tls.cert in block (tls:\n  cert: ...) or flow (tls: { cert: ... }) style
const tls = /^tls:\s*(\{[^}]*\bcert:|\n(?:[ \t]+.*\n)*?[ \t]+cert:\s*\S)/m.test(config)

// same precedence as the server: LISTEN from environment, then .env, then config.yaml
function backendURL(): string {
  const listen =
    process.env.LISTEN ||
    parseEnv(read(process.env.ALERTBOARD_ENV ?? root + '.env')).LISTEN ||
    /^listen:\s*['"]?([^\s'"#]+)/m.exec(config)?.[1] ||
    '127.0.0.1:8080'
  const i = listen.lastIndexOf(':')
  let host = listen.slice(0, i).replace(/^\[(.*)\]$/, '$1')
  if (!host || host === '0.0.0.0' || host === '::') host = '127.0.0.1'
  return `${tls ? 'https' : 'http'}://${host.includes(':') ? `[${host}]` : host}:${listen.slice(i + 1)}`
}

export default defineConfig({
  plugins: [vue()],
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  server: {
    // the backend certificate is usually self-signed or issued for another name in dev
    proxy: { '/api': { target: backendURL(), secure: false } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
