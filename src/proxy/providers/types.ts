// The PROVIDER INTERFACE — one shape that Haiku, Gemma-on-Cerebras, and
// Gemma-on-a-GPU all implement.
//
// Why this exists: the whole point of the bake-off is that the ONLY thing
// differing between lanes is where inference runs. Same system prompt, same
// user prompt, same JSON schema, same batch size, same concurrency. If any of
// those drift between lanes the comparison is worthless and any reviewer can
// say so. Putting all three behind one interface is what makes that drift
// hard — there's only one code path, parameterised by endpoint.
//
// Timing and cost accounting live in here too (not in the callers), so every
// lane is measured by identical code.

export type ProviderId = 'anthropic' | 'cerebras' | 'together'

/** One comment awaiting a verdict. `id` maps the verdict back to its DOM node. */
export interface BatchItem {
  id: string
  text: string
}

export interface Verdict {
  id: string
  spoiler: boolean
  reason: string
  /**
   * False when the model never returned a verdict for this item and we failed
   * it closed. Tracked separately because "the model judged this a spoiler" and
   * "the model didn't answer" are different failures with different fixes —
   * the first is a prompt problem, the second is a batch-size problem. Lumping
   * them together hides dropped verdicts inside the precision number.
   */
  answered: boolean
}

export interface Usage {
  inputTokens: number
  outputTokens: number
}

export interface BatchResult {
  verdicts: Verdict[]
  /** Time to first streamed token. Null if the lane didn't stream. */
  ttftMs: number | null
  /** Wall time until the full parsed verdict set was available. */
  totalMs: number
  usage: Usage
  costUsd: number
  /**
   * True when the endpoint didn't report token usage and we fell back to an
   * estimate. Surfaced in the UI so a cost number is never presented as
   * measured when it isn't.
   */
  usageEstimated?: boolean
}

/** Published list price, US dollars per million tokens. */
export interface Pricing {
  inPerM: number
  outPerM: number
}

export interface Provider {
  id: ProviderId
  /** Shown as the race-pane title, e.g. "Gemma 4 31B · Cerebras". */
  label: string
  /** The silicon this lane runs on — the variable the demo is isolating. */
  hardware: string
  model: string
  pricing: Pricing
  /** False when the API key is missing, so the UI can grey the lane out. */
  isConfigured(): boolean
  classifyBatch(items: BatchItem[], currentEpisode: number): Promise<BatchResult>
}

// The structured-output contract. Byte-identical across all three lanes —
// Anthropic takes it as `output_config.format.schema`, the OpenAI-compatible
// providers as `response_format.json_schema.schema`, but the schema itself is
// the same object so no lane gets an easier task than another.
export const BATCH_VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'the id of the comment being judged' },
          spoiler: {
            type: 'boolean',
            description: 'true only if confidently a spoiler for this viewer',
          },
          reason: { type: 'string', description: 'one short sentence explaining the verdict' },
        },
        required: ['id', 'spoiler', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdicts'],
  additionalProperties: false,
} as const

export function costOf(usage: Usage, pricing: Pricing): number {
  return (usage.inputTokens / 1e6) * pricing.inPerM + (usage.outputTokens / 1e6) * pricing.outPerM
}

/**
 * Turn whatever the model returned into exactly one verdict per requested item.
 *
 * This is a SAFETY function, not a tidying function. PLAN §2 says missing a
 * spoiler is catastrophic and irreversible while over-blurring is merely
 * annoying, so every failure mode here resolves the same way: if the model
 * didn't give us a confident answer for an item — dropped it, hallucinated an
 * id, returned malformed JSON — that item stays blurred.
 *
 * Without this, a lane that silently drops the last two entries of a batch
 * would un-blur two real spoilers and score BETTER on latency for doing it.
 */
export function reconcile(items: BatchItem[], raw: unknown): Verdict[] {
  const byId = new Map<string, Verdict>()

  const list = (raw as { verdicts?: unknown })?.verdicts
  if (Array.isArray(list)) {
    for (const entry of list) {
      const v = entry as Partial<Verdict>
      if (typeof v?.id === 'string' && typeof v.spoiler === 'boolean') {
        byId.set(v.id, {
          id: v.id,
          spoiler: v.spoiler,
          reason: typeof v.reason === 'string' ? v.reason : '',
          answered: true,
        })
      }
    }
  }

  return items.map(
    (it) =>
      byId.get(it.id) ?? {
        id: it.id,
        spoiler: true, // fail closed — see above
        reason: 'no verdict returned for this comment; kept blurred',
        answered: false,
      },
  )
}

/**
 * Parse the model's text as JSON, tolerating a ```json fence.
 *
 * All three lanes are asked for strict structured output, so a fence should
 * never appear — but "should never" is doing a lot of work across three
 * different vendors' schema implementations, and the cost of being wrong is a
 * thrown exception mid-race. Returns null on failure; `reconcile` then fails
 * every item closed.
 */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim()
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    : trimmed
  try {
    return JSON.parse(unfenced)
  } catch {
    return null
  }
}
