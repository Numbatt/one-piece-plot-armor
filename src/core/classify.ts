import { GAZETTEER } from './gazetteer'

// This module is PLATFORM-AGNOSTIC: it knows nothing about Reddit, the DOM, or
// the browser. It answers one pure question: given some text and how far the
// viewer has watched, which gazetteer terms in that text are spoilers?
//
// Keeping it pure means we can reuse it unchanged for Twitter/Instagram later,
// and test it without a browser.

export interface SpoilerHit {
  /** The canonical term that was matched. */
  term: string
  /** Episode it's revealed in (so the UI can say "spoiler for ep 1071+"). */
  firstEpisode: number
  /** The exact string found in the text (term or one of its aliases). */
  matchedText: string
}

/**
 * Return every gazetteer term that (a) appears in `text` and (b) is revealed
 * AFTER `currentEpisode`. An empty array means "no spoiler — don't blur".
 */
export function classify(text: string, currentEpisode: number): SpoilerHit[] {
  const hits: SpoilerHit[] = []
  const haystack = text.toLowerCase()

  for (const entry of GAZETTEER) {
    // The viewer has already seen this reveal, so it can't spoil them. Skip.
    if (entry.firstEpisode <= currentEpisode) continue

    const names = [entry.term, ...(entry.aliases ?? [])]
    for (const name of names) {
      if (containsWord(haystack, name.toLowerCase())) {
        hits.push({
          term: entry.term,
          firstEpisode: entry.firstEpisode,
          matchedText: name,
        })
        break // one match per entry is enough
      }
    }
  }

  return hits
}

/**
 * Whole-"word" match, so "G5" doesn't fire inside "G500" and "Nika" doesn't
 * fire inside "Nikaidou". We require a non-word character (or the string edge)
 * on both sides of the needle. `haystack` and `needle` are already lowercased.
 */
function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`)
  return re.test(haystack)
}
