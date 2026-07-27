import { anthropicProvider } from './providers/anthropic'
import type { Provider } from './providers/types'

// The cascade's LLM step (PLAN §5.3) — the layer that catches implicit and
// structural spoilers the gazetteer is blind to.
//
// The real work now lives in src/proxy/providers/, because the classifier has
// to be swappable: the same prompt runs against Haiku, Gemma-on-Cerebras, and
// Gemma-on-a-GPU so their precision, latency, and cost can be compared on
// identical inputs. This file is the single-comment convenience wrapper kept
// for callers that only have one thing to judge.
//
// Prefer `provider.classifyBatch` wherever you have more than one comment. A
// batch of 8 costs roughly an eighth of the input tokens per comment, because
// the ~450-token system prompt is sent once instead of eight times — and Haiku
// 4.5 won't prompt-cache a prefix that short, so batching is the only lever
// that actually reduces it.

export interface LlmVerdict {
  /** The classifier's decision: does this spoil a viewer at `currentEpisode`? */
  spoiler: boolean
  /** One-line justification — useful when eyeballing eval failures. */
  reason: string
}

/**
 * Ask a provider whether `text` spoils a viewer at `currentEpisode`. Pure
 * classifier: no DOM, no browser, no gazetteer — the cascade calls the
 * gazetteer first and only falls through to here for the ambiguous residual.
 *
 * Defaults to Haiku, which is what the extension ships today.
 */
export async function classifyLLM(
  text: string,
  currentEpisode: number,
  provider: Provider = anthropicProvider,
): Promise<LlmVerdict> {
  const result = await provider.classifyBatch([{ id: '1', text }], currentEpisode)
  const verdict = result.verdicts[0]
  return { spoiler: verdict.spoiler, reason: verdict.reason }
}
