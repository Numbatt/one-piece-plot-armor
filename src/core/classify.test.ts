import { describe, it, expect } from 'vitest'
import { classify } from './classify'

// Focused unit tests for the pure core. The eval set proves the SYSTEM is good;
// these prove the MECHANICS are correct — the small, easy-to-break rules that,
// if wrong, would silently poison every eval number above.

describe('classify — episode threshold', () => {
  it('flags a reveal from the future', () => {
    expect(classify('Gear 5 spoilers', 1000).map((h) => h.term)).toContain('Gear 5')
  })

  it('does not flag a reveal already seen', () => {
    expect(classify('Gear 5 spoilers', 1071)).toHaveLength(0)
  })

  it('treats the reveal episode itself as already-seen (<=, not <)', () => {
    // Gear 5 is revealed IN 1071, so a viewer at 1071 has seen it.
    expect(classify('Gear 5', 1071)).toHaveLength(0)
    expect(classify('Gear 5', 1070)).toHaveLength(1)
  })
})

describe('classify — matching', () => {
  it('is case-insensitive', () => {
    expect(classify('GEAR 5 was insane', 1000)).toHaveLength(1)
  })

  it('matches aliases', () => {
    expect(classify('G5 goes hard', 1000).map((h) => h.term)).toContain('Gear 5')
  })

  it('requires whole-word matches (no substring false positives)', () => {
    // "Nika" must not fire inside "Nikaidou"; that guard is what keeps
    // precision high on ordinary text.
    expect(classify('I main Nikaidou', 1000)).toHaveLength(0)
  })

  it('reports the earliest matched reveal via firstEpisode', () => {
    const hits = classify('Gear 5 and Vegapunk', 1000)
    expect(Math.min(...hits.map((h) => h.firstEpisode))).toBe(1071)
  })

  it('returns an empty array for spoiler-free text', () => {
    expect(classify('Luffy loves meat', 1)).toEqual([])
  })
})
