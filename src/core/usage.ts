// USAGE LOG — records every model classification so the dashboard can show what
// was analyzed, how many tokens it cost, and the running dollar total. Written to
// chrome.storage.local (survives reloads); the dashboard page reads the same key.
//
// This module is the single source of truth for cost math. Wherever the model is
// actually called, pass its real token counts to `logUsage` — the response's
// `usage.input_tokens` / `usage.output_tokens`.

const STORAGE_KEY = 'opa_usage_log'
const MAX_ENTRIES = 2000 // keep storage bounded; oldest drop off

/** Price per 1M tokens, by model. Add rows as you test other providers. */
export const PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
  // Open-weights lanes you're benchmarking — set real numbers when known.
  'gemma-cerebras': { inputPerM: 0, outputPerM: 0 },
  'gemma-gpu': { inputPerM: 0, outputPerM: 0 },
}

export interface UsageEntry {
  ts: number // Date.now()
  site: string // e.g. 'reddit.com'
  model: string
  textSnippet: string // first ~80 chars, for the dashboard table
  spoiler: boolean // the verdict
  inputTokens: number
  outputTokens: number
  costUsd: number
  ms: number // round-trip latency
}

/** Dollar cost of one call, from the price table (0 if the model is unpriced). */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model]
  if (!p) return 0
  return (inputTokens / 1e6) * p.inputPerM + (outputTokens / 1e6) * p.outputPerM
}

/** Append one classification to the log. Safe to call from a content script. */
export async function logUsage(entry: Omit<UsageEntry, 'costUsd'> & { costUsd?: number }): Promise<void> {
  const costUsd = entry.costUsd ?? estimateCost(entry.model, entry.inputTokens, entry.outputTokens)
  const full: UsageEntry = { ...entry, costUsd }
  const log = await getUsageLog()
  log.push(full)
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES)
  await chrome.storage.local.set({ [STORAGE_KEY]: log })
}

export async function getUsageLog(): Promise<UsageEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return Array.isArray(result[STORAGE_KEY]) ? (result[STORAGE_KEY] as UsageEntry[]) : []
}

export async function clearUsageLog(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}
