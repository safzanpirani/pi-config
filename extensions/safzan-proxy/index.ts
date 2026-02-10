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

  // Sonnet pricing ($/million tokens)
  const sonnetCost = {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75
  };

  // Opus pricing ($/million tokens)
  const opusCost = {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25
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
        cost: sonnetCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      },
      {
        id: "kiro-claude-opus-4-5-agentic",
        name: "Kiro Claude Opus 4.5 Agentic",
        reasoning: false,
        input: ["text", "image"],
        cost: opusCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      },
      {
        id: "kiro-claude-opus-4-6-agentic",
        name: "Kiro Claude Opus 4.6 Agentic",
        reasoning: false,
        input: ["text", "image"],
        cost: opusCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      },
      {
        id: "gemini-claude-opus-4-5-thinking",
        name: "Gemini Claude Opus 4.5 Thinking",
        // reasoning: false to work around CLIProxyAPI token counting bug
        // CLIProxyAPI adds thoughtsTokenCount to prompt_tokens AND reports it
        // as reasoning_tokens, causing pi-agent to double-subtract → negative input
        reasoning: false,
        input: ["text", "image"],
        cost: opusCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      },
      {
        id: "gemini-claude-opus-4-6-thinking",
        name: "Gemini Claude Opus 4.6 Thinking",
        // reasoning: false — same CLIProxyAPI workaround
        reasoning: false,
        input: ["text", "image"],
        cost: opusCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      },
      {
        id: "gemini-claude-sonnet-4-5-thinking",
        name: "Gemini Claude Sonnet 4.5 Thinking",
        // reasoning: false — same CLIProxyAPI workaround
        reasoning: false,
        input: ["text", "image"],
        cost: sonnetCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      },
      {
        id: "gemini-claude-sonnet-4-5",
        name: "Gemini Claude Sonnet 4.5",
        reasoning: false,
        input: ["text", "image"],
        cost: sonnetCost,
        contextWindow: 200000,
        maxTokens: 64000,
        compat: proxyCompat
      }
    ]
  });
  
  console.log("[safzan-proxy] Registered 7 models with Anthropic pricing");
}
