import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const AGENTROUTER_BASE_URL = "https://agentrouter.org";
const CLAUDE_CODE_HEADERS = {
  "user-agent": "claude-cli/2.1.75 (external, cli)",
  "anthropic-version": "2023-06-01",
  "anthropic-beta":
    "interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,claude-code-20250219",
  "x-app": "cli",
  "x-stainless-arch": "arm64",
  "x-stainless-lang": "js",
  "x-stainless-os": "MacOS",
  "x-stainless-package-version": "0.74.0",
  "x-stainless-runtime": "node",
  "x-stainless-runtime-version": "v24.3.0",
  "x-stainless-timeout": "600",
  "content-type": "application/json",
} as const;

type AuthFile = {
  agentrouter?: {
    type?: string;
    key?: string;
  };
};

const opusCost = {
  input: 5.0,
  output: 25.0,
  cacheRead: 0.5,
  cacheWrite: 6.25,
};

const directAgentRouterModel = {
  id: "claude-opus-4-6",
  name: "Claude Opus 4.6 (AgentRouter Claude Code)",
  reasoning: true,
  input: ["text", "image"] as ("text" | "image")[],
  cost: opusCost,
  contextWindow: 1280000,
  maxTokens: 32768,
};

function getAgentDir() {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function resolveAgentRouterApiKey() {
  const envKey = process.env.AGENTROUTER_API_KEY?.trim();
  if (envKey) return envKey;

  const authPath = join(getAgentDir(), "auth.json");
  if (!existsSync(authPath)) return undefined;

  try {
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as AuthFile;
    const apiKey = auth.agentrouter?.type === "api_key" ? auth.agentrouter.key?.trim() : undefined;
    return apiKey || undefined;
  } catch (error) {
    console.warn(
      `[safzan-proxy] Failed to read AgentRouter API key from ${authPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

function registerDirectAgentRouter(pi: ExtensionAPI, providerName: string, apiKey: string) {
  pi.registerProvider(providerName, {
    baseUrl: AGENTROUTER_BASE_URL,
    apiKey,
    api: "anthropic-messages",
    headers: {
      ...CLAUDE_CODE_HEADERS,
      authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
    models: [{ ...directAgentRouterModel }],
  });
}

export default function (pi: ExtensionAPI) {
  const agentRouterApiKey = resolveAgentRouterApiKey();

  if (!agentRouterApiKey) {
    console.warn(
      `[safzan-proxy] No AgentRouter API key found in ${join(
        getAgentDir(),
        "auth.json",
      )} or AGENTROUTER_API_KEY; skipping AgentRouter provider registration`,
    );
  } else {
    registerDirectAgentRouter(pi, "agentrouter", agentRouterApiKey);
    registerDirectAgentRouter(pi, "safzan-proxy", agentRouterApiKey);
    console.log("[safzan-proxy] Registered native Anthropic AgentRouter providers with Claude Code headers");
  }

  pi.registerProvider("llamacpp", {
    baseUrl: "http://192.168.0.94:8080/v1",
    apiKey: "sk-local",
    authHeader: true,
    api: "openai-completions",
    models: [
      {
        id: "qwen3.5-35b-a3b-ud-q4_k_xl",
        name: "Qwen3.5 35B A3B UD Q4_K_XL (LAN)",
        reasoning: false,
        input: ["text"],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
        contextWindow: 85000,
        maxTokens: 85000,
      },
    ],
  });

  console.log("[llamacpp] Registered 1 LAN model");
}
