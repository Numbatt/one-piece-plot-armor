import OpenAI from 'openai'
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions'
import { renderTimelineFacts } from '../../core/gazetteer'
import { buildBatchUserPrompt, buildSystemPrompt } from '../prompt'
import {
  BATCH_VERDICT_SCHEMA,
  costOf,
  parseJsonLoose,
  reconcile,
  type BatchItem,
  type BatchResult,
  type Pricing,
  type Provider,
  type ProviderId,
  type Usage,
} from './types'

// Both Gemma lanes — Cerebras and the GPU endpoint — speak the OpenAI wire
// format, so they share ONE implementation. That's not just DRY: it's the
// fairness guarantee. The two race panes differ by exactly three values
// (base URL, model string, API key) and nothing else. There is no branch where
// one lane could accidentally get a shorter prompt, a smaller batch, or a
// laxer schema than the other, because there is only one code path.

/**
 * Hard ceiling on one batch. Generous enough that a genuinely slow GPU endpoint
 * isn't cut off mid-answer, short enough that a wedged connection surfaces as a
 * failure instead of an infinite spinner.
 */
export const REQUEST_TIMEOUT_MS = 45_000

export interface OpenAICompatConfig {
  id: ProviderId
  label: string
  hardware: string
  model: string
  baseURL: string
  apiKeyEnv: string
  pricing: Pricing
  /**
   * Non-standard body fields this endpoint needs. Used to normalise thinking
   * mode — see the note at the call site. Deliberately per-provider because
   * the two endpoints disagree about which knobs exist, not about behaviour.
   */
  extraBody?: Record<string, unknown>
}

/**
 * Rough token estimate for endpoints that don't return usage.
 *
 * ~4 characters per token is the standard English-text approximation. It is an
 * approximation — any result computed from it is flagged `usageEstimated` so
 * the UI can mark the cost figure rather than pass it off as measured.
 */
function estimateUsage(promptChars: number, completionChars: number): Usage {
  return {
    inputTokens: Math.ceil(promptChars / 4),
    outputTokens: Math.ceil(completionChars / 4),
  }
}

export function createOpenAICompatProvider(config: OpenAICompatConfig): Provider {
  let client: OpenAI | null = null
  const getClient = () => {
    if (!client) {
      client = new OpenAI({
        apiKey: process.env[config.apiKeyEnv],
        baseURL: config.baseURL,
        // The SDK default is 10 MINUTES. A rate-limited endpoint can accept a
        // streaming connection and then simply never send anything, which
        // silently wedges the lane — observed exactly that against Cerebras at
        // batch size 8 under concurrency. A blur that never resolves is worse
        // than a slow one, so cap it and let the batch fail closed.
        timeout: REQUEST_TIMEOUT_MS,
        // 429s are expected on free tiers; the SDK honours Retry-After.
        maxRetries: 2,
      })
    }
    return client
  }

  return {
    id: config.id,
    label: config.label,
    hardware: config.hardware,
    model: config.model,
    pricing: config.pricing,

    isConfigured: () => Boolean(process.env[config.apiKeyEnv]),

    async classifyBatch(items: BatchItem[], currentEpisode: number): Promise<BatchResult> {
      const system = buildSystemPrompt(renderTimelineFacts())
      const user = buildBatchUserPrompt(items, currentEpisode)

      const started = Date.now()
      let ttftMs: number | null = null
      let text = ''
      let reported: Usage | null = null

      const params = {
        model: config.model,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'spoiler_verdicts', strict: true, schema: BATCH_VERDICT_SCHEMA },
        },
        stream: true as const,
        // Without this the OpenAI streaming format omits usage entirely, and we
        // would have to estimate cost on every single call.
        stream_options: { include_usage: true },

        // THINKING MODE — the one place the two lanes are configured
        // differently, and it exists to make them behave the SAME.
        //
        // Gemma 4 ships with thinking on by default. Measured on an identical
        // 2-comment batch, the GPU lane emitted 472 output tokens where
        // Cerebras emitted 77 for the same verdicts — ~370 reasoning tokens,
        // and 9.0s vs 0.6s. Timing that as a hardware result would be wrong:
        // one lane was doing work the other wasn't.
        //
        // Cerebras's preview endpoint already runs Gemma non-thinking and
        // rejects the flag with a 400, so it's sent only where it's needed
        // (Together). After normalising, output tokens are 88 vs 77 — the
        // lanes are finally doing the same job.
        //
        // Non-thinking is also the correct product setting: this is cheap,
        // high-volume triage over one comment and a number (PLAN §5.3), not a
        // reasoning task. `chat_template_kwargs` isn't in the OpenAI type
        // surface, hence the cast below.
        ...(config.extraBody ?? {}),
      }

      const stream = await getClient().chat.completions.create(
        params as unknown as ChatCompletionCreateParamsStreaming,
      )

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          if (ttftMs === null) ttftMs = Date.now() - started
          text += delta
        }
        // Usage arrives on the final chunk, after the last content delta.
        if (chunk.usage) {
          reported = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          }
        }
      }

      const totalMs = Date.now() - started
      const usage = reported ?? estimateUsage(system.length + user.length, text.length)

      return {
        verdicts: reconcile(items, parseJsonLoose(text)),
        ttftMs,
        totalMs,
        usage,
        costUsd: costOf(usage, config.pricing),
        usageEstimated: reported === null,
      }
    },
  }
}
