import type { BatchItem, BatchResult, Pricing, Provider, ProviderId } from '../src/proxy/providers/types'

// A Provider implementation that talks to the classify proxy over HTTP instead
// of holding an API key.
//
// The point of matching the `Provider` interface exactly is that
// `runLane()` — the batching, concurrency, warm-up, and timing logic in
// src/proxy/race.ts — runs completely unchanged in the browser. There is no
// second, subtly-different scheduler for the demo that could drift from the
// real one and quietly make a lane look faster than it is.

export interface LaneInfo {
  id: ProviderId
  label: string
  hardware: string
  model: string
  pricing: Pricing
  configured: boolean
}

export async function fetchLanes(): Promise<LaneInfo[]> {
  const res = await fetch('/api/lanes')
  return (await res.json()) as LaneInfo[]
}

export function httpProvider(info: LaneInfo): Provider {
  return {
    id: info.id,
    label: info.label,
    hardware: info.hardware,
    model: info.model,
    pricing: info.pricing,
    isConfigured: () => info.configured,

    async classifyBatch(items: BatchItem[], currentEpisode: number): Promise<BatchResult> {
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lane: info.id, items, currentEpisode }),
      })

      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
      // Timings inside come from the server, where the actual API call happened.
      return body as BatchResult
    },
  }
}
