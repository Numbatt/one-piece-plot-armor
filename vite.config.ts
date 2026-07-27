import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

// Vite is our build tool: it takes the TypeScript in src/ and turns it into
// plain JavaScript the browser can load. The crx() plugin teaches Vite the
// special rules of Chrome extensions (how to bundle content scripts, wire up
// the popup, copy the manifest, etc.) so we don't have to do that by hand.
export default defineConfig({
  plugins: [crx({ manifest })],
})
