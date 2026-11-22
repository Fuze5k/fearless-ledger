import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The local build's per-series drafts live in web/data-local/ (licensed data), outside public/ so `vite build`
// never copies them into a deployable bundle. Only the dev server serves them, at /data-local/.
function localData(): Plugin {
  const root = join(import.meta.dirname, 'data-local')
  return {
    name: 'local-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/data-local', (req, res, next) => {
        const file = normalize(join(root, decodeURIComponent((req.url ?? '/').split('?')[0])))
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', 'application/json')
        createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localData()],
})
