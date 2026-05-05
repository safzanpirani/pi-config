import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type ModelRef = { provider: string; id: string };

type AssistantLikeMessage = {
  role?: string;
  provider?: string;
  model?: string;
};

const STATUS_KEY = "copilot-backend";

function getSelectedModel(ctx: ExtensionContext): ModelRef | undefined {
  if (!ctx.model?.provider || !ctx.model?.id) return undefined;
  return { provider: ctx.model.provider, id: ctx.model.id };
}

function getReportedModel(message: AssistantLikeMessage): ModelRef | undefined {
  if (typeof message.provider !== "string" || typeof message.model !== "string") {
    return undefined;
  }

  return { provider: message.provider, id: message.model };
}

function formatModelRef(model: ModelRef): string {
  return `${model.provider}/${model.id}`;
}

function isCopilotBackendMismatch(
  selected: ModelRef | undefined,
  reported: ModelRef | undefined,
): selected is ModelRef {
  return !!selected
    && selected.provider === "github-copilot"
    && !!reported
    && (reported.provider !== selected.provider || reported.id !== selected.id);
}

function isFireworksBackend(model: ModelRef): boolean {
  const value = `${model.provider}/${model.id}`.toLowerCase();
  return value.includes("fireworks") || value.includes("accounts/fireworks/");
}

function shorten(value: string, max = 42): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export default function copilotBackendWarning(pi: ExtensionAPI): void {
  const warned = new Set<string>();

  function resetState(ctx: ExtensionContext): void {
    warned.clear();
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  function maybeWarn(message: AssistantLikeMessage, ctx: ExtensionContext): void {
    const selected = getSelectedModel(ctx);
    const reported = getReportedModel(message);

    if (!isCopilotBackendMismatch(selected, reported)) {
      return;
    }

    const selectedRef = formatModelRef(selected);
    const reportedRef = formatModelRef(reported);
    const warningKey = `${selectedRef}=>${reportedRef}`;

    ctx.ui.setStatus(
      STATUS_KEY,
      ctx.ui.theme.fg("warning", `backend:${shorten(reported.id)}`),
    );

    if (warned.has(warningKey)) {
      return;
    }
    warned.add(warningKey);

    const detail = isFireworksBackend(reported)
      ? "GitHub Copilot appears to have routed this turn to a Fireworks backend."
      : "GitHub Copilot reported a different backend model than the one you selected.";

    ctx.ui.notify(
      `${detail} Selected ${selectedRef}, reported ${reportedRef}.`,
      "warning",
    );
  }

  pi.on("session_start", async (_event, ctx) => {
    resetState(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    resetState(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    resetState(ctx);
  });

  pi.on("message_start", async (event, ctx) => {
    if (event.message?.role !== "assistant") return;
    maybeWarn(event.message as AssistantLikeMessage, ctx);
  });

  pi.on("message_update", async (event, ctx) => {
    if (event.message?.role !== "assistant") return;
    maybeWarn(event.message as AssistantLikeMessage, ctx);
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message?.role !== "assistant") return;
    maybeWarn(event.message as AssistantLikeMessage, ctx);
  });
}
