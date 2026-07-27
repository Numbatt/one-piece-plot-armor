import { anthropicProvider } from './anthropic'
import { cerebrasProvider } from './cerebras'
import { togetherProvider } from './together'
import type { Provider, ProviderId } from './types'

export * from './types'
export { anthropicProvider, cerebrasProvider, togetherProvider }

export const PROVIDERS: Record<ProviderId, Provider> = {
  cerebras: cerebrasProvider,
  together: togetherProvider,
  anthropic: anthropicProvider,
}

/**
 * The two side-by-side race panes: same weights, same prompt, different
 * silicon. Cerebras first so it renders on the left.
 */
export const RACE_LANES: Provider[] = [cerebrasProvider, togetherProvider]

/**
 * Every lane the accuracy scoreboard measures. Haiku joins here — it is the
 * baseline the extension ships today, so "is Gemma as accurate?" and "is Gemma
 * cheaper?" both need it as a reference point, even though it doesn't belong
 * in the head-to-head race.
 */
export const ALL_LANES: Provider[] = [cerebrasProvider, togetherProvider, anthropicProvider]
