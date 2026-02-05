/**
 * Safzan LLM Proxy Extension
 * 
 * Registers custom proxy models (Kiro Claude variants)
 * Endpoint: https://llm.safzan.dev/v1
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function(pi: ExtensionAPI) {
  // Common compat settings for the proxy
  const proxyCompat = {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsUsageInStreaming: true,
    maxTokensField: "max_tokens" as const,
  };

  // Set cost to 0 since this is a free proxy - avoids negative cost display issues
  const zeroCost = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0
  };

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
        cost: zeroCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      },
      {
        id: "kiro-claude-opus-4-5-agentic",
        name: "Kiro Claude Opus 4.5 Agentic",
        reasoning: false,
        input: ["text", "image"],
        cost: zeroCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      },
      {
        id: "gemini-claude-opus-4-5-thinking",
        name: "Gemini Claude Opus 4.5 Thinking",
        reasoning: true,
        input: ["text", "image"],
        cost: zeroCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      },
      {
        id: "gemini-claude-sonnet-4-5-thinking",
        name: "Gemini Claude Sonnet 4.5 Thinking",
        reasoning: true,
        input: ["text", "image"],
        cost: zeroCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      },
      {
        id: "gemini-claude-sonnet-4-5",
        name: "Gemini Claude Sonnet 4.5",
        reasoning: false,
        input: ["text", "image"],
        cost: zeroCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      }
    ]
  });
  
  console.log("[safzan-proxy] Registered 5 models with zero cost tracking");
}
