import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { streamAnthropic } from "/Users/safzan/.nvm/versions/node/v22.20.0/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/anthropic.js";

const AGENTROUTER_BASE_URL = "https://agentrouter.org";
const AGENTROUTER_OPENAI_BASE_URL = "https://agentrouter.org/v1";

const DROID_CLI_VERSION = "0.122.0";

function droidCliHeaders(apiKey: string) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": `factory-cli/${DROID_CLI_VERSION}`,
    "x-stainless-arch": "arm64",
    "x-stainless-lang": "js",
    "x-stainless-os": "MacOS",
    "x-stainless-package-version": "6.25.0",
    "x-stainless-retry-count": "0",
    "x-stainless-runtime": "node",
    "x-stainless-runtime-version": "v24.3.0",
  } as const;
}

function claudeCodeHeadersBase(sessionId: string) {
  return {
  accept: "application/json",
  "content-type": "application/json",
  "user-agent": "claude-cli/2.1.146 (external, sdk-cli)",
    "x-claude-code-session-id": sessionId,
  "anthropic-version": "2023-06-01",
  "anthropic-beta":
      "interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,claude-code-20250219",
  "anthropic-dangerous-direct-browser-access": "true",
  "x-app": "cli",
  "x-stainless-arch": "arm64",
  "x-stainless-lang": "js",
  "x-stainless-os": "MacOS",
  "x-stainless-package-version": "0.94.0",
  "x-stainless-retry-count": "0",
  "x-stainless-runtime": "node",
  "x-stainless-runtime-version": "v24.3.0",
  "x-stainless-timeout": "600",
  } as const;
}

const CLAUDE_CODE_HEADERS = claudeCodeHeadersBase(randomUUID());

type AuthFile = {
  [provider: string]:
    | {
        type?: string;
        key?: string;
        apiKey?: string;
      }
    | undefined;
  agentrouter?: {
    type?: string;
    key?: string;
  };
};

type ModelsFile = {
  providers?: Record<
    string,
    {
      apiKey?: string;
    }
  >;
};

const textAndImageInput = ["text", "image"] as ("text" | "image")[];

const opusCost = {
  input: 5.0,
  output: 25.0,
  cacheRead: 0.5,
  cacheWrite: 6.25,
};

const sonnetCost = {
  input: 3.0,
  output: 15.0,
  cacheRead: 0.3,
  cacheWrite: 3.75,
};

const haikuCost = {
  input: 1.0,
  output: 5.0,
  cacheRead: 0.1,
  cacheWrite: 1.25,
};

const agentRouterOpenAIModels = [
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro (AgentRouter Droid)",
    reasoning: true,
    input: ["text"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000000,
    maxTokens: 384000,
    compat: {
      thinkingFormat: "deepseek",
      requiresReasoningContentOnAssistantMessages: true,
      supportsStrictMode: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
      reasoningEffortMap: {
        minimal: "high",
        low: "high",
        medium: "high",
        high: "high",
        xhigh: "max",
      },
    },
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash (AgentRouter Droid)",
    reasoning: true,
    input: ["text"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000000,
    maxTokens: 384000,
    compat: {
      thinkingFormat: "deepseek",
      requiresReasoningContentOnAssistantMessages: true,
      supportsStrictMode: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
      reasoningEffortMap: {
        minimal: "high",
        low: "high",
        medium: "high",
        high: "high",
        xhigh: "max",
      },
    },
  },
  {
    id: "glm-5.1",
    name: "GLM 5.1 (AgentRouter Droid)",
    reasoning: true,
    input: ["text"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 32768,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  },
];

const directAgentRouterModels = [
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6 (AgentRouter Claude Code)",
    reasoning: true,
    input: textAndImageInput,
    cost: opusCost,
    contextWindow: 1280000,
    maxTokens: 32768,
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5 (AgentRouter Claude Code)",
    reasoning: true,
    input: textAndImageInput,
    cost: haikuCost,
    contextWindow: 200000,
    maxTokens: 32768,
  },
];

const freemodelClaudeModels = [
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7 (freemodel Claude Code)",
    reasoning: true,
    input: textAndImageInput,
    cost: opusCost,
    contextWindow: 1000000,
    maxTokens: 32768,
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 (freemodel Claude Code)",
    reasoning: true,
    input: textAndImageInput,
    cost: sonnetCost,
    contextWindow: 1000000,
    maxTokens: 32768,
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6 (freemodel Claude Code)",
    reasoning: true,
    input: textAndImageInput,
    cost: opusCost,
    contextWindow: 1000000,
    maxTokens: 32768,
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5 (freemodel Claude Code)",
    reasoning: true,
    input: textAndImageInput,
    cost: haikuCost,
    contextWindow: 200000,
    maxTokens: 32768,
  },
];

function getAgentDir() {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function readJsonFile<T>(path: string, label: string): T | undefined {
  if (!existsSync(path)) return undefined;

  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    console.warn(
      `[safzan-proxy] Failed to read ${label} from ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

function resolveConfiguredSecret(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith("!")) return undefined;
  return process.env[trimmed]?.trim() || trimmed;
}

function resolveApiKey(options: { envNames: string[]; authProviderNames: string[]; modelProviderNames?: string[] }) {
  for (const envName of options.envNames) {
    const envKey = process.env[envName]?.trim();
    if (envKey) return envKey;
  }

  const agentDir = getAgentDir();
  const auth = readJsonFile<AuthFile>(join(agentDir, "auth.json"), "auth.json");
  for (const providerName of options.authProviderNames) {
    const entry = auth?.[providerName];
    const apiKey = entry?.type === "api_key" ? (entry.key ?? entry.apiKey)?.trim() : undefined;
    if (apiKey) return apiKey;
  }

  const models = readJsonFile<ModelsFile>(join(agentDir, "models.json"), "models.json");
  for (const providerName of options.modelProviderNames ?? []) {
    const apiKey = resolveConfiguredSecret(models?.providers?.[providerName]?.apiKey);
    if (apiKey) return apiKey;
  }

  return undefined;
}

function resolveAgentRouterApiKey() {
  return resolveApiKey({ envNames: ["AGENTROUTER_API_KEY"], authProviderNames: ["agentrouter"] });
}

function resolveFreemodelClaudeApiKey() {
  return resolveApiKey({
    envNames: ["FREEMODEL_CLAUDE_API_KEY", "FREEMODEL_API_KEY"],
    authProviderNames: ["freemodel-claude", "Freemodel-claude", "freemodel"],
    modelProviderNames: ["freemodel-claude", "freemodel"],
  });
}

function claudeCodeHeaders(apiKey: string) {
  return {
    ...CLAUDE_CODE_HEADERS,
    authorization: `Bearer ${apiKey}`,
    "x-api-key": apiKey,
  };
}

function freemodelClaudeCodeHeaders(apiKey: string, sessionId: string) {
  return {
    ...claudeCodeHeadersBase(sessionId),
    "x-api-key": apiKey,
  };
}

function resolveClaudeCodeDeviceId() {
  const claudeConfig = readJsonFile<{ userID?: string }>(join(homedir(), ".claude.json"), ".claude.json");
  return claudeConfig?.userID?.trim() || "8b33048caf0fae69c07a746b6101f607b96e78576bec86c3b3a71158076a21b1";
}

function buildClaudeCodeSystemBlocks(existingSystem: unknown) {
  const existingBlocks = Array.isArray(existingSystem)
    ? existingSystem
    : existingSystem
      ? [{ type: "text", text: String(existingSystem) }]
      : [];

  return [
    {
      type: "text",
      text: `x-anthropic-billing-header: cc_version=2.1.146.1a3; cc_entrypoint=sdk-cli; cch=${randomUUID().replace(/-/g, "").slice(0, 5)};`,
    },
    {
      type: "text",
      text: "You are a Claude agent, built on Anthropic's Claude Agent SDK.",
      cache_control: { type: "ephemeral" },
    },
    ...existingBlocks,
    {
      type: "text",
      text: `CWD: ${process.cwd()}\nDate: ${new Date().toISOString().slice(0, 10)}`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

function patchFreemodelClaudePayload(params: any, sessionId: string) {
  params.system = buildClaudeCodeSystemBlocks(params.system);
  params.tools ??= [];
  params.metadata = {
    ...(params.metadata ?? {}),
    user_id: JSON.stringify({
      device_id: resolveClaudeCodeDeviceId(),
      account_uuid: "",
      session_id: sessionId,
    }),
  };
  params.max_tokens = Math.min(params.max_tokens ?? 32000, 32000);
  params.context_management = {
    edits: [{ type: "clear_thinking_20251015", keep: "all" }],
  };

  if (params.thinking?.type !== "adaptive") {
    params.thinking = {
      budget_tokens: Math.max(1024, params.max_tokens - 1),
      type: "enabled",
      display: "summarized",
    };
    delete params.output_config;
  }

  return params;
}

function streamFreemodelClaude(model: any, context: any, options: any = {}) {
  const apiKey = options.apiKey || resolveFreemodelClaudeApiKey();
  const sessionId = randomUUID();

  return streamAnthropic(model, context, {
    ...options,
    apiKey,
    headers: freemodelClaudeCodeHeaders(apiKey, sessionId),
    maxTokens: Math.min(options.maxTokens ?? model.maxTokens ?? 32000, 32000),
    thinkingEnabled: true,
    thinkingBudgetTokens: 31999,
    thinkingDisplay: "summarized",
    onPayload: (params: any) => patchFreemodelClaudePayload(params, sessionId),
  });
}

function registerDirectAgentRouter(pi: ExtensionAPI, providerName: string, apiKey: string) {
  pi.registerProvider(providerName, {
    baseUrl: AGENTROUTER_BASE_URL,
    apiKey,
    api: "anthropic-messages",
    headers: claudeCodeHeaders(apiKey),
    models: directAgentRouterModels.map((model) => ({ ...model })),
  });
}

function registerAgentRouterOpenAI(pi: ExtensionAPI, apiKey: string) {
  pi.registerProvider("agentrouter-openai", {
    baseUrl: AGENTROUTER_OPENAI_BASE_URL,
    apiKey,
    authHeader: true,
    api: "openai-completions",
    headers: droidCliHeaders(apiKey),
    models: agentRouterOpenAIModels.map((model) => ({ ...model })),
  });
}

function registerFreemodelClaude(pi: ExtensionAPI, apiKey: string) {
  pi.registerProvider("freemodel-claude", {
    baseUrl: "https://cc.freemodel.dev",
    apiKey,
    api: "anthropic-messages",
    streamSimple: streamFreemodelClaude,
    models: freemodelClaudeModels.map((model) => ({ ...model })),
  });
}

export default function (pi: ExtensionAPI) {
  const agentRouterApiKey = resolveAgentRouterApiKey();
  const freemodelClaudeApiKey = resolveFreemodelClaudeApiKey();

  if (!agentRouterApiKey) {
    console.warn(
      `[safzan-proxy] No AgentRouter API key found in ${join(
        getAgentDir(),
        "auth.json",
      )} or AGENTROUTER_API_KEY; skipping AgentRouter provider registration`,
    );
  } else {
    registerDirectAgentRouter(pi, "agentrouter", agentRouterApiKey);
    console.log("[safzan-proxy] Registered native Anthropic AgentRouter provider with Claude Code headers");
    registerAgentRouterOpenAI(pi, agentRouterApiKey);
    console.log("[safzan-proxy] Registered AgentRouter OpenAI provider with Droid CLI headers");
  }

  if (!freemodelClaudeApiKey) {
    console.warn("[safzan-proxy] No Freemodel Claude API key found; skipping freemodel-claude provider registration");
  } else {
    registerFreemodelClaude(pi, freemodelClaudeApiKey);
    console.log("[safzan-proxy] Registered Freemodel Claude provider with Claude Code headers");
  }

  pi.registerProvider("llamacpp", {
    baseUrl: process.env.LLAMACPP_BASE_URL || "http://localhost:8080/v1",
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
