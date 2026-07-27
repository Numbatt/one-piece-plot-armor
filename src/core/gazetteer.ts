// A GAZETTEER is a lookup list mapping a name to facts about it (the word comes
// from the place-name index in the back of an atlas). Ours maps a One Piece
// term to the episode where it is first revealed in the anime. If a comment
// mentions a term whose reveal episode is AFTER the viewer's current episode,
// that term is a spoiler for them.
//
// This is a tiny hand-written seed set. Later, the offline pipeline will
// generate a much larger gazetteer.json from the One Piece Wiki.

export interface GazetteerEntry {
  /** The canonical thing being revealed, e.g. "Gear 5". */
  term: string
  /** Anime episode where this is first revealed. */
  firstEpisode: number
  /** Other spellings people use for the same thing. */
  aliases?: string[]
}

export const GAZETTEER: GazetteerEntry[] = [
  { term: 'Gear 5', firstEpisode: 1071, aliases: ['Gear Fifth', 'Gear 5th', 'G5'] },
  { term: 'Joyboy', firstEpisode: 1071, aliases: ['Joy Boy'] },
  { term: 'Sun God Nika', firstEpisode: 1071, aliases: ['Sun God', 'Nika'] },
  { term: 'Kaido defeated', firstEpisode: 1076, aliases: ["Kaido's defeat", 'Kaido loses'] },
  { term: 'Luffy Yonko', firstEpisode: 1088, aliases: ['Luffy becomes Yonko', 'Luffy Emperor'] },
  { term: 'Egghead', firstEpisode: 1089, aliases: ['Egghead Island'] },
  { term: 'Vegapunk', firstEpisode: 1090, aliases: ['Dr. Vegapunk'] },
]

/**
 * Render the gazetteer as a plain-text fact list to hand the LLM as ground truth
 * (the "grounding" fix). This is what stops Haiku from hallucinating episode
 * numbers: instead of recalling that Gear 5 is ~ep 1071, it's TOLD the exact
 * number and only has to do the arithmetic.
 *
 * Today it dumps the whole gazetteer — fine at 7 entries. The day this is
 * thousands of wiki-derived rows, you can't fit them all in the prompt, and that
 * pressure is exactly what motivates retrieving only the relevant few (PLAN §6).
 */
export function renderTimelineFacts(): string {
  return GAZETTEER.map((e) => {
    const aliases = e.aliases?.length ? ` (also called: ${e.aliases.join(', ')})` : ''
    return `- ${e.term}${aliases} is first revealed in episode ${e.firstEpisode}`
  }).join('\n')
}
