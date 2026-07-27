import { describe, it, expect } from 'vitest'
import { classify } from '../src/core/classify'
import { EVAL_SET, type EvalCase } from './eval-set'

// The classifier-under-test as a single boolean: does the current cascade blur
// this text for this viewer? Today the cascade is just the gazetteer, so this
// is `classify(...).length > 0`. When the LLM / structural layers land, this is
// the ONE place that changes, and the whole eval re-scores automatically.
function wouldBlur(c: EvalCase): boolean {
  return classify(c.text, c.episode).length > 0
}

interface Scores {
  tp: number // predicted blur, truly a spoiler
  fp: number // predicted blur, actually safe  (precision killers)
  fn: number // missed a real spoiler          (recall killers — the scary ones)
  tn: number // correctly left alone
}

function score(cases: EvalCase[]): Scores {
  const s: Scores = { tp: 0, fp: 0, fn: 0, tn: 0 }
  for (const c of cases) {
    const blurred = wouldBlur(c)
    if (blurred && c.spoiler) s.tp++
    else if (blurred && !c.spoiler) s.fp++
    else if (!blurred && c.spoiler) s.fn++
    else s.tn++
  }
  return s
}

const ratio = (num: number, den: number) => (den === 0 ? 1 : num / den)
const precision = (s: Scores) => ratio(s.tp, s.tp + s.fp)
const recall = (s: Scores) => ratio(s.tp, s.tp + s.fn)
const pct = (x: number) => `${(x * 100).toFixed(0)}%`

describe('spoiler classifier eval (PLAN §9)', () => {
  const all = score(EVAL_SET)

  // A human-readable scoreboard on every run. This is the "am I shipping
  // better or worse than yesterday?" instrument.
  it('prints the scoreboard', () => {
    const severe = EVAL_SET.filter((c) => c.severity === 'severe')
    const byKind = (k: EvalCase['kind']) => EVAL_SET.filter((c) => c.kind === k)

    const lines = [
      '',
      '──────── SPOILER CLASSIFIER SCOREBOARD ────────',
      `overall   precision ${pct(precision(all))}   recall ${pct(recall(all))}   ` +
        `(tp ${all.tp}  fp ${all.fp}  fn ${all.fn}  tn ${all.tn})`,
      `severe    recall ${pct(recall(score(severe)))}  ← the metric that matters most (PLAN §2)`,
      '',
      'recall by kind (where the cascade leaks):',
      `  named       ${pct(recall(score(byKind('named'))))}   ← gazetteer territory, must stay 100%`,
      `  implicit    ${pct(recall(score(byKind('implicit'))))}   ← needs the LLM layer (PLAN §5.3)`,
      `  structural  ${pct(recall(score(byKind('structural'))))}   ← needs episode/hashtag signals (PLAN §5.2)`,
      '───────────────────────────────────────────────',
      '',
    ]
    console.log(lines.join('\n'))
    expect(true).toBe(true)
  })

  // INVARIANT 1 — precision is sacred. Blurring a safe post is the failure that
  // gets us uninstalled, so it is a hard zero-tolerance gate (PLAN §2).
  it('never blurs a safe post (precision = 100%)', () => {
    expect(all.fp).toBe(0)
  })

  // INVARIANT 2 — every NAMED severe spoiler is caught. This is the promise the
  // gazetteer already makes; if it ever regresses, the build must fail.
  it('catches every named severe spoiler (recall = 100% on gazetteer territory)', () => {
    const named = score(EVAL_SET.filter((c) => c.kind === 'named' && c.severity === 'severe'))
    expect(named.fn).toBe(0)
  })

  // NOT YET AN INVARIANT — implicit/structural spoilers are known misses. We
  // assert the gap EXISTS so nobody mistakes today's system for complete, and
  // so the day the LLM layer closes it, this test flips and reminds us to
  // promote it to a real invariant.
  it('documents the current recall gap on implicit/structural spoilers', () => {
    const gap = score(EVAL_SET.filter((c) => c.kind === 'implicit' || c.kind === 'structural'))
    expect(gap.fn).toBeGreaterThan(0) // TODO: when this fails, the LLM layer works — make it an invariant.
  })
})
