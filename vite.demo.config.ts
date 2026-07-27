import { defineConfig, loadEnv } from 'vite'
import { classifyProxy } from './demo/proxy'

// A SEPARATE Vite config for the bench page.
//
// The main vite.config.ts runs the crx() plugin, which bundles the project as a
// Chrome extension — manifest, content scripts, the lot. The demo is a plain
// web page with a server-side API attached, so it needs neither, and mixing the
// two would mean fighting the extension bundler for no benefit.

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed vars to client code, and deliberately
  // doesn't touch process.env. The provider modules run server-side inside this
  // dev server and read process.env directly, so load .env into it explicitly.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    root: 'demo',
    plugins: [classifyProxy()],
    server: {
      port: 5174,
      open: '/race.html',
      // demo/ imports from ../src and ../test, which sit outside the Vite root.
      fs: { allow: ['..'] },
    },
  }
})
