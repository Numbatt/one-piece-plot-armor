import { classify, type SpoilerHit } from '../core/classify'

// PURE DOM helpers for the Reddit adapter — everything that touches the page
// but NOTHING that touches Chrome APIs or module-load bootstrap. Splitting this
// out is what makes the adapter testable: a jsdom test can build a fake Reddit
// page, run these, and assert what got blurred, with no browser and no
// `chrome.*`. The bootstrap (storage, MutationObserver, wiring) lives in
// reddit.ts and calls into here.

export const PROCESSED_ATTR = 'data-opa-processed' // marks nodes we've handled
export const CANDIDATE_ID_ATTR = 'data-opa-id' // ties a node to its verdict

// Reddit's HTML has changed a lot over the years, so we try several selectors
// that point at comment bodies / post titles across old and new Reddit.
export const CANDIDATE_SELECTORS = [
  '[slot="comment"]', // new Reddit (shreddit) comment body
  '[slot="title"]', // new Reddit post title
  '.md', // old Reddit comment/self-post text
  'a.title', // old Reddit post title link
]

// The one <style> block, as a string so both the real adapter and tests can use
// it. We use a frosted OVERLAY (backdrop-filter blurs what's BEHIND it) rather
// than filter: blur() on the element, because the latter would also blur the
// reveal button (a child of the blurred element).
export const OVERLAY_CSS = `
  .opa-wrap { position: relative; }
  .opa-overlay {
    position: absolute; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px);
    background: rgba(15, 17, 21, 0.35);
    border-radius: 6px; cursor: pointer;
  }
  .opa-reveal {
    font: 12px system-ui, sans-serif; color: #fff;
    background: rgba(210, 59, 59, 0.92);
    border: 0; border-radius: 6px; padding: 5px 10px; cursor: pointer;
  }
  /* Pending = blurred but not yet judged. Deliberately un-clickable: there is
     nothing to reveal yet, and letting someone pop it open early would defeat
     the entire point of blurring first. */
  .opa-overlay.opa-pending { cursor: default; }
  .opa-pending .opa-reveal {
    background: rgba(90, 96, 110, 0.92); cursor: default;
  }
`

/** Lay a frosted overlay over an element, with `label` on its button. */
function applyOverlay(el: HTMLElement, label: string, pending: boolean): void {
  el.classList.add('opa-wrap')

  const overlay = el.ownerDocument.createElement('div')
  overlay.className = pending ? 'opa-overlay opa-pending' : 'opa-overlay'

  const button = el.ownerDocument.createElement('button')
  button.className = 'opa-reveal'
  button.textContent = label

  overlay.appendChild(button)
  // A pending overlay isn't dismissible — see the CSS note above.
  if (!pending) overlay.addEventListener('click', () => overlay.remove())
  el.appendChild(overlay)
}

/** Lay a frosted overlay + reveal button over a *confirmed* spoiler element. */
export function applyBlur(el: HTMLElement, hits: SpoilerHit[]): void {
  const minEpisode = Math.min(...hits.map((h) => h.firstEpisode))
  applyOverlay(el, `🛡️ Spoiler (ep ${minEpisode}+) — reveal`, false)
}

/**
 * Find un-processed candidate elements under `root`, classify their text, and
 * blur the spoilers. Returns the elements it blurred (handy for tests/metrics).
 */
export function scanAndBlur(root: ParentNode, currentEpisode: number): HTMLElement[] {
  const blurred: HTMLElement[] = []
  const elements = root.querySelectorAll<HTMLElement>(CANDIDATE_SELECTORS.join(','))

  for (const el of elements) {
    if (el.hasAttribute(PROCESSED_ATTR)) continue
    el.setAttribute(PROCESSED_ATTR, '')

    const text = el.textContent?.trim()
    if (!text) continue

    const hits = classify(text, currentEpisode)
    if (hits.length > 0) {
      applyBlur(el, hits)
      blurred.push(el)
    }
  }
  return blurred
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIMISTIC BLUR — the async cascade (PLAN §5), for when a model verdict is in
// the loop.
//
// `scanAndBlur` above is synchronous: it can only ever consult the gazetteer,
// so it blurs the terms it recognises and leaves everything else visible. The
// moment an LLM enters the cascade that stops being safe, because the verdict
// arrives hundreds of milliseconds *after* the comment is already on screen and
// already readable.
//
// You cannot win that race with a faster model. Even a 50ms round trip loses to
// an eye that is already on the text. So invert it: blur EVERY candidate the
// instant it enters the DOM (free, local, zero network), then un-blur the ones
// that come back clear.
//
// That inversion changes what latency means. It is no longer a correctness
// risk — nothing leaks regardless of how slow the model is. It is now a
// usability cost: time-to-unblur is exactly how long the page spends as an
// unreadable wall of grey. That is the number the Cerebras/GPU race measures.
// ─────────────────────────────────────────────────────────────────────────────

export interface Candidate {
  /** Stable id used to match a verdict back to this exact node. */
  id: string
  text: string
  el: HTMLElement
}

export interface OptimisticScan {
  /** Every candidate found, all of them blurred before this function returns. */
  candidates: Candidate[]
  /** Resolved locally by the gazetteer at 0ms — confirmed spoilers, no API call. */
  gazetteerHits: Candidate[]
  /** The ambiguous residual: the only comments a model ever sees. */
  residual: Candidate[]
}

/** A model verdict. Structurally compatible with the proxy's `Verdict`, but
 *  declared here so the DOM layer never has to import from src/proxy. */
export interface CandidateVerdict {
  id: string
  spoiler: boolean
  reason?: string
}

let idCounter = 0

/**
 * Blur every unprocessed candidate under `root` immediately, then split them
 * into what the gazetteer already resolved and what still needs a model.
 *
 * Nothing here awaits anything — by the time this returns, the page is safe.
 */
export function blurAllCandidates(root: ParentNode, currentEpisode: number): OptimisticScan {
  const scan: OptimisticScan = { candidates: [], gazetteerHits: [], residual: [] }
  const elements = root.querySelectorAll<HTMLElement>(CANDIDATE_SELECTORS.join(','))

  for (const el of elements) {
    if (el.hasAttribute(PROCESSED_ATTR)) continue
    el.setAttribute(PROCESSED_ATTR, '')

    const text = el.textContent?.trim()
    if (!text) continue

    const id = `c${++idCounter}`
    el.setAttribute(CANDIDATE_ID_ATTR, id)
    const candidate: Candidate = { id, text, el }
    scan.candidates.push(candidate)

    // Cheapest layer first (PLAN §5.1). A gazetteer hit is a confirmed spoiler
    // on a known term, so it gets its final overlay now and never costs an API
    // call. A miss is not "safe" — it only means the fast path can't decide.
    const hits = classify(text, currentEpisode)
    if (hits.length > 0) {
      applyBlur(el, hits)
      scan.gazetteerHits.push(candidate)
    } else {
      applyOverlay(el, '🛡️ Checking…', true)
      scan.residual.push(candidate)
    }
  }

  return scan
}

/**
 * Apply model verdicts: clear the safe ones, and promote the spoilers from a
 * pending overlay to a real, dismissible one.
 *
 * A candidate with no matching verdict is left blurred. That is the same
 * fail-closed rule the proxy applies (PLAN §2): an unanswered comment is not a
 * safe comment.
 */
export function resolveVerdicts(candidates: Candidate[], verdicts: CandidateVerdict[]): void {
  const byId = new Map(candidates.map((c) => [c.id, c]))

  for (const verdict of verdicts) {
    const candidate = byId.get(verdict.id)
    if (!candidate) continue

    const overlay = candidate.el.querySelector('.opa-overlay')
    if (verdict.spoiler) {
      overlay?.remove()
      applyOverlay(candidate.el, '🛡️ Spoiler — reveal', false)
    } else {
      overlay?.remove()
      candidate.el.classList.remove('opa-wrap')
    }
  }
}

/** Undo every blur (used when the viewer changes their episode number). */
export function resetBlur(root: ParentNode): void {
  root.querySelectorAll('.opa-overlay').forEach((o) => o.remove())
  root.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((el) => {
    el.removeAttribute(PROCESSED_ATTR)
    el.removeAttribute(CANDIDATE_ID_ATTR)
    el.classList.remove('opa-wrap')
  })
}
