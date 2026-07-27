import {
  OVERLAY_CSS,
  blurAllCandidates,
  resolveVerdicts,
  type Candidate,
} from '../src/content/reddit-dom'
import { median, runLane, type LaneSummary } from '../src/proxy/race'
import { scoreLane, type LaneScore } from '../src/proxy/score'
import type { BatchItem, Verdict } from '../src/proxy/providers/types'
import { EVAL_SET } from '../test/eval-set'
import { COMMENTS, CURRENT_EPISODE } from './fixture'
import { fetchLanes, httpProvider, type LaneInfo } from './http-provider'

// The race UI.
//
// Both panes run the SAME code as the extension: `blurAllCandidates` and
// `resolveVerdicts` are imported straight from src/content/reddit-dom, and the
// batching/concurrency comes from src/proxy/race. Nothing about the blur
// behaviour is re-implemented for the demo, which is what makes this a
// demonstration rather than an animation.

/**
 * Comments per API call, and calls in flight per lane.
 *
 * These are set by a hard external constraint: the Cerebras free tier allows
 * **5 requests per minute** (confirmed from its own
 * `x-ratelimit-limit-requests-minute` header). At batch 8 a 60-comment page
 * needs 8 calls, so the lane hit the wall at exactly 40/60 every time — and a
 * throttled request doesn't fail fast, it accepts the connection and stalls,
 * which made Cerebras look like it LOST a race it actually wins.
 *
 * Batch 20 puts a full page in 3 calls, comfortably inside the limit.
 *
 * This is not a compromise for the comparison — it's better for it. Bigger
 * batches mean more output tokens per call, and output throughput is precisely
 * where Cerebras's ~1,851 tok/s shows up. Small batches bury that advantage in
 * per-request overhead. Both lanes use identical values either way.
 */
const BATCH_SIZE = 20
const CONCURRENCY = 2

/**
 * The two race panes, fixed: Gemma 4 on Cerebras vs Gemma 4 on GPU.
 *
 * Same weights, same prompt, different silicon — so speed is the only
 * variable. Haiku is deliberately NOT a pane: it's a different model from a
 * different vendor, so putting it here would change two things at once and let
 * anyone dismiss the result. It appears in the scoreboard below, where being a
 * different model is the entire point.
 */
const RACE_LANE_IDS = ['cerebras', 'together'] as const

// The extension's overlay stylesheet, injected first so race.css can override
// its palette without forking the blur logic.
const style = document.createElement('style')
style.textContent = OVERLAY_CSS
document.head.prepend(style)

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

const startButton = $<HTMLButtonElement>('#start')
const modeSelect = $<HTMLSelectElement>('#mode')
const runEvalCheckbox = $<HTMLInputElement>('#run-eval')
const statusEl = $('#status')
const lanesEl = $('#lanes')
const boardBody = $('#board-body')

const fmtSeconds = (ms: number) => (ms / 1000).toFixed(2)
const fmtUsd = (usd: number) => (usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(3)}`)
const pct = (num: number, den: number) => (den === 0 ? '—' : `${((num / den) * 100).toFixed(0)}%`)

function setStatus(text: string, tone: 'info' | 'error' = 'info') {
  statusEl.textContent = text
  statusEl.dataset.tone = tone
}

// ── Lane panes ───────────────────────────────────────────────────────────────

interface LanePane {
  info: LaneInfo
  root: HTMLElement
  feed: HTMLElement
  clock: HTMLElement
  badge: HTMLElement
  bar: HTMLElement
  trace: HTMLElement
  stats: Record<'resolved' | 'cost' | 'p50' | 'tokens', HTMLElement>
}

function buildPane(info: LaneInfo): LanePane {
  const root = document.createElement('article')
  root.className = 'lane'
  root.dataset.lane = info.id
  root.dataset.state = info.configured ? 'idle' : 'disabled'

  root.innerHTML = `
    <div class="lane__head">
      <h2 class="lane__name">${info.label}</h2>
      <p class="lane__meta">${info.hardware} · ${info.model}${
        info.configured ? '' : ' · NO API KEY'
      }</p>
    </div>
    <div class="lane__clock">
      <span class="clock__value" data-clock>0.00</span>
      <span class="clock__unit">s to clear</span>
      <span class="clock__badge" data-badge></span>
    </div>
    <div class="lane__progress"><div class="lane__bar" data-bar></div></div>
    <dl class="lane__stats">
      <div class="stat"><dt>resolved</dt><dd data-stat="resolved">0 / 0</dd></div>
      <div class="stat"><dt>cost</dt><dd data-stat="cost">$0</dd></div>
      <div class="stat"><dt>p50 batch</dt><dd data-stat="p50">—</dd></div>
      <div class="stat"><dt>tokens</dt><dd data-stat="tokens">0</dd></div>
    </dl>
    <div class="trace" data-trace><span class="trace__empty">per-batch round trips</span></div>
    <div class="feed" data-feed></div>
  `

  lanesEl.appendChild(root)

  return {
    info,
    root,
    feed: root.querySelector<HTMLElement>('[data-feed]')!,
    clock: root.querySelector<HTMLElement>('[data-clock]')!,
    badge: root.querySelector<HTMLElement>('[data-badge]')!,
    bar: root.querySelector<HTMLElement>('[data-bar]')!,
    trace: root.querySelector<HTMLElement>('[data-trace]')!,
    stats: {
      resolved: root.querySelector<HTMLElement>('[data-stat="resolved"]')!,
      cost: root.querySelector<HTMLElement>('[data-stat="cost"]')!,
      p50: root.querySelector<HTMLElement>('[data-stat="p50"]')!,
      tokens: root.querySelector<HTMLElement>('[data-stat="tokens"]')!,
    },
  }
}

/** Render the comment list using the same markup shape the Reddit adapter looks for. */
function renderFeed(pane: LanePane, comments: string[]) {
  pane.feed.innerHTML = comments
    .map(
      (text, i) => `
        <div class="cmt">
          <div class="cmt__meta">u/anon${((i * 37) % 900) + 100} · ${(i % 23) + 1}h</div>
          <div slot="comment">${text.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`)}</div>
        </div>`,
    )
    .join('')
}

function drawTrace(pane: LanePane, batchMs: number[], scaleMax: number) {
  if (batchMs.length === 0) return
  pane.trace.innerHTML = batchMs
    .map((ms) => {
      // Floor at 8% so a very fast lane still reads as bars rather than a
      // hairline. Both lanes share `scaleMax`, so the height difference between
      // panes stays truthful — this only keeps the small one visible.
      const height = Math.max(8, Math.round((ms / scaleMax) * 100))
      return `<span class="trace__bar" style="height:${height}%" title="${Math.round(ms)}ms"></span>`
    })
    .join('')
}

// ── The race ─────────────────────────────────────────────────────────────────

interface RaceResult {
  pane: LanePane
  summary: LaneSummary
  /** Gazetteer-resolved comments never reach a provider — that's the cascade. */
  gazetteerCount: number
  totalComments: number
}

async function racePane(pane: LanePane, comments: string[]): Promise<RaceResult> {
  renderFeed(pane, comments)

  // Everything is blurred synchronously, before a single request goes out.
  // This is the whole architectural point: nothing can leak while we wait.
  const scan = blurAllCandidates(pane.feed, CURRENT_EPISODE)
  const total = scan.candidates.length
  let resolved = scan.gazetteerHits.length

  pane.root.dataset.state = 'running'
  pane.stats.resolved.textContent = `${resolved} / ${total}`
  pane.bar.style.width = `${(resolved / total) * 100}%`

  const byId = new Map<string, Candidate>(scan.candidates.map((c) => [c.id, c]))
  const items: BatchItem[] = scan.residual.map((c) => ({ id: c.id, text: c.text }))

  const started = performance.now()
  let running = true
  const tick = () => {
    if (!running) return
    pane.clock.textContent = fmtSeconds(performance.now() - started)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  const provider = httpProvider(pane.info)
  const batchMs: number[] = []
  let costSoFar = 0

  const summary = await runLane(provider, items, CURRENT_EPISODE, {
    batchSize: BATCH_SIZE,
    concurrency: CONCURRENCY,
    warmUp: true,
    onBatch: (verdicts: Verdict[], result) => {
      // Un-blur the moment each batch lands, not at the end. Waves of clearing
      // are both the honest behaviour and the thing worth watching.
      resolveVerdicts(
        verdicts.map((v) => byId.get(v.id)).filter((c): c is Candidate => Boolean(c)),
        verdicts,
      )
      resolved += verdicts.length
      if (result.totalMs > 0) batchMs.push(result.totalMs)
      costSoFar += result.costUsd

      pane.stats.resolved.textContent = `${resolved} / ${total}`
      pane.bar.style.width = `${(resolved / total) * 100}%`
      pane.stats.p50.textContent = batchMs.length ? `${Math.round(median(batchMs))}ms` : '—'
      pane.stats.cost.textContent = fmtUsd(costSoFar)
      // Draw the trace as it fills, self-scaled; it's re-drawn against a shared
      // scale once both lanes finish so the two charts can be compared.
      drawTrace(pane, batchMs, Math.max(1, ...batchMs))
    },
  })

  running = false
  pane.clock.textContent = fmtSeconds(summary.totalMs)
  pane.root.dataset.state = 'done'
  pane.stats.cost.textContent = fmtUsd(summary.costUsd)
  pane.stats.p50.textContent = `${Math.round(median(summary.batchMs))}ms`
  pane.stats.tokens.textContent = `${(summary.inputTokens + summary.outputTokens).toLocaleString()}${
    summary.usageEstimated ? '*' : ''
  }`

  return { pane, summary, gazetteerCount: scan.gazetteerHits.length, totalComments: total }
}

// ── Accuracy & cost scoreboard ───────────────────────────────────────────────

function renderBoardRow(info: LaneInfo, score: LaneScore) {
  const tr = document.createElement('tr')
  const precisionPerfect = score.precision.den > 0 && score.precision.num === score.precision.den
  tr.innerHTML = `
    <td class="board__lane" style="--accent: var(--${info.id})">${info.label}</td>
    <td class="board__hw">${info.hardware}</td>
    <td class="num ${precisionPerfect ? '' : 'fail'}">${pct(score.precision.num, score.precision.den)}</td>
    <td class="num">${pct(score.recall.num, score.recall.den)}</td>
    <td class="num">${pct(score.severeRecall.num, score.severeRecall.den)}</td>
    <td class="num">${Math.round(score.p50Ms)}ms</td>
    <td class="num">${Math.round(score.p95Ms)}ms</td>
    <td class="num">${fmtUsd(score.costPer1k)}</td>
  `
  boardBody.appendChild(tr)
}

// ── Orchestration ────────────────────────────────────────────────────────────

let lanes: LaneInfo[] = []
let panes: LanePane[] = []

function commentsForMode(): string[] {
  return modeSelect.value === 'firehose'
    ? Array.from({ length: 300 }, (_, i) => `${COMMENTS[i % COMMENTS.length]} (${i + 1})`)
    : COMMENTS
}

/**
 * The resting state: everything already blurred, before a single request.
 *
 * This isn't decoration — it's the claim the whole design rests on. The page
 * says nothing is readable until a verdict lands, so the page had better not
 * be readable before you press start. Rendering the feed in the clear and only
 * blurring on click would be showing a different product than the one shipping.
 */
function showResting() {
  const comments = commentsForMode()
  $('#spec-count').textContent = String(comments.length)
  for (const pane of panes) {
    renderFeed(pane, comments)
    blurAllCandidates(pane.feed, CURRENT_EPISODE)
    pane.root.dataset.state = pane.info.configured ? 'idle' : 'disabled'
    pane.clock.textContent = '0.00'
    pane.bar.style.width = '0%'
    pane.badge.dataset.show = 'false'
    pane.stats.resolved.textContent = `0 / ${comments.length}`
    pane.stats.cost.textContent = '$0'
    pane.stats.p50.textContent = '—'
    pane.stats.tokens.textContent = '0'
    pane.trace.innerHTML = '<span class="trace__empty">per-batch round trips</span>'
  }
}

async function init() {
  try {
    lanes = await fetchLanes()
  } catch {
    setStatus('Could not reach the classify proxy. Is `npm run demo` running?', 'error')
    startButton.disabled = true
    return
  }

  panes = RACE_LANE_IDS.map((id) => buildPane(lanes.find((l) => l.id === id)!))
  showResting()
  // Re-render the resting state when the load size changes, so what's on
  // screen always matches what pressing start will actually run.
  modeSelect.addEventListener('change', showResting)

  $('#spec-batch').textContent = String(BATCH_SIZE)
  $('#spec-conc').textContent = String(CONCURRENCY)
  $('#spec-episode').textContent = `ep ${CURRENT_EPISODE}`

  const missing = lanes.filter((l) => !l.configured)
  if (missing.length > 0) {
    setStatus(
      `Missing API key(s): ${missing.map((l) => l.label).join(', ')}. ` +
        `Add them to .env and restart the dev server.`,
      'error',
    )
    // Both race lanes need a key for the comparison to mean anything.
    startButton.disabled = panes.some((p) => !p.info.configured)
  } else {
    setStatus('Ready. Both panes start fully blurred — nothing is readable until a verdict lands.')
  }
}

async function start() {
  startButton.disabled = true
  boardBody.innerHTML = ''
  showResting()

  const comments = commentsForMode()
  const runnable = panes.filter((p) => p.info.configured)
  if (runnable.length === 0) {
    setStatus('No lane has an API key configured.', 'error')
    startButton.disabled = false
    return
  }

  setStatus('Racing — both lanes are running concurrently, so network conditions hit both alike.')

  // Concurrent, not sequential: that IS the interleave. Running one lane then
  // the other would let network drift land entirely on whichever went second.
  const results = await Promise.all(runnable.map((pane) => racePane(pane, comments)))

  // Scale every trace to the slowest observed batch so the two strip charts are
  // directly comparable rather than each self-normalising.
  const scaleMax = Math.max(1, ...results.flatMap((r) => r.summary.batchMs))
  for (const r of results) drawTrace(r.pane, r.summary.batchMs, scaleMax)

  const ranked = [...results].sort((a, b) => a.summary.totalMs - b.summary.totalMs)
  const [fastest, slowest] = ranked
  if (fastest && slowest && fastest !== slowest && fastest.summary.totalMs > 0) {
    const factor = slowest.summary.totalMs / fastest.summary.totalMs
    fastest.pane.badge.textContent = `${factor.toFixed(1)}× faster`
    fastest.pane.badge.dataset.show = 'true'
    slowest.pane.badge.textContent = 'baseline'
    slowest.pane.badge.dataset.show = 'true'
  }

  const failures = results.flatMap((r) => r.summary.errors)
  const gaz = results[0]?.gazetteerCount ?? 0
  setStatus(
    failures.length
      ? `Finished with ${failures.length} failed batch(es) — those stayed blurred. First error: ${failures[0]}`
      : `Done. ${gaz} of ${results[0]?.totalComments ?? 0} comments were resolved locally by the ` +
          `gazetteer at 0ms and never hit an API.`,
    failures.length ? 'error' : 'info',
  )

  if (runEvalCheckbox.checked) {
    setStatus('Race done. Scoring accuracy & cost across all three lanes…')
    for (const info of lanes) {
      if (!info.configured) continue
      try {
        const score = await scoreLane(httpProvider(info), EVAL_SET, {
          batchSize: BATCH_SIZE,
          concurrency: CONCURRENCY,
        })
        renderBoardRow(info, score)
      } catch (err) {
        setStatus(`${info.label} eval failed: ${err instanceof Error ? err.message : err}`, 'error')
      }
    }
    if (boardBody.children.length > 0) {
      setStatus('Done. Race times above, accuracy and cost below.')
    }
  }

  startButton.disabled = false
}

startButton.addEventListener('click', start)
void init()
