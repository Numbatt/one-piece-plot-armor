import { createOpenAICompatProvider } from './openai-compatible'

// LANE 3 — Gemma 4 31B on GPUs, via Together AI serverless.
//
// This is the control. Same open weights (Gemma 4 is Apache 2.0), same prompt,
// same schema, same batch size as the Cerebras lane — the only difference is
// the silicon underneath. That is what makes the side-by-side mean anything:
// any gap you see is hardware, not a smarter model.
//
// It is also the cost floor of the three lanes at $0.20/$0.50 per Mtok, which
// is why the demo reports dollars alongside milliseconds. Fast and cheap point
// at different providers here, and pretending otherwise would be the easiest
// thing for a reviewer to catch.

export const togetherProvider = createOpenAICompatProvider({
  id: 'together',
  label: 'Gemma 4 31B · GPU',
  hardware: 'NVIDIA GPU (Together)',
  model: 'google/gemma-4-31B-it',
  baseURL: 'https://api.together.xyz/v1',
  apiKeyEnv: 'TOGETHER_API_KEY',
  pricing: { inPerM: 0.2, outPerM: 0.5 },
  // Together serves Gemma 4 with thinking ON by default; Cerebras's endpoint
  // serves it OFF and rejects this flag. Sending it here is what makes the two
  // lanes run the same configuration. See openai-compatible.ts for the measured
  // before/after.
  extraBody: { chat_template_kwargs: { enable_thinking: false } },
})
