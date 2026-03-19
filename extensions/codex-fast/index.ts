import type {
  AssistantMessage,
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type FastConfig = {
  enabled: boolean;
  updatedAt: number;
};

type OAuthCred = {
  type: "oauth";
  refresh?: string;
  access?: string;
  accountId?: string;
  [key: string]: unknown;
};

type Profile = {
  id: string;
  label: string;
  email?: string;
  accountId?: string;
  oauth: OAuthCred;
};

type StoreV2 = {
  version: 2;
  activeProfileId?: string;
  profiles: Profile[];
};

type LastMetrics = {
  elapsedMs: number;
  outputTokens: number;
  inputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
};

const AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
const CONFIG_FILE = path.join(AGENT_DIR, "codex-fast.json");
const AUTH_FILE = path.join(AGENT_DIR, "auth.json");
const STORE_FILE = path.join(AGENT_DIR, "codexswap.json");
const STATUS_ID = "ag-multi";

type FastCommand = "toggle" | "on" | "off" | "status";

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function readConfig(): FastConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return { enabled: false, updatedAt: 0 };
    }
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<FastConfig>;
    return {
      enabled: parsed.enabled === true,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return { enabled: false, updatedAt: 0 };
  }
}

function writeConfig(enabled: boolean): FastConfig {
  const next: FastConfig = {
    enabled,
    updatedAt: Date.now(),
  };
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  try {
    fs.chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // ignore chmod issues
  }
  return next;
}

function getOpenAICodexFromAuth(): OAuthCred | null {
  const auth = readJson<Record<string, unknown>>(AUTH_FILE);
  const entry = auth?.["openai-codex"] as OAuthCred | undefined;
  if (!entry || entry.type !== "oauth") return null;
  return entry;
}

function loadStore(): StoreV2 {
  const raw = readJson<StoreV2 | Record<string, unknown>>(STORE_FILE);
  if (raw && (raw as StoreV2).version === 2 && Array.isArray((raw as StoreV2).profiles)) {
    const store = raw as StoreV2;
    return {
      version: 2,
      activeProfileId: store.activeProfileId,
      profiles: store.profiles,
    };
  }
  return { version: 2, profiles: [] };
}

function decodeJwtPayload(token?: string): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferEmail(oauth: OAuthCred): string | undefined {
  const payload = decodeJwtPayload(oauth.access);
  if (!payload) return undefined;
  const profile = payload["https://api.openai.com/profile"] as Record<string, unknown> | undefined;
  const email = profile?.email ?? payload.email;
  return typeof email === "string" ? email : undefined;
}

function findActiveProfileLabel(): string {
  const live = getOpenAICodexFromAuth();
  const store = loadStore();
  if (live?.refresh) {
    const match = store.profiles.find((profile) => profile.oauth.refresh === live.refresh);
    if (match?.label) {
      return match.label;
    }
  }
  if (store.activeProfileId) {
    const active = store.profiles.find((profile) => profile.id === store.activeProfileId);
    if (active?.label) {
      return active.label;
    }
  }
  const email = live ? inferEmail(live) : undefined;
  if (email) {
    return email.split("@")[0] || email;
  }
  if (typeof live?.accountId === "string" && live.accountId.length > 0) {
    return live.accountId.slice(0, 8);
  }
  return "none";
}

function isCodexModel(ctx: ExtensionContext | ExtensionCommandContext): boolean {
  return ctx.model?.provider === "openai-codex";
}

function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return Math.round(value).toLocaleString("en-US");
}

function formatTokens(tokens: number | null | undefined): string {
  if (tokens == null || !Number.isFinite(tokens)) {
    return "tok --";
  }
  if (tokens >= 1_000_000) {
    return `tok ${(tokens / 1_000_000).toFixed(1)}m`;
  }
  if (tokens >= 10_000) {
    return `tok ${Math.round(tokens / 1000)}k`;
  }
  if (tokens >= 1_000) {
    return `tok ${(tokens / 1000).toFixed(1)}k`;
  }
  return `tok ${Math.round(tokens)}`;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTps(outputTokens: number, elapsedMs: number): string {
  if (!Number.isFinite(outputTokens) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return "TPS --";
  }
  const tps = outputTokens / (elapsedMs / 1000);
  return `TPS ${tps.toFixed(1)}`;
}

function formatMetrics(metrics: LastMetrics | undefined): string | undefined {
  if (!metrics) {
    return undefined;
  }
  return [
    formatTps(metrics.outputTokens, metrics.elapsedMs),
    `out ${formatCount(metrics.outputTokens)}`,
    `in ${formatCount(metrics.inputTokens)}`,
    `cache ${formatCount(metrics.cacheRead)}/${formatCount(metrics.cacheWrite)}`,
    `total ${formatCount(metrics.totalTokens)}`,
    formatSeconds(metrics.elapsedMs),
  ].join(" ");
}

function setStatus(ctx: ExtensionContext | ExtensionCommandContext, metrics?: LastMetrics): void {
  if (!ctx.hasUI) {
    return;
  }

  const { enabled } = readConfig();
  const accountLabel = findActiveProfileLabel();
  const fastState = enabled && isCodexModel(ctx)
    ? ctx.ui.theme.fg("accent", "⚡FAST")
    : isCodexModel(ctx)
      ? ctx.ui.theme.fg("muted", "std")
      : ctx.ui.theme.fg("muted", "standby");
  const tokenState = ctx.ui.theme.fg("dim", formatTokens(ctx.getContextUsage()?.tokens));
  const accountState = ctx.ui.theme.fg("accent", `codex:${accountLabel}`);
  const sep = ctx.ui.theme.fg("dim", " · ");
  const parts = [accountState, fastState, tokenState];

  const metricsText = formatMetrics(metrics);
  if (metricsText) {
    parts.push(ctx.ui.theme.fg("dim", metricsText));
  }

  ctx.ui.setStatus(STATUS_ID, parts.join(sep));
}

function getStateText(ctx: ExtensionContext | ExtensionCommandContext): string {
  const { enabled } = readConfig();
  const currentModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "none";
  const accountLabel = findActiveProfileLabel();
  const active = enabled && isCodexModel(ctx);
  if (!enabled) {
    return `Fast mode is OFF. Active Codex profile: ${accountLabel}. Current model: ${currentModel}`;
  }
  if (active) {
    return `Fast mode is ON for ${currentModel}. Active Codex profile: ${accountLabel}. Codex requests will send service_tier=priority.`;
  }
  return `Fast mode is ON. Active Codex profile: ${accountLabel}. Current model is ${currentModel}, so fast mode is currently standby until you switch to openai-codex.`;
}

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "success" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }
  console.log(message);
}

function parseCommand(args: string): FastCommand | null {
  const value = args.trim().toLowerCase();
  if (value === "" || value === "toggle") return "toggle";
  if (value === "on") return "on";
  if (value === "off") return "off";
  if (value === "status") return "status";
  return null;
}

function isSuccessfulAssistantMessage(message: AssistantMessage): boolean {
  return message.stopReason !== "error" && message.stopReason !== "aborted";
}

export default function codexFastExtension(pi: ExtensionAPI) {
  let turnStartedAt = 0;
  let lastMetrics: LastMetrics | undefined;

  pi.registerCommand("fast", {
    description: "Toggle Codex fast mode (/fast, /fast on, /fast off, /fast status)",
    getArgumentCompletions: (prefix) => {
      const values = ["on", "off", "status", "toggle"];
      const filtered = values.filter((value) => value.startsWith(prefix.toLowerCase()));
      return filtered.map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      const command = parseCommand(args);
      if (!command) {
        notify(ctx, "Usage: /fast [on|off|status]", "warning");
        return;
      }

      if (command === "status") {
        setStatus(ctx, lastMetrics);
        notify(ctx, getStateText(ctx), "info");
        return;
      }

      const current = readConfig().enabled;
      const enabled = command === "toggle" ? !current : command === "on";
      writeConfig(enabled);
      setStatus(ctx, lastMetrics);

      if (enabled) {
        notify(
          ctx,
          `${getStateText(ctx)} This may consume roughly 2x Codex usage in exchange for faster inference.`,
          "success"
        );
      } else {
        notify(ctx, getStateText(ctx), "info");
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    setStatus(ctx, lastMetrics);
  });

  pi.on("model_select", async (_event, ctx) => {
    setStatus(ctx, lastMetrics);
  });

  pi.on("session_switch", async (_event, ctx) => {
    setStatus(ctx, lastMetrics);
  });

  pi.on("turn_start", async (_event, ctx) => {
    turnStartedAt = Date.now();
    setStatus(ctx, lastMetrics);
  });

  pi.on("turn_end", async (_event, ctx) => {
    setStatus(ctx, lastMetrics);
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role === "assistant" && isSuccessfulAssistantMessage(event.message)) {
      const usage = event.message.usage;
      const elapsedMs = turnStartedAt > 0 ? Math.max(1, Date.now() - turnStartedAt) : 0;
      lastMetrics = {
        elapsedMs,
        outputTokens: usage.output,
        inputTokens: usage.input,
        cacheRead: usage.cacheRead,
        cacheWrite: usage.cacheWrite,
        totalTokens: usage.totalTokens,
      };
      setStatus(ctx, lastMetrics);
      return;
    }

    if (event.message.role === "toolResult") {
      setStatus(ctx, lastMetrics);
    }
  });

  pi.on("before_provider_request", (event, ctx) => {
    const { enabled } = readConfig();
    if (!enabled || !isCodexModel(ctx)) {
      return;
    }

    const payload = event.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return;
    }

    return {
      ...payload,
      service_tier: "priority",
    };
  });
}
