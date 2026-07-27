import type { Connect, Plugin, ViteDevServer } from 'vite'
import { PROVIDERS } from '../src/proxy/providers'
import type { BatchItem, ProviderId } from '../src/proxy/providers/types'

// THE CLASSIFY PROXY, as a Vite dev-server middleware.
//
// This is not demo scaffolding — it's the shape PLAN §4.2 calls for. The API
// keys have to live on a server: a browser extension that ships them is a
// browser extension that leaks them, and every user's key would be one
// "view source" away. So the browser sends text, the server holds the secrets
// and does the inference, and the verdict comes back.
//
// Timing is measured SERVER-SIDE, inside the provider, and returned in the
// response body. The localhost hop is a rounding error, but more importantly
// it's a symmetric one — both lanes pay it identically, so it cannot flatter
// either side.

interface ClassifyRequest {
  lane: ProviderId
  items: BatchItem[]
  currentEpisode: number
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

export function classifyProxy(): Plugin {
  return {
    name: 'plot-armor-classify-proxy',

    configureServer(server: ViteDevServer) {
      // Which lanes actually have a key? The UI greys out the rest instead of
      // firing requests that are guaranteed to 401.
      server.middlewares.use('/api/lanes', (_req, res) => {
        sendJson(
          res,
          200,
          Object.values(PROVIDERS).map((p) => ({
            id: p.id,
            label: p.label,
            hardware: p.hardware,
            model: p.model,
            pricing: p.pricing,
            configured: p.isConfigured(),
          })),
        )
      })

      server.middlewares.use('/api/classify', async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })

        try {
          const body = JSON.parse(await readBody(req)) as ClassifyRequest
          const provider = PROVIDERS[body.lane]
          if (!provider) return sendJson(res, 400, { error: `unknown lane: ${body.lane}` })
          if (!provider.isConfigured()) {
            return sendJson(res, 400, { error: `${provider.label}: API key not set` })
          }

          const result = await provider.classifyBatch(body.items, body.currentEpisode)
          sendJson(res, 200, result)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          // The client fails these closed (comments stay blurred), so surfacing
          // the real message here costs nothing and saves a debugging session.
          sendJson(res, 500, { error: message })
        }
      })
    },
  }
}
