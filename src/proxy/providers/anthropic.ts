import Anthropic from '@anthropic-ai/sdk'
import { renderTimelineFacts } from '../../core/gazetteer'
import { buildBatchUserPrompt, buildSystemPrompt } from '../prompt'
import { REQUEST_TIMEOUT_MS } from './openai-compatible'
import {
  BATCH_VERDICT_SCHEMA,
  costOf,
  parseJsonLoose,
  reconcile,
  type BatchItem,
  type BatchResult,
  type Provider,
} from './types'

// LANE 1 — Claude Haiku 4.5. This is what the extension ships today, so it's
// the baseline everything else is measured against: not the fastest lane, but
// the one whose precision/recall numbers we already trust.
//
// It is deliberately NOT one of the two race panes. The race is Gemma-on-
// Cerebras vs Gemma-on-GPU, where identical weights make speed the only
// variable. Putting a different model from a different vendor in a third pane
// would change two things at once and let anyone dismiss the result.

const MODEL = 'claude-haiku-4-5'

// Published list price, USD per million tokens (Anthropic first-party rates).
const PRICING = { inPerM: 1.0, outPerM: 5.0 }

let client: Anthropic | null = null
function getClient(): Anthropic {
  // Constructed lazily so that merely importing this module doesn't throw in a
  // browser bundle or when the key is absent — the UI needs to be able to load
  // and grey out an unconfigured lane rather than fail to start.
  // Same timeout reasoning as the OpenAI-compatible lanes: the SDK default is
  // 10 minutes, which turns a wedged connection into a hung lane.
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 2,
    })
  }
  return client
}

export const anthropicProvider: Provider = {
  id: 'anthropic',
  label: 'Claude Haiku 4.5',
  hardware: 'Anthropic API',
  model: MODEL,
  pricing: PRICING,

  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),

  async classifyBatch(items: BatchItem[], currentEpisode: number): Promise<BatchResult> {
    const started = Date.now()
    let ttftMs: number | null = null

    // Streaming buys us time-to-first-token, which is the metric that separates
    // "the model is thinking" from "the network is slow". We still can't act on
    // a partial verdict — a half-parsed JSON array can't un-blur anything — so
    // `totalMs` remains the number that decides how long the page stays grey.
    const stream = getClient().messages.stream({
      model: MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(renderTimelineFacts()),
      messages: [{ role: 'user', content: buildBatchUserPrompt(items, currentEpisode) }],
      output_config: { format: { type: 'json_schema', schema: BATCH_VERDICT_SCHEMA } },
    })

    stream.on('text', () => {
      if (ttftMs === null) ttftMs = Date.now() - started
    })

    const final = await stream.finalMessage()
    const totalMs = Date.now() - started

    const block = final.content.find((b) => b.type === 'text')
    const parsed = block && block.type === 'text' ? parseJsonLoose(block.text) : null

    const usage = {
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
    }

    return {
      verdicts: reconcile(items, parsed),
      ttftMs,
      totalMs,
      usage,
      costUsd: costOf(usage, PRICING),
    }
  },
}
