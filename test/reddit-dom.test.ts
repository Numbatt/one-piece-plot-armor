// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  scanAndBlur,
  resetBlur,
  blurAllCandidates,
  resolveVerdicts,
  PROCESSED_ATTR,
} from '../src/content/reddit-dom'

// Layer 2 of the harness: prove the Reddit DOM logic works against a FAKE
// Reddit page — no live browser, no chrome.*. jsdom gives us a real DOM in
// Node. We build markup that mimics new/old Reddit, run the adapter helpers,
// and assert what got blurred.

// A minimal stand-in for a Reddit page: one spoiler comment, one safe comment,
// one post title. Uses the same selectors the adapter looks for.
function fakeRedditPage(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = `
    <h1 slot="title">One Piece 1071 discussion thread</h1>
    <div slot="comment">Gear 5 is the greatest moment in anime history</div>
    <div slot="comment">Zoro's swords look incredible this episode</div>
    <div class="md">Vegapunk reveal was worth the wait</div>
  `
  return root
}

const isBlurred = (el: Element) => el.querySelector('.opa-overlay') != null

describe('scanAndBlur', () => {
  let root: HTMLElement
  beforeEach(() => {
    root = fakeRedditPage()
  })

  it('blurs only the elements that spoil the viewer at their episode', () => {
    const blurred = scanAndBlur(root, 1000)
    // Gear 5 (1071) and Vegapunk (1090) spoil a viewer at 1000; the Zoro
    // comment and the "1071 discussion" title text don't contain future terms.
    expect(blurred).toHaveLength(2)
    // NB: after blurring, each element's textContent also contains the reveal
    // button's label (the button is appended as a child), so we match on
    // substring rather than exact equality.
    const texts = blurred.map((el) => el.textContent ?? '')
    expect(texts.some((t) => t.includes('Gear 5 is the greatest moment'))).toBe(true)
    expect(texts.some((t) => t.includes('Vegapunk reveal was worth the wait'))).toBe(true)
  })

  it('blurs nothing for a viewer who is caught up', () => {
    expect(scanAndBlur(root, 1200)).toHaveLength(0)
  })

  it('injects a reveal button that removes the overlay on click', () => {
    scanAndBlur(root, 1000)
    const spoiler = [...root.querySelectorAll('[slot="comment"]')].find(isBlurred)!
    const button = spoiler.querySelector<HTMLButtonElement>('.opa-reveal')!
    expect(button.textContent).toContain('ep 1071+')
    button.parentElement!.dispatchEvent(new Event('click'))
    expect(isBlurred(spoiler)).toBe(false)
  })

  it('never double-processes a node (idempotent across re-scans)', () => {
    scanAndBlur(root, 1000)
    const second = scanAndBlur(root, 1000) // e.g. a MutationObserver re-fire
    expect(second).toHaveLength(0)
    // Still exactly one overlay per spoiler, not two stacked.
    expect(root.querySelectorAll('.opa-overlay')).toHaveLength(2)
    expect(root.querySelectorAll(`[${PROCESSED_ATTR}]`).length).toBeGreaterThan(0)
  })
})

// The async cascade. These are the guarantees that let an LLM sit in the loop
// without ever leaking a spoiler, no matter how slow the model is.
describe('blurAllCandidates + resolveVerdicts (optimistic blur)', () => {
  let root: HTMLElement
  beforeEach(() => {
    root = fakeRedditPage()
  })

  it('blurs EVERY candidate before any verdict exists', () => {
    const scan = blurAllCandidates(root, 1000)
    // 4 candidates in the fixture, and not one of them is readable yet —
    // including the two the gazetteer has no opinion about.
    expect(scan.candidates).toHaveLength(4)
    expect(scan.candidates.every((c) => isBlurred(c.el))).toBe(true)
  })

  it('splits gazetteer hits (free, final) from the residual the model must judge', () => {
    const scan = blurAllCandidates(root, 1000)
    // Gear 5 (1071) and Vegapunk (1090) are known terms — resolved at 0ms.
    expect(scan.gazetteerHits).toHaveLength(2)
    // The Zoro comment and the title are ambiguous, so only they cost an API call.
    expect(scan.residual).toHaveLength(2)
  })

  it('un-blurs only what the model clears, and leaves spoilers blurred', () => {
    const scan = blurAllCandidates(root, 1000)
    const [safe, spoiler] = scan.residual

    resolveVerdicts(scan.residual, [
      { id: safe.id, spoiler: false, reason: 'ordinary praise' },
      { id: spoiler.id, spoiler: true, reason: 'references a future reveal' },
    ])

    expect(isBlurred(safe.el)).toBe(false)
    expect(isBlurred(spoiler.el)).toBe(true)
    // Gazetteer hits are untouched by model verdicts.
    expect(scan.gazetteerHits.every((c) => isBlurred(c.el))).toBe(true)
  })

  it('fails closed: a candidate with no verdict stays blurred', () => {
    const scan = blurAllCandidates(root, 1000)
    // The model dropped one entry from the batch — the classic silent failure.
    resolveVerdicts(scan.residual, [{ id: scan.residual[0].id, spoiler: false }])

    expect(isBlurred(scan.residual[0].el)).toBe(false)
    expect(isBlurred(scan.residual[1].el)).toBe(true)
  })

  it('does not let a pending overlay be dismissed before its verdict lands', () => {
    const scan = blurAllCandidates(root, 1000)
    const pending = scan.residual[0]
    // Clicking a "Checking…" overlay must not reveal unjudged text.
    pending.el.querySelector('.opa-overlay')!.dispatchEvent(new Event('click'))
    expect(isBlurred(pending.el)).toBe(true)
  })
})

describe('resetBlur', () => {
  it('removes overlays and clears processed marks so a re-scan starts clean', () => {
    const root = fakeRedditPage()
    scanAndBlur(root, 1000)
    resetBlur(root)
    expect(root.querySelectorAll('.opa-overlay')).toHaveLength(0)
    expect(root.querySelectorAll(`[${PROCESSED_ATTR}]`)).toHaveLength(0)
    // After reset, a viewer at a later episode re-scans with zero blurs.
    expect(scanAndBlur(root, 1200)).toHaveLength(0)
  })
})
