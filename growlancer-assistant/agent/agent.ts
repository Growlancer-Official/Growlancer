import { defineAgent } from "eve";

export default defineAgent({
  // Using a well-known AI Gateway model with guaranteed context window metadata
  model: "openai/gpt-4o-mini",
  reasoning: "medium",
  compaction: {
    thresholdPercent: 0.85,
  },
  limits: {
    maxInputTokensPerSession: 500_000,
    maxOutputTokensPerSession: 50_000,
  },
});
