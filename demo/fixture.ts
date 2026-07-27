// A screen's worth of r/OnePiece, for the Cerebras-vs-GPU race.
//
// The viewer is at EPISODE 1000 — deep into Wano, before Gear 5 (1071). That
// cut-off is chosen because it's where the spoiler problem is genuinely at its
// worst: the anime is mid-arc, the manga is a thousand chapters ahead, and every
// thread is full of readers who have known the ending for years.
//
// The mix matters. Only a minority of these contain a gazetteer term, because
// that's the honest ratio — if the fast path caught everything, there'd be no
// model in the loop and no latency to measure. Most are either ordinary chatter
// (which must NOT be blurred, or the extension is unusable) or oblique
// references that only a model can catch.

export const CURRENT_EPISODE = 1000

export const COMMENTS: string[] = [
  // — ordinary chatter: the precision test. Blurring these is what gets you uninstalled.
  'Zoro is carrying this arc on his back honestly',
  'The animation in this episode was absolutely unreal',
  'Nami deserves so much more screen time',
  "Sanji's fight choreography has never looked better",
  'Rewatching from Alabasta and the pacing holds up so well',
  'Oda cooked with this one, no notes',
  'Franky is such an underrated Straw Hat',
  'The Wano soundtrack goes so hard',
  'Chopper being cute as always',
  'Usopp is the most relatable character in the series',
  'Brook is criminally underused in fights',
  'The Going Merry arc still makes me cry',
  'Jinbei joining was the best decision Oda made',
  'I love how the crew dynamic never gets old',
  'That one-shot panel adaptation was gorgeous',
  'Toei finally giving us a proper budget episode',
  'Robin is so calm under pressure, love her',
  'The voice acting this week deserves an award',
  'Marineford is still the peak of the series for me',
  'Shanks appearing always gives me chills',
  'Buggy is the funniest character ever written',
  'Ace and Sabo backstory hits different every rewatch',
  'The Straw Hats reuniting after two years, perfect',
  'Water 7 into Enies Lobby is unmatched storytelling',
  'Whitebeard was such a well written character',

  // — gazetteer territory: named future reveals, caught locally at 0ms.
  'Gear 5 changed the entire series honestly',
  'Joyboy reveal was foreshadowed for 20 years',
  'Sun God Nika is such a wild direction',
  'Vegapunk finally showing up was worth the wait',
  'Egghead arc is going to be incredible in the anime',
  'Kaido defeated felt so earned after all that buildup',
  'Luffy Yonko status is well deserved',
  'G5 Luffy vs Kaido is peak animation',

  // — implicit: no gazetteer term, needs the model. This is the residual.
  'The drums of liberation started playing and I lost it',
  "So THAT'S who was frozen in the ice all along",
  'The warrior of liberation thing makes so much sense now',
  'That moment where his hair turns white, chills',
  'Turns out the fruit was never what everyone thought it was',
  'The reveal about what really happened at Ohara recontextualizes everything',
  'When you find out who the real enemy was the whole time',
  'His laugh completely changing was such a good detail',
  'The rubber powers being awakened explains so much',
  'That silhouette at the end of the episode is who I think it is right?',
  'The Void Century stuff finally getting explained',
  'Everyone in the sky island arc was foreshadowing this',
  'The moment the cartoon physics kick in is unreal',
  'A certain someone comes back and it broke me',
  'The guy who eats his own arm, iconic moment',

  // — structural: chapter/episode-number leak signals.
  'chapter 1130 leaks just dropped and holy hell',
  '#OP1120 spoilers in the thread be careful',
  'raws for 1129 are out, the last page is insane',
  'manga readers know what happens next lol',
  'anime only fans are NOT ready for what is coming',
  'chapter 1085 changed everything we thought we knew',

  // — adversarial precision traps: look spoilery, are not.
  'just hit G500 karma on this sub somehow',
  'starting a full rewatch from the #OP1071 episode next month',
  'episode 1000 was such a milestone for the franchise',
  'been reading since chapter 1 back in the day',
  'the gear 2 reveal in Enies Lobby still holds up',
  'watched the Marineford arc again, still holds the crown',
]
