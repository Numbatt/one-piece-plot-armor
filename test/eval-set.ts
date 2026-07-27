// THE EVAL SET — the single source of truth for "does this thing work?"
//
// Each case is a real-shaped social-media snippet plus ground truth: for a
// viewer at `episode`, is this a spoiler or not? This is PLAN §9. It is also
// the harness that lets changes be verified without anyone clicking through
// Reddit by hand.
//
// `kind` records WHICH layer of the cascade (PLAN §5) is supposed to catch a
// case. That lets the eval report say more than one pass/fail number: it can
// show *where* recall leaks. Today only the gazetteer exists, so `implicit`
// and `structural` spoilers are expected misses — that expected gap is the
// concrete, measured argument for building the LLM + structural layers next.
//
// `severity` matters because the error costs are asymmetric (PLAN §2): missing
// a `severe` spoiler (a death, a future form, an endgame twist) is the
// catastrophic case, so we track recall on those separately.

export type Severity = 'severe' | 'mild'

export type Kind =
  | 'named' // a proper-noun reveal the gazetteer should catch outright
  | 'implicit' // an oblique reference with no gazetteer term (needs the LLM)
  | 'structural' // a chapter/episode-number / spoiler-tag signal (needs §5 step 2)
  | 'safe' // not a spoiler; must NOT be blurred (guards precision)

export interface EvalCase {
  text: string
  /** How far the viewer has watched. */
  episode: number
  /** Ground truth: is `text` a spoiler for a viewer at `episode`? */
  spoiler: boolean
  severity?: Severity
  kind: Kind
  /**
   * Where the case came from. 'authored' = hand-written by us; 'real' = a genuine
   * comment lifted (by a human) from a live platform. Kept so we can later measure
   * whether the classifier does WORSE on real comments than on ones an LLM dreamed
   * up — the monoculture blind spot. Omitted → treat as 'authored'.
   *
   * The `real` slice is the one an LLM cannot generate honestly; it's the human's
   * job to collect and label those. That slice is what keeps this eval trustworthy.
   */
  source?: 'authored' | 'real'
  note?: string
}

// Gazetteer anchor episodes referenced below: Gear 5 → 1071, Kaido defeated →
// 1076, Luffy Yonko → 1088, Egghead → 1089, Vegapunk → 1090.
export const EVAL_SET: EvalCase[] = [
  // ---- Named reveals the gazetteer SHOULD catch (the happy path) ------------
  {
    text: 'Gear 5 is the single best moment in the entire series, no debate',
    episode: 1000,
    spoiler: true,
    severity: 'severe',
    kind: 'named',
    note: 'Future form revealed at 1071; viewer at 1000 has not earned it.',
  },
  {
    text: 'G5 Luffy goes so unbelievably hard',
    episode: 1000,
    spoiler: true,
    severity: 'severe',
    kind: 'named',
    note: 'Alias of Gear 5 — exercises alias matching.',
  },
  {
    text: "Can't believe they finally showed Vegapunk in the flesh",
    episode: 1085,
    spoiler: true,
    severity: 'mild',
    kind: 'named',
    note: 'Vegapunk revealed at 1090; viewer at 1085 is just short.',
  },

  // ---- Same text, viewer is AHEAD → not a spoiler (episode-threshold logic) --
  {
    text: 'Gear 5 is the single best moment in the entire series, no debate',
    episode: 1080,
    spoiler: false,
    kind: 'safe',
    note: 'Viewer past 1071 has already seen Gear 5. Must not blur.',
  },
  {
    text: 'Gear 5 awakening scene',
    episode: 1071,
    spoiler: false,
    kind: 'safe',
    note: 'Boundary: reveal episode == current episode counts as already-seen.',
  },

  // ---- Precision guards: things that must NOT be blurred ---------------------
  {
    text: "Luffy's straw hat is such an iconic silhouette",
    episode: 10,
    spoiler: false,
    kind: 'safe',
    note: 'Ordinary early-series talk. Zero spoiler terms.',
  },
  {
    text: 'I main Nikaidou in the fighting game and she is fun',
    episode: 900,
    spoiler: false,
    kind: 'safe',
    note: 'Contains the substring "Nika" — the word-boundary guard must not fire.',
  },

  // ---- Implicit spoilers the gazetteer CANNOT catch (expected misses) --------
  {
    text: 'the drums of liberation started playing and I completely lost it',
    episode: 1000,
    spoiler: true,
    severity: 'severe',
    kind: 'implicit',
    note: 'Oblique reference to the Gear 5 / Nika awakening. No literal term. Needs the LLM layer.',
  },
  {
    text: 'so THAT is who was frozen in the ice this whole time, my jaw dropped',
    episode: 1000,
    spoiler: true,
    severity: 'severe',
    kind: 'implicit',
    note: 'A twist described without naming anything. Gazetteer is blind to it.',
  },

  // ---- Structural signals (chapter/episode numbers, spoiler tags) ------------
  {
    text: '#OP1071 spoilers below, do not scroll if you are anime only',
    episode: 1000,
    spoiler: true,
    severity: 'severe',
    kind: 'structural',
    note: 'The number itself is the signal (1071 > 1000). Needs §5 step 2.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORED ADVERSARIAL BATCH
  //
  // Every case below is anchored on a gazetteer term (Gear 5/Joyboy/Sun God Nika
  // = 1071, Kaido defeated = 1076, Luffy Yonko = 1088, Egghead = 1089, Vegapunk =
  // 1090) or the clearly-ep-1071 awakening. The label is therefore COMPUTED —
  // (term episode ≤ viewer? not a spoiler : spoiler) — not recalled, so it's
  // defensible. These probe the failure modes the original 11 don't:
  // mixed-seen+unseen, precision traps, boundaries, negation, structural-safe.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Mixed seen + unseen — the case a naive "seen term → safe" override breaks ─
  {
    text: 'Gear 5 was peak but honestly Egghead is even better so far',
    episode: 1075,
    spoiler: true,
    severity: 'severe',
    kind: 'named',
    source: 'authored',
    note: 'Gear 5 (1071) is seen, but Egghead (1089) is not → still a spoiler. One safe term does not make the comment safe.',
  },
  {
    text: "loved Kaido's defeat, but Vegapunk steals the whole next stretch",
    episode: 1080,
    spoiler: true,
    severity: 'severe',
    kind: 'named',
    source: 'authored',
    note: "Kaido defeated (1076) seen; Vegapunk (1090) unseen and literally named → gazetteer catches it. Mixed seen+unseen.",
  },

  // ── Precision traps: names a future thing, but the viewer is PAST it → safe ──
  {
    text: 'rewatching the Gear 5 reveal for the tenth time, still cry every time',
    episode: 1100,
    spoiler: false,
    kind: 'safe',
    source: 'authored',
    note: 'Sounds spoilery, but Gear 5 (1071) ≤ 1100 → already seen. Must not blur.',
  },
  {
    text: "Kaido's defeat had the cleanest animation in the whole arc",
    episode: 1085,
    spoiler: false,
    kind: 'safe',
    source: 'authored',
    note: 'Kaido defeated (1076) ≤ 1085 → seen.',
  },
  {
    text: 'Vegapunk is honestly such a fun character',
    episode: 1200,
    spoiler: false,
    kind: 'safe',
    source: 'authored',
    note: 'Vegapunk (1090) ≤ 1200 → seen.',
  },

  // ── Boundary: reveal episode == viewer's episode → counts as seen ────────────
  {
    text: 'Egghead arc officially kicks off this episode',
    episode: 1089,
    spoiler: false,
    kind: 'safe',
    source: 'authored',
    note: 'Egghead (1089) == 1089 → seen, per the ≤ rule.',
  },

  // ── Named, future → spoiler (aliases exercised) ─────────────────────────────
  {
    text: 'Gear Fifth completely rewrites the power scaling of the series',
    episode: 1040,
    spoiler: true,
    severity: 'severe',
    kind: 'named',
    source: 'authored',
    note: 'Alias "Gear Fifth" → Gear 5 (1071) > 1040.',
  },
  {
    text: 'the Joy Boy reveal is the best long-game payoff in all of fiction',
    episode: 1050,
    spoiler: true,
    severity: 'severe',
    kind: 'named',
    source: 'authored',
    note: 'Joyboy (1071) > 1050.',
  },
  {
    text: 'Luffy becoming an Emperor of the Sea felt so earned',
    episode: 1082,
    spoiler: true,
    severity: 'severe',
    kind: 'implicit',
    source: 'authored',
    note: 'Paraphrase of Luffy Yonko (1088 > 1082) — no literal gazetteer alias, so this is LLM territory, not "named".',
  },

  // ── Implicit, ep-1071 awakening cluster (no gazetteer alias → LLM-only) ──────
  {
    text: 'the drums of liberation started playing and the whole fandom lost it',
    episode: 1000,
    spoiler: true,
    severity: 'severe',
    kind: 'implicit',
    source: 'authored',
    note: 'Oblique reference to the ep-1071 awakening. No literal term.',
  },
  {
    text: 'the screen went white, his heartbeat turned into a drumbeat, and everything changed',
    episode: 1000,
    spoiler: true,
    severity: 'severe',
    kind: 'implicit',
    source: 'authored',
    note: 'Describes the ep-1071 awakening without naming it.',
  },
  {
    text: 'ギア5 was absolutely insane, no spoilers but wow',
    episode: 1000,
    spoiler: true,
    severity: 'severe',
    kind: 'implicit',
    source: 'authored',
    note: 'Japanese for Gear 5 (1071) — the gazetteer will not match it; tests non-English handling.',
  },

  // ── Structural: episode number in the text ──────────────────────────────────
  {
    text: '#OP1089 leaked panels are in the replies, anime-onlys run',
    episode: 1000,
    spoiler: true,
    severity: 'severe',
    kind: 'structural',
    source: 'authored',
    note: '1089 > 1000.',
  },
  {
    text: 'episode 1090 discussion thread — untagged spoilers everywhere',
    episode: 1050,
    spoiler: true,
    severity: 'mild',
    kind: 'structural',
    source: 'authored',
    note: '1090 > 1050.',
  },
  {
    text: 'starting a full rewatch from the #OP1071 episode, best arc ever',
    episode: 1150,
    spoiler: false,
    kind: 'safe',
    source: 'authored',
    note: 'Structural precision trap: 1071 ≤ 1150 → the referenced episode is behind the viewer.',
  },

  // ── Negation / sarcasm — does NOT neutralize a proper-noun leak ──────────────
  {
    text: 'imagine if Luffy never unlocked Gear 5 💀 couldnt be me',
    episode: 1000,
    spoiler: true,
    severity: 'severe',
    kind: 'named',
    source: 'authored',
    note: 'Sarcasm/negation, but naming Gear 5 (1071) still reveals it exists → spoiler.',
  },

  // ── Safe: ordinary early-series talk, no future terms ───────────────────────
  {
    text: 'Zoro getting lost every single arc never stops being funny',
    episode: 500,
    spoiler: false,
    kind: 'safe',
    source: 'authored',
    note: 'No spoiler terms; running joke from early on.',
  },
  {
    text: 'Going Merry deserved better, I still tear up thinking about it',
    episode: 350,
    spoiler: false,
    kind: 'safe',
    source: 'authored',
    note: 'Water 7 / early-series; nothing future.',
  },
  {
    text: 'just hit G500 karma on that meme lmao',
    episode: 1000,
    spoiler: false,
    kind: 'safe',
    source: 'authored',
    note: 'Substring trap: contains "G5" inside "G500" but is not the Gear 5 alias.',
  },
]
