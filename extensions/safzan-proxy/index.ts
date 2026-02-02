/**
 * Safzan LLM Proxy Extension
 * 
 * Registers custom proxy models (Kiro Claude variants)
 * Endpoint: https://llm.safzan.dev/v1
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function(pi: ExtensionAPI) {
  pi.registerProvider("safzan-proxy", {
    baseUrl: "https://llm.safzan.dev/v1",
    apiKey: "safzan",
    api: "openai-completions",
    models: [
      {
        id: "kiro-claude-sonnet-4-5-agentic",
        name: "Kiro Claude Sonnet 4.5 Agentic",
        reasoning: false,
        input: ["text", "image"],
        cost: {
          input: 3.0,
          output: 15.0,
          cacheRead: 0.3,
          cacheWrite: 3.75
        },
        contextWindow: 200000,
        maxTokens: 64000
      },
      {
        id: "kiro-claude-opus-4-5-agentic",
        name: "Kiro Claude Opus 4.5 Agentic",
        reasoning: false,
        input: ["text", "image"],
        cost: {
          input: 5.0,
          output: 25.0,
          cacheRead: 0.5,
          cacheWrite: 6.25
        },
        contextWindow: 200000,
        maxTokens: 64000
      }
    ]
  });
  
  console.log("[safzan-proxy] Registered 2 models: kiro-claude-sonnet-4-5-agentic, kiro-claude-opus-4-5-agentic");
}
