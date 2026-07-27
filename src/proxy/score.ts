import { classify } from '../core/classify'
import type { BatchItem, Provider } from './providers/types'
import { median, percentile, runLane } from './race'

// SCORING — runs the real cascade over a labelled set and returns the numbers
// that decide whether a lane is shippable.
//
// This lives in src/ (not in the demo or the test runner) because both the
// terminal eval and the in-page scoreboard need it. If they each had their own
// copy, the number on screen and the number in CI could quietly disagree, and
// the one on screen is the one going in a public post.

/** The minimum a case needs to be scoreable. `EvalCase` satisfies this. */
export interface ScoreCase {
  text: string
  episode: number
  spoiler: boolean
  severity?: 'severe' | 'mild'
}

export interface Ratio {
  num: number
  den: number
}

export interface LaneScore {
  providerId: string
  label: string
  precision: Ratio
  recall: Ratio
  severeRecall: Ratio
  p50Ms: number
  p95Ms: number
  /** Cost per 1,000 comments *processed*, including gazetteer-resolved ones. */
  costPer1k: number
  totalCostUsd: number
  /** How many cases the free local fast path resolved without an API call. */
  gazetteerResolved: number
  /**
   * Cases the model was asked about but never returned a verdict for. These
   * fail closed (stay hidden), so they show up as precision loss — but the fix
   * is a smaller batch, not a better prompt. Watch this when raising batch size.
   */
  unanswered: number
  errors: string[]
  /** Per-case decisions, for eyeballing which ones the prompt gets wrong. */
  decisions: { index: number; blurred: boolean; source: 'gazetteer' | 'llm'; reason: string }[]
}

export async function scoreLane(
  provider: Provider,
  cases: ScoreCase[],
  options: { batchSize?: number; concurrency?: number } = {},
): Promise<LaneScore> {
  const { batchSize = 8, concurrency = 4 } = options

  const blurred = new Set<number>()
  const decisions: LaneScore['decisions'] = []
  const residual: BatchItem[] = []

  // Layer 1 — the gazetteer. Deterministic, free, and it never calls out.
  cases.forEach((c, i) => {
    const hits = classify(c.text, c.episode)
    if (hits.length > 0) {
      blurred.add(i)
      decisions.push({
        index: i,
        blurred: true,
        source: 'gazetteer',
        reason: hits.map((h) => h.term).join(', '),
      })
    } else {
      residual.push({ id: String(i), text: c.text })
    }
  })

  // Layer 3 — the model, on the residual only.
  //
  // Cases carry their own episode number but a batch shares one, so group by
  // episode first. Batching cases with different cut-offs into one call would
  // judge them all against whichever number we happened to pass, which is a
  // subtle way to score a lane on a question it was never asked.
  const byEpisode = new Map<number, BatchItem[]>()
  for (const item of residual) {
    const episode = cases[Number(item.id)].episode
    byEpisode.set(episode, [...(byEpisode.get(episode) ?? []), item])
  }

  let totalCostUsd = 0
  let unanswered = 0
  const batchMs: number[] = []
  const errors: string[] = []
  let warmedUp = false

  for (const [episode, items] of byEpisode) {
    const summary = await runLane(provider, items, episode, {
      batchSize,
      concurrency,
      warmUp: !warmedUp,
    })
    warmedUp = true
    totalCostUsd += summary.costUsd
    batchMs.push(...summary.batchMs)
    errors.push(...summary.errors)

    for (const v of summary.verdicts) {
      const index = Number(v.id)
      if (v.spoiler) blurred.add(index)
      if (!v.answered) unanswered++
      decisions.push({ index, blurred: v.spoiler, source: 'llm', reason: v.reason })
    }
  }

  let tp = 0
  let fp = 0
  let fn = 0
  let severeTp = 0
  let severeFn = 0

  cases.forEach((c, i) => {
    const didBlur = blurred.has(i)
    if (didBlur && c.spoiler) tp++
    else if (didBlur && !c.spoiler) fp++
    else if (!didBlur && c.spoiler) fn++

    if (c.severity === 'severe' && c.spoiler) {
      if (didBlur) severeTp++
      else severeFn++
    }
  })

  return {
    providerId: provider.id,
    label: provider.label,
    precision: { num: tp, den: tp + fp },
    recall: { num: tp, den: tp + fn },
    severeRecall: { num: severeTp, den: severeTp + severeFn },
    p50Ms: median(batchMs),
    p95Ms: percentile(batchMs, 95),
    costPer1k: (totalCostUsd / Math.max(1, cases.length)) * 1000,
    totalCostUsd,
    gazetteerResolved: cases.length - residual.length,
    unanswered,
    errors,
    decisions: decisions.sort((a, b) => a.index - b.index),
  }
}
