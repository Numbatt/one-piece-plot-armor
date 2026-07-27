import type { BatchItem, BatchResult, Provider, Verdict } from './providers/types'

// THE LANE RUNNER — chops a page's worth of comments into batches, runs them
// against one provider with a bounded number of in-flight requests, and reports
// each batch back the moment it lands.
//
// Progressive reporting is the point. If we waited for all batches before
// touching the DOM, both race panes would sit grey and then flip at once, which
// hides exactly the thing we're trying to show. Reporting per batch is also how
// the real extension should behave: un-blur what you've cleared, when you clear
// it.

export interface RunOptions {
  /**
   * Comments per API call. 8 keeps the ~450-token system prompt amortised
   * (~60 tokens/comment) while still landing verdicts in visible waves.
   */
  batchSize?: number
  /** Max batches in flight at once. */
  concurrency?: number
  /**
   * Send one throwaway request before timing starts. Without this the first
   * batch of every run also pays TLS handshake + cold connection setup, which
   * would be charged to whichever lane happens to start first.
   */
  warmUp?: boolean
  onBatch?: (verdicts: Verdict[], result: BatchResult) => void
  signal?: AbortSignal
}

export interface LaneSummary {
  providerId: string
  label: string
  verdicts: Verdict[]
  /** Wall time for the whole lane — the number the race is actually about. */
  totalMs: number
  /** Per-batch round trips, for median/p95 rather than a single lucky number. */
  batchMs: number[]
  ttftMs: number[]
  costUsd: number
  inputTokens: number
  outputTokens: number
  usageEstimated: boolean
  errors: string[]
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

export async function runLane(
  provider: Provider,
  items: BatchItem[],
  currentEpisode: number,
  options: RunOptions = {},
): Promise<LaneSummary> {
  const { batchSize = 8, concurrency = 4, warmUp = true, onBatch, signal } = options

  const summary: LaneSummary = {
    providerId: provider.id,
    label: provider.label,
    verdicts: [],
    totalMs: 0,
    batchMs: [],
    ttftMs: [],
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    usageEstimated: false,
    errors: [],
  }

  if (items.length === 0) return summary

  if (warmUp) {
    try {
      // Cost is a rounding error (one comment) and it is NOT added to the
      // summary — this request exists only to open the connection.
      await provider.classifyBatch([{ id: 'warmup', text: 'Luffy is the captain.' }], currentEpisode)
    } catch {
      // A failed warm-up is not fatal; the real batches will surface the error
      // with a message worth reading.
    }
  }

  const batches = chunk(items, batchSize)
  const started = Date.now()
  let next = 0

  const worker = async () => {
    while (next < batches.length) {
      if (signal?.aborted) return
      const batch = batches[next++]
      try {
        const result = await provider.classifyBatch(batch, currentEpisode)
        summary.verdicts.push(...result.verdicts)
        summary.batchMs.push(result.totalMs)
        if (result.ttftMs !== null) summary.ttftMs.push(result.ttftMs)
        summary.costUsd += result.costUsd
        summary.inputTokens += result.usage.inputTokens
        summary.outputTokens += result.usage.outputTokens
        if (result.usageEstimated) summary.usageEstimated = true
        onBatch?.(result.verdicts, result)
      } catch (err) {
        // Fail closed, exactly as `reconcile` does: an errored batch leaves its
        // comments blurred rather than silently exposing them.
        const message = err instanceof Error ? err.message : String(err)
        summary.errors.push(message)
        const failed: Verdict[] = batch.map((it) => ({
          id: it.id,
          spoiler: true,
          reason: `request failed (${message}); kept blurred`,
          answered: false,
        }))
        summary.verdicts.push(...failed)
        onBatch?.(failed, {
          verdicts: failed,
          ttftMs: null,
          totalMs: 0,
          usage: { inputTokens: 0, outputTokens: 0 },
          costUsd: 0,
        })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker))
  summary.totalMs = Date.now() - started
  return summary
}
