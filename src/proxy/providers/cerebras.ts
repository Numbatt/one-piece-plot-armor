import { createOpenAICompatProvider } from './openai-compatible'

// LANE 2 — Gemma 4 31B on Cerebras wafer-scale hardware.
//
// Cerebras publishes this model at ~1,851 output tokens/sec (Artificial
// Analysis), which they describe as ~35x a typical GPU endpoint. They position
// Gemma 4 31B explicitly as a Haiku alternative: AA Intelligence Index 29 vs
// Haiku 4.5's 30 — close enough that swapping is a real product decision, not
// just a benchmark stunt.
//
// Pricing note worth keeping honest about: at $0.99/$1.49 per Mtok this is
// cheaper than Haiku but roughly 4.5x the GPU endpoint running the *same
// weights*. Cerebras sells latency, not price per token.

export const cerebrasProvider = createOpenAICompatProvider({
  id: 'cerebras',
  label: 'Gemma 4 31B · Cerebras',
  hardware: 'Cerebras WSE',
  model: 'gemma-4-31b',
  baseURL: 'https://api.cerebras.ai/v1',
  apiKeyEnv: 'CEREBRAS_API_KEY',
  pricing: { inPerM: 0.99, outPerM: 1.49 },
})
