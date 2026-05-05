import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const FIREWORKS_OPENAI_BASE_URL = "https://api.fireworks.ai/inference/v1";
const KIMI_K25_TURBO_ID = "accounts/fireworks/routers/kimi-k2p5-turbo";

export default function fireworksProvider(pi: ExtensionAPI): void {
  pi.registerProvider("fireworks", {
    baseUrl: FIREWORKS_OPENAI_BASE_URL,
    apiKey: "FIREWORKS_API_KEY",
    authHeader: true,
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
    models: [
      {
        id: KIMI_K25_TURBO_ID,
        name: "Kimi K2.5 Turbo (Fireworks)",
        reasoning: false,
        input: ["text", "image"],
        cost: {
          input: 0.99,
          output: 4.94,
          cacheRead: 0.16,
          cacheWrite: 0,
        },
        contextWindow: 256000,
        maxTokens: 256000,
      },
    ],
  });
}
