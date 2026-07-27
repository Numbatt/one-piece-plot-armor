# Cascade scorecard — 2026-07-27T01:42:08.789Z


Of 29 cases, the word-list resolved 8 instantly and for free; the remaining 21 went to a model.

```
lane                     precision   recall   severe   no-answer      p50       p95     $/1k
────────────────────────────────────────────────────────────────────────────────────────────
Gemma 4 31B · Cerebras        100%     100%     100%           0    384ms   58653ms   $0.385
Gemma 4 31B · GPU             100%     100%     100%           0   1074ms    6724ms   $0.067
Claude Haiku 4.5              100%      82%      80%           0   1299ms    7016ms   $0.579
```

- **precision** — of everything it hid, how much genuinely was a spoiler.
- **recall** — of every real spoiler, how much it actually hid.
- **severe** — recall on deaths, future forms, and endgame twists only.
- **no-answer** — comments the model skipped. They stay hidden (safe), but
  they count against precision, so a non-zero number here means shrink the
  batch, not rewrite the prompt.
- **p50 / p95** — round trip for one batch of 20 comments. This is the wait.
- **$/1k** — cost per 1,000 comments processed, word-list ones included.

**Precision is 100% on every lane** — nothing safe got hidden, which is the hard rule.

## Gemma 4 31B · Cerebras — verdicts on the tricky (non-word-list) cases

- **OK  ** hide=false [safe] "Gear 5 is the single best moment in the entire series, no debate"
  - Gear 5 was first revealed in episode 1071, which is before the viewer's current episode 1080.
- **OK  ** hide=false [safe] "Gear 5 awakening scene"
  - Gear 5 is first revealed in episode 1071, which the viewer has already watched.
- **OK  ** hide=false [safe] "Luffy's straw hat is such an iconic silhouette"
  - The straw hat is introduced at the very beginning of the series.
- **OK  ** hide=false [safe] "I main Nikaidou in the fighting game and she is fun"
  - The comment refers to a character name from a fighting game, not Sun God Nika from One Piece.
- **OK  ** hide=true  [implicit] "the drums of liberation started playing and I completely lost it"
  - The 'drums of liberation' refer to Gear 5, which is revealed in episode 1071.
- **OK  ** hide=true  [implicit] "so THAT is who was frozen in the ice this whole time, my jaw dropped"
  - This refers to a major character reveal that happens well after episode 1000.
- **OK  ** hide=true  [structural] "#OP1071 spoilers below, do not scroll if you are anime only"
  - The hashtag explicitly references episode 1071, which is beyond the viewer's progress.
- **OK  ** hide=false [safe] "rewatching the Gear 5 reveal for the tenth time, still cry every time"
  - Gear 5 was revealed in episode 1071, which the viewer has already passed.
- **OK  ** hide=false [safe] "Kaido's defeat had the cleanest animation in the whole arc"
  - Kaido's defeat occurs in episode 1076, which the viewer has already seen.
- **OK  ** hide=false [safe] "Vegapunk is honestly such a fun character"
  - Vegapunk was introduced in episode 1090, which the viewer has already passed.
- **OK  ** hide=false [safe] "Egghead arc officially kicks off this episode"
  - Egghead was first revealed in episode 1089, so this is current information for the viewer.
- **OK  ** hide=true  [implicit] "Luffy becoming an Emperor of the Sea felt so earned"
  - Luffy becoming a Yonko/Emperor is first revealed in episode 1088, which is after episode 1082.
- **OK  ** hide=true  [implicit] "the drums of liberation started playing and the whole fandom lost it"
  - The 'drums of liberation' refer to Gear 5, which is revealed in episode 1071.
- **OK  ** hide=true  [implicit] "the screen went white, his heartbeat turned into a drumbeat, and every"
  - The description of the white screen and drumbeat heartbeat describes the Gear 5 transformation in episode 1071.
- **OK  ** hide=true  [implicit] "ギア5 was absolutely insane, no spoilers but wow"
  - ギア5 is Japanese for Gear 5, which is revealed in episode 1071.
- **OK  ** hide=true  [structural] "#OP1089 leaked panels are in the replies, anime-onlys run"
  - The hashtag explicitly references episode 1089, which is beyond the viewer's progress.
- **OK  ** hide=true  [structural] "episode 1090 discussion thread — untagged spoilers everywhere"
  - The comment references episode 1090, which is significantly beyond the viewer's current episode 1050.
- **OK  ** hide=false [safe] "starting a full rewatch from the #OP1071 episode, best arc ever"
  - The viewer has watched through episode 1150, so episode 1071 is in their past.
- **OK  ** hide=false [safe] "Zoro getting lost every single arc never stops being funny"
  - This is a general observation about a character trait established early in the series.
- **OK  ** hide=false [safe] "Going Merry deserved better, I still tear up thinking about it"
  - The events surrounding the Going Merry occur before episode 350.
- **OK  ** hide=false [safe] "just hit G500 karma on that meme lmao"
  - This is a reference to Reddit karma points, not Gear 5.

## Gemma 4 31B · GPU — verdicts on the tricky (non-word-list) cases

- **OK  ** hide=false [safe] "Gear 5 is the single best moment in the entire series, no debate"
  - The viewer has watched through episode 1080, and Gear 5 was first revealed in episode 1071.
- **OK  ** hide=false [safe] "Gear 5 awakening scene"
  - Gear 5 is first revealed in episode 1071, which the viewer has already watched.
- **OK  ** hide=false [safe] "Luffy's straw hat is such an iconic silhouette"
  - The straw hat is introduced in the first episode.
- **OK  ** hide=false [safe] "I main Nikaidou in the fighting game and she is fun"
  - The comment refers to a character named 'Nikaidou' in a fighting game, not Sun God Nika from One Piece.
- **OK  ** hide=true  [implicit] "the drums of liberation started playing and I completely lost it"
  - The 'drums of liberation' are intrinsically linked to Gear 5 and Nika, first revealed in episode 1071.
- **OK  ** hide=true  [implicit] "so THAT is who was frozen in the ice this whole time, my jaw dropped"
  - Reference to a major identity reveal involving someone frozen in ice occurs well after episode 1000.
- **OK  ** hide=true  [structural] "#OP1071 spoilers below, do not scroll if you are anime only"
  - Explicitly mentions episode 1071, which is beyond the viewer's progress.
- **OK  ** hide=false [safe] "rewatching the Gear 5 reveal for the tenth time, still cry every time"
  - Gear 5 was first revealed in episode 1071, and the viewer has watched through episode 1100.
- **OK  ** hide=false [safe] "Kaido's defeat had the cleanest animation in the whole arc"
  - The viewer has watched through episode 1085, and Kaido's defeat occurred in episode 1076.
- **OK  ** hide=false [safe] "Vegapunk is honestly such a fun character"
  - Vegapunk was first revealed in episode 1090, and the viewer has watched through episode 1200.
- **OK  ** hide=false [safe] "Egghead arc officially kicks off this episode"
  - The viewer has watched through episode 1089, and Egghead Island was first revealed in episode 1089. Therefore, referencing the start of the Egghead arc is not a spoiler.
- **OK  ** hide=true  [implicit] "Luffy becoming an Emperor of the Sea felt so earned"
  - Luffy becoming an Emperor (Yonko) is first revealed in episode 1088, which is after the viewer's current episode 1082.
- **OK  ** hide=true  [implicit] "the drums of liberation started playing and the whole fandom lost it"
  - The 'drums of liberation' are linked to Gear 5, first revealed in episode 1071.
- **OK  ** hide=true  [implicit] "the screen went white, his heartbeat turned into a drumbeat, and every"
  - Describes the specific visual and auditory transformation of Luffy into Gear 5 (episode 1071).
- **OK  ** hide=true  [implicit] "ギア5 was absolutely insane, no spoilers but wow"
  - ギア5 is Japanese for Gear 5, which is first revealed in episode 1071.
- **OK  ** hide=true  [structural] "#OP1089 leaked panels are in the replies, anime-onlys run"
  - Explicitly mentions episode 1089, which is beyond the viewer's progress.
- **OK  ** hide=true  [structural] "episode 1090 discussion thread — untagged spoilers everywhere"
  - The comment refers to episode 1090, which is beyond the viewer's current episode (1050) and corresponds to the revelation of Vegapunk.
- **OK  ** hide=false [safe] "starting a full rewatch from the #OP1071 episode, best arc ever"
  - The viewer has watched through episode 1150, so content from episode 1071 is in their past.
- **OK  ** hide=false [safe] "Zoro getting lost every single arc never stops being funny"
  - This is a general comment about a recurring character trait that has been established since the beginning of the series.
- **OK  ** hide=false [safe] "Going Merry deserved better, I still tear up thinking about it"
  - The departure of the Going Merry occurs well before episode 350.
- **OK  ** hide=false [safe] "just hit G500 karma on that meme lmao"
  - Reference to 'G500 karma' is a social media metric, not a reference to Gear 5.

## Claude Haiku 4.5 — verdicts on the tricky (non-word-list) cases

- **OK  ** hide=false [safe] "Gear 5 is the single best moment in the entire series, no debate"
  - Gear 5 was first revealed in episode 1071, which is before the viewer's current episode 1080.
- **OK  ** hide=false [safe] "Gear 5 awakening scene"
  - Gear 5 awakening is first revealed in episode 1071, which is the viewer's current stopping point.
- **OK  ** hide=false [safe] "Luffy's straw hat is such an iconic silhouette"
  - This comment discusses Luffy's hat as a general iconic symbol, which is established from the very beginning of One Piece and contains no post-episode 10 information.
- **OK  ** hide=false [safe] "I main Nikaidou in the fighting game and she is fun"
  - The comment discusses a fighting game character named Nikaidou with no relation to future One Piece events.
- **WRONG** hide=false [implicit] "the drums of liberation started playing and I completely lost it"
  - References 'drums of liberation' but this phrase and dramatic music moments occur throughout the series, not specifically tied to post-episode 1000 events.
- **WRONG** hide=false [implicit] "so THAT is who was frozen in the ice this whole time, my jaw dropped"
  - A vague reference to someone being frozen without specific identifying details that would reveal future plot points.
- **OK  ** hide=true  [structural] "#OP1071 spoilers below, do not scroll if you are anime only"
  - Explicitly references episode 1071 and warns of spoilers, which is well beyond episode 1000 and covers major revelations.
- **OK  ** hide=false [safe] "rewatching the Gear 5 reveal for the tenth time, still cry every time"
  - Gear 5 was revealed in episode 1071, well before the viewer's current progress of episode 1100.
- **OK  ** hide=false [safe] "Kaido's defeat had the cleanest animation in the whole arc"
  - Kaido's defeat was revealed in episode 1076, which is before the viewer's current episode 1085.
- **OK  ** hide=false [safe] "Vegapunk is honestly such a fun character"
  - Vegapunk was introduced by episode 1090, which is well before the viewer's current episode 1200.
- **OK  ** hide=false [safe] "Egghead arc officially kicks off this episode"
  - Egghead Island was first revealed in episode 1089, so this comment is discussing content the viewer has already seen.
- **OK  ** hide=true  [implicit] "Luffy becoming an Emperor of the Sea felt so earned"
  - References Luffy becoming a Yonko/Emperor, which is first revealed in episode 1088, after the viewer's current progress at episode 1082.
- **WRONG** hide=false [implicit] "the drums of liberation started playing and the whole fandom lost it"
  - References 'drums of liberation' in a general fandom reaction context without revealing specific future events.
- **OK  ** hide=true  [implicit] "the screen went white, his heartbeat turned into a drumbeat, and every"
  - The description of a screen going white, heartbeat transforming into drumbeat is a highly specific sequence associated with Gear 5's first revelation in episode 1071.
- **OK  ** hide=true  [implicit] "ギア5 was absolutely insane, no spoilers but wow"
  - Explicitly mentions ギア5 (Gear 5), which is first revealed in episode 1071, well past the viewer's current point.
- **OK  ** hide=true  [structural] "#OP1089 leaked panels are in the replies, anime-onlys run"
  - Explicitly references episode 1089 with leaked panels and warns anime-onlys to avoid, indicating major spoiler content beyond episode 1000.
- **OK  ** hide=true  [structural] "episode 1090 discussion thread — untagged spoilers everywhere"
  - The comment references episode 1090, which is 40 episodes ahead of the viewer's current position at episode 1050, and explicitly warns of untagged spoilers in that thread.
- **OK  ** hide=false [safe] "starting a full rewatch from the #OP1071 episode, best arc ever"
  - The comment references episode 1071 as a starting point for a rewatch without revealing specific plot details about that episode.
- **OK  ** hide=false [safe] "Zoro getting lost every single arc never stops being funny"
  - This is a generic observation about Zoro's recurring character trait of getting lost, which has been established since early in the series and continues consistently through all arcs.
- **OK  ** hide=false [safe] "Going Merry deserved better, I still tear up thinking about it"
  - The Going Merry's fate occurs during the Water 7/Enies Lobby arc which concludes around episode 312, well before the viewer's current episode 350.
- **OK  ** hide=false [safe] "just hit G500 karma on that meme lmao"
  - Reference to 'G500' karma is about a Reddit score milestone, not related to One Piece plot.
