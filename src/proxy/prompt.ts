// ─────────────────────────────────────────────────────────────────────────────
// THE PROMPT — this file is YOURS to drive.
//
// This is the one piece of the LLM layer where the interesting decisions live.
// Everything else (the API call, the JSON schema, the eval runner) is plumbing.
// Your loop is: edit this prompt → run `npm run eval:llm` → read the scoreboard →
// repeat. You're trying to lift `implicit` and `structural` recall toward 100%
// WITHOUT introducing any false positive (precision must stay 100% — PLAN §2).
//
// Things to experiment with (each is a real lesson in prompt design):
//   • How you frame the asymmetry: "only flag if you're confident it spoils
//     someone at episode N" pushes precision up; "flag anything suspicious"
//     pushes recall up at precision's expense. Find the edge.
//   • Whether to give few-shot examples (a couple of the eval cases) — does it
//     help, or does it overfit?
//   • How much you lean on the model's own One Piece knowledge vs. how much you
//     spell out. (When knowledge alone stops being enough, that's the empirical
//     signal to build the RAG layer from PLAN §6 — the eval will tell you when.)
//   • Whether asking for a one-line `reason` improves the verdict (making a model
//     explain itself often does) or just costs tokens.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the system prompt. Receives `timelineFacts` — the exact term→episode
 * data from the gazetteer — so the model never has to RECALL an episode number,
 * only reason over one it's been handed. Kept as a function so you can later fold
 * in retrieved summaries (PLAN §6) the same way.
 */
export function buildSystemPrompt(timelineFacts: string): string {
  return [
    'You are a One Piece spoiler classifier for an anime-only viewer.',
    'You are given a social-media comment and the episode number the viewer has watched through.',
    'Decide whether the comment reveals something that happens AFTER their current episode.',
    '',
    'The cost of errors is asymmetric:',
    '- Missing a real spoiler is catastrophic and irreversible.',
    '- But blurring a safe, ordinary comment makes the tool unusable.',
    'So only flag a comment as a spoiler when you are genuinely confident it reveals',
    'post-episode content (a future form, a death, a twist, an alliance, an arc that',
    'has not happened yet). When in doubt about whether something is past their point,',
    'do NOT flag it.',
    '',
    'Judge by the anime timeline. Consider oblique references (nicknames, iconic lines,',
    'chapter/episode numbers in hashtags) as well as explicit names.',
    '',
    // ── FACTS SLOT — this framing is YOURS to tune ──────────────────────────
    // The lines below are a first draft. Experiment: does "trust these over your
    // own memory" help? Does putting the facts BEFORE the instructions above work
    // better? Should you tell it what to do when a comment mentions a term that
    // is NOT in this list? Run `npm run eval:llm` after each change.
    'Use these known timeline facts as ground truth. They are exact — trust them',
    'over your own memory of episode numbers:',
    timelineFacts,
    // ────────────────────────────────────────────────────────────────────────
  ].join('\n')
}

/** Build the per-comment user message. */
export function buildUserPrompt(text: string, currentEpisode: number): string {
  return [
    `Viewer has watched through episode ${currentEpisode}.`,
    'Comment:',
    `"""${text}"""`,
    '',
    'Is this a spoiler for this viewer?',
  ].join('\n')
}

/**
 * Build ONE user message covering many comments at once.
 *
 * Why batching exists at all — two independent reasons, both measured:
 *
 * 1. COST. The system prompt above is ~450 tokens and is re-sent on every
 *    single-comment call. Prompt caching can't rescue that: Haiku 4.5 only
 *    caches prefixes of 4096+ tokens, so a 450-token prefix silently never
 *    caches (no error — you just quietly pay full price forever). Batching is
 *    the lever that actually works: at 8 comments per call the fixed prompt is
 *    amortised 8 ways, so per-comment input drops from ~450 tokens to ~60.
 *
 * 2. LATENCY. One round trip for N comments instead of N round trips that
 *    queue behind each other. Measured on the old one-call-per-comment shape:
 *    40 comments took 10.7s of wall time.
 *
 * Each item carries an `id` so verdicts can be mapped back to the exact DOM
 * node they came from. Never rely on array order for that — a model that drops
 * or reorders one entry would shift every subsequent verdict onto the wrong
 * comment, silently un-blurring real spoilers.
 */
export function buildBatchUserPrompt(
  items: { id: string; text: string }[],
  currentEpisode: number,
): string {
  const numbered = items.map((it) => `[${it.id}] """${it.text}"""`).join('\n')
  return [
    `Viewer has watched through episode ${currentEpisode}.`,
    '',
    `Below are ${items.length} social-media comments, each tagged with an id.`,
    'Judge EACH ONE independently — the comments are unrelated to each other,',
    'and one being a spoiler says nothing about its neighbours.',
    '',
    numbered,
    '',
    `Return exactly ${items.length} verdicts, one per id, using the ids above.`,
  ].join('\n')
}
