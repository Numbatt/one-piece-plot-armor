// LIVE cascade eval — your driving instrument for the LLM layer.
//
// Run it with:  npm run eval:llm
//
// It runs the REAL detector over the eval set — the fast word-list first, then
// a model for anything the word-list can't resolve — and prints a scorecard.
//
// It now runs EVERY lane you have a key for, side by side:
//   • Claude Haiku 4.5      — what the extension uses today. The baseline.
//   • Gemma 4 31B, Cerebras — same open weights as the GPU lane, different chip.
//   • Gemma 4 31B, GPU      — the control, and the cheapest of the three.
//
// Three lanes because "which model should we ship?" is really three questions
// with different answers: is it accurate enough, is it fast enough, and can we
// afford it at scale? So precision, latency, and dollars sit in one table.
//
// It ALSO saves the result to files so a run you do in your own terminal is
// readable later (by you, or by Claude Code):
//   • eval-results/latest.md   — the full scorecard from the most recent run
//   • eval-results/history.md  — one summary line per run, so you can see the
//                                scores move over time (are we getting better?)
//
// This hits live APIs (costs a few cents), which is why it is NOT part of
// `npm test`. Tune the prompt here; the free offline suite stays fast.

import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { ALL_LANES } from '../src/proxy/providers'
import { scoreLane, type LaneScore } from '../src/proxy/score'
import { EVAL_SET } from './eval-set'

/**
 * Comments per API call. Matches the demo page.
 *
 * Set by the Cerebras free tier's hard limit of 5 requests/minute — at batch 8
 * a single run blows through it and requests start stalling rather than
 * failing. Watch the `no-answer` column when changing this: bigger batches
 * mean fewer requests but a higher chance the model skips an entry.
 */
const BATCH_SIZE = 20

const pct = (num: number, den: number) => (den === 0 ? '100%' : `${((num / den) * 100).toFixed(0)}%`)
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(3)}`)

/** Render rows as a fixed-width table: first column left-aligned, rest right. */
function table(rows: string[][]): string[] {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)))
  const lines = rows.map((row) =>
    row.map((cell, col) => (col === 0 ? cell.padEnd(widths[col]) : cell.padStart(widths[col]))).join('   '),
  )
  // Rule under the header row.
  lines.splice(1, 0, '─'.repeat(lines[0].length))
  return lines
}

async function main() {
  const lanes = ALL_LANES.filter((p) => p.isConfigured())
  const skipped = ALL_LANES.filter((p) => !p.isConfigured())

  if (lanes.length === 0) {
    console.error('No lane has a key. Copy .env.example to .env and fill in at least one.')
    process.exit(1)
  }

  const scores: LaneScore[] = []
  for (const provider of lanes) {
    process.stdout.write(`Running ${provider.label}… `)
    const score = await scoreLane(provider, EVAL_SET, { batchSize: BATCH_SIZE })
    scores.push(score)
    console.log(`done (${usd(score.totalCostUsd)} spent)`)
  }

  // Build the whole report as text first, so we can BOTH print it and save it.
  const out: string[] = []
  const p = (line = '') => out.push(line)

  const stamp = new Date().toISOString()
  const wordListCount = scores[0].gazetteerResolved

  p(`# Cascade scorecard — ${stamp}`)
  p()
  if (skipped.length > 0) p(`_Skipped (no key): ${skipped.map((s) => s.label).join(', ')}_`)
  p()
  p(
    `Of ${EVAL_SET.length} cases, the word-list resolved ${wordListCount} instantly and for free; ` +
      `the remaining ${EVAL_SET.length - wordListCount} went to a model.`,
  )
  p()
  p('```')
  // NB: `p` takes a single line — spreading an array into it silently drops
  // everything after the first element.
  for (const line of table([
    ['lane', 'precision', 'recall', 'severe', 'no-answer', 'p50', 'p95', '$/1k'],
    ...scores.map((s) => [
      s.label,
      pct(s.precision.num, s.precision.den),
      pct(s.recall.num, s.recall.den),
      pct(s.severeRecall.num, s.severeRecall.den),
      String(s.unanswered),
      `${Math.round(s.p50Ms)}ms`,
      `${Math.round(s.p95Ms)}ms`,
      usd(s.costPer1k),
    ]),
  ])) {
    p(line)
  }
  p('```')
  p()
  p('- **precision** — of everything it hid, how much genuinely was a spoiler.')
  p('- **recall** — of every real spoiler, how much it actually hid.')
  p('- **severe** — recall on deaths, future forms, and endgame twists only.')
  p('- **no-answer** — comments the model skipped. They stay hidden (safe), but')
  p('  they count against precision, so a non-zero number here means shrink the')
  p('  batch, not rewrite the prompt.')
  p(`- **p50 / p95** — round trip for one batch of ${BATCH_SIZE} comments. This is the wait.`)
  p('- **$/1k** — cost per 1,000 comments processed, word-list ones included.')
  p()

  // The gate. A lane that hides safe comments is not a faster detector, it's a
  // broken one — say so loudly rather than letting a tidy table imply it ships.
  const leaking = scores.filter((s) => s.precision.den > 0 && s.precision.num < s.precision.den)
  p(
    leaking.length === 0
      ? '**Precision is 100% on every lane** — nothing safe got hidden, which is the hard rule.'
      : `**PROBLEM: these lanes hid safe comments — ${leaking.map((s) => s.label).join(', ')}.** Not shippable at this prompt.`,
  )
  p()

  for (const score of scores) {
    if (score.errors.length > 0) {
      p(`> ${score.label}: ${score.errors.length} request(s) failed. Those comments stayed hidden.`)
      p(`> First error: \`${score.errors[0]}\``)
      p()
    }
  }

  // The model's actual verdicts on the cases the word-list didn't catch — this
  // is how you debug the prompt. "WRONG" on a safe comment = it hid something
  // it shouldn't (annoying). "WRONG" on a spoiler = it missed one (bad).
  for (const score of scores) {
    p(`## ${score.label} — verdicts on the tricky (non-word-list) cases`)
    p()
    for (const d of score.decisions) {
      if (d.source === 'gazetteer') continue
      const c = EVAL_SET[d.index]
      const mark = d.blurred === c.spoiler ? 'OK  ' : 'WRONG'
      p(`- **${mark}** hide=${String(d.blurred).padEnd(5)} [${c.kind}] "${c.text.slice(0, 70)}"`)
      p(`  - ${d.reason}`)
    }
    p()
  }

  const report = out.join('\n')
  console.log('\n' + report)

  // Save it. latest.md is overwritten each run; history.md keeps a one-line trail.
  mkdirSync('eval-results', { recursive: true })
  writeFileSync('eval-results/latest.md', report)
  const summary =
    `- ${stamp}  ` +
    scores
      .map(
        (s) =>
          `${s.label}: precision ${pct(s.precision.num, s.precision.den)}, ` +
          `severe-recall ${pct(s.severeRecall.num, s.severeRecall.den)}, ` +
          `p50 ${Math.round(s.p50Ms)}ms, ${usd(s.costPer1k)}/1k`,
      )
      .join('  |  ') +
    '\n'
  appendFileSync('eval-results/history.md', summary)
  console.log('Saved to eval-results/latest.md (and appended to eval-results/history.md).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
