# One Piece Plot Armor — Plan

## 1. What it is

A browser extension that blurs One Piece spoilers across social media, calibrated
to the exact episode you're on. One Piece only.

**Hero user:** the anime-only fan catching up through 1000+ episodes, who cannot
avoid r/OnePiece / Twitter / Instagram and gets blindsided by manga readers and
future-content leaks. Their pain is acute, constant, and loud.

**Primary threat model:** content from *past the user's current episode* — most
dangerously, manga-reader leaks (future forms like Gear 5, deaths, the Void
Century, endgame reveals) surfacing in places built for engagement, not safety.

## 2. Design principle: precision-first

Spoiler filtering has wildly asymmetric error costs:

- **Missed spoiler (false negative):** catastrophic, irreversible, destroys trust.
- **Over-blur (false positive):** friction; recoverable via a reveal button, but
  past a density it makes the page unusable and gets us uninstalled.

So the objective is **maximize precision subject to a high recall floor on severe
spoilers** (deaths / twists / future forms / endgame). "Blur everything to be
safe" is 100% recall and 0% precision — unusable, which is 0% recall in practice.
We only blur when confident.

Niching to One Piece is what makes high precision achievable: a bounded, heavily
documented world where (a) reveals map to known timeline points, (b) an LLM
already has deep knowledge, and (c) per-episode source material actually exists.

## 3. Progress model

- **Manual episode number.** A single integer the user sets once and nudges. This
  is the only source that covers the whole audience regardless of where/how they
  watch (Crunchyroll continue-watching, Netflix, etc.) or whether they track at
  all. One Piece is one continuous show, so a number genuinely replaces any
  tracker integration.
- **Optional manga chapter.** Default anime-only; a "I also read the manga up to
  chapter ___" toggle for the subset who need manga-spoiler leniency.
- **Deferred:** auto-detection (Crunchyroll continue-watching content script) and
  any optional AniList/MAL sync. Nice-to-have v2 magic, not the foundation. No
  OAuth on the critical path.

## 4. Architecture

Three parts, one classifier shared across all platforms:

```
[ Browser extension ]                    [ Classify proxy ]        [ Offline pipeline ]
 per-platform adapter                     holds API key             One Piece Wiki
   -> extract candidates                  gazetteer (full)            -> per-episode summaries
   -> local gazetteer fast-path           LLM (Haiku) + RAG            -> first-appearance data
   -> proxy call (residual only)          verdict cache                -> arc/saga structure
   -> blur / reveal UI                       ^                              |
 progress state (episode N)                   |  top-k retrieval            v
                                              +---------------------  gazetteer.json + vector index
```

1. **Extension** — thin per-platform *adapters* over a shared *core*
   (extract → classify → blur). Ships a compact gazetteer for an instant,
   offline, high-precision first pass. Holds the user's episode number locally.
2. **Classify proxy** — server endpoint that owns the API key, runs the LLM +
   retrieval for the ambiguous residual, and caches verdicts. (Reuses the
   Vercel-proxy pattern from the prototype.)
3. **Offline data pipeline** — build-time ingestion of One Piece source material
   into two compact artifacts: the gazetteer and an embedded summary index. Runs
   once (and on a refresh cadence as new episodes/chapters drop). **The runtime
   never touches the raw corpus.**

## 5. The classifier: a cascade (precision + bounded cost)

Ordered cheapest/most-precise first; stop early when confident.

1. **Gazetteer lookup** — a precomputed map `term/alias -> first-reveal episode`
   (Gear 5 → ep 1071, Joyboy → ep 1071, Marineford death beats → their eps, etc.).
   Deterministic, runs locally in the extension, near-zero false positives on
   named reveals. Handles the *majority* of real One Piece spoilers because they
   involve recognizable proper nouns with known timeline positions.
2. **Structural signals** — spoiler-tagged conventions: chapter/episode numbers in
   hashtags (`#OP1120`, "chapter 1130 leak"), subreddit/flair context, "manga
   spoilers" markers. Strong, cheap priors.
3. **LLM (Haiku) + RAG** — only for implicit/ambiguous comments a gazetteer can't
   catch ("the drums of liberation" = a Gear 5 reference; "so THAT'S who was in
   the ice"). Grounded with top-k retrieved summaries + the user's episode.
4. **Verdict cache** — keyed by `(text-hash, progress-bucket)`. Repeated
   comments/tweets cost nothing; buckets keep the decision space small.

## 6. Getting per-episode source material without blowing up context

The corpus is huge (1000+ episodes). The rule: **push the bulk to offline
preprocessing; keep runtime context to a comment + progress + a few snippets.**

- **Offline pipeline → two compact artifacts.** Ingest the One Piece Wiki once and
  produce:
  - `gazetteer.json` — `term -> first_episode` (+ arc). Small enough
    (~hundreds of KB) to ship inside the extension for the local fast path.
  - a **vector index** of per-episode / per-arc summary chunks (embedded), stored
    with the proxy.
- **Retrieve top-k, never the whole thing.** At classify time we embed the comment
  and pull the 3–5 most relevant summary chunks. Context per call stays tiny and
  *constant* regardless of the 1000+ total episodes.
- **Hierarchy to stay compact.** One Piece is organized saga → arc → episode.
  Prefer **arc-level** summaries (there are ~40 arcs vs 1000+ episodes) for most
  decisions; drop to episode granularity only when needed. The gazetteer is
  anchored at episode precision so the boundary check stays exact.
- **Progress bucketing.** Bucket the user's episode by arc boundaries (someone at
  ep 950 vs 962 both "know up to Wano part N"). Shrinks the decision space,
  massively improves cache hit rate, and lets us precompute per-bucket answers.
- **Net:** the model never ingests the series. It sees one comment, one number,
  and a handful of retrieved lines — with a deterministic gazetteer catching most
  cases before the LLM is even called.

## 7. Detecting spoilers across many platforms

Reddit, Twitter/X, Instagram, and beyond differ enormously in DOM, content type,
and spoiler vectors. Structure: **shared core + thin per-platform adapters.**

- **Adapter pattern.** Each platform gets a small content script that knows only:
  how to find candidate content (comments / tweets / captions), how to inject the
  blur overlay, and how to watch its infinite-scroll SPA (MutationObserver). The
  extraction → classify → blur core is platform-agnostic. The gazetteer works
  everywhere because entities are entities regardless of site.
- **Per-platform specifics:**
  - **Reddit** — comment bodies + post titles; episode/chapter *discussion threads*
    give strong context (this thread is about episode K). Best starting point;
    proven in the prototype. Flairs ("Current Chapter", "Anime Only") are signals.
  - **Twitter / X** — standalone tweets, quote-tweets, replies, trends. No thread
    context, so lean on the gazetteer + hashtags (`#OnePiece`, `#OP1120`) and
    chapter-number mentions as strong spoiler signals. High-volume leak vector.
  - **Instagram** — captions + comments, but content is media-dominant (Reels,
    fan art, leaked panels). Text classification alone misses a lot here.
- **Scope gating for precision + cost.** Only scan One-Piece-relevant content
  (OP hashtags/keywords/subreddits/known leak accounts) rather than every node on
  the page. Keeps false positives and LLM spend down.
- **The distinctly-One-Piece hard problem: media spoilers.** Leaked manga panels,
  key visuals, and fan art of future forms are *images*, and they're a top spoiler
  vector for OP specifically. Text classification can't see them. Staged approach:
  1. text-first (ship this);
  2. blur media that sits next to spoiler-classified text or in high-risk contexts
     (a hashtag/account known for leaks), reveal on demand;
  3. vision/OCR classification of images as a stretch (expensive, latency — behind
     the proxy, cached).
- **Shared blur/reveal UI** injected uniformly across platforms.

## 8. Phasing (hackathon-shaped)

- **MVP / demo:** Reddit adapter + manual episode input + gazetteer cascade +
  Haiku-proxy for the residual + blur/reveal. Demoable and *precise* on its own.
- **P1:** Twitter/X adapter + hashtag/chapter-number signals.
- **P2:** Instagram adapter + media-blur heuristics.
- **P3:** vision-based image spoiler detection.
- **P4:** Crunchyroll auto-progress; expansion to other long-runners (Naruto,
  Bleach, JJK) reusing the same gazetteer + summary pipeline.

## 9. Evaluation

A small **progress-relative** labeled set of real comments/tweets across a few
arcs: "spoiler for someone at episode N?" Measure precision/recall per severity.
The gazetteer bootstraps labels semi-automatically. This is how we prove precision
is high and compare gazetteer-only vs +LLM vs prompt variants — not vibes.

## 10. Cost / latency / privacy

- Cache-first; the local gazetteer is free and catches most cases, so the LLM only
  sees the ambiguous residual.
- Batch LLM calls per page; cache verdicts by `(text-hash, progress-bucket)`.
- Privacy: ambiguous text is sent to the proxy/LLM. Minimize it (gazetteer filters
  first), hash for cache keys, don't send content the fast path already resolved.

## 11. Tech stack

- **Extension:** Manifest V3, Vite + TypeScript. Reuse the proven blur-pipeline
  patterns from the earlier prototype, reimplemented clean in this repo.
- **Proxy:** Vercel (or Cloudflare Workers). Claude Haiku for classification.
- **Data pipeline:** a small ingestion script → `gazetteer.json` + embedded summary
  index (start simple: JSON + in-proxy cosine similarity; graduate to a vector DB
  only if needed).

## 12. Open decisions

- Vector store: in-proxy JSON+cosine vs a hosted vector DB.
- How much of the gazetteer ships client-side vs proxy-only.
- Media-spoiler ambition for the hackathon window (heuristic vs vision).
- One Piece Wiki ingestion: scraping approach, ToS/rate limits, refresh cadence.
- Severity taxonomy + per-severity blur treatment (hard blur vs soft mark).
