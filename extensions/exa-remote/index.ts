/**
 * Exa Remote MCP Extension
 *
 * Connects directly to Exa's remote MCP endpoint via Streamable HTTP.
 * Same approach as opencode's remote MCP config.
 *
 * Setup: set EXA_API_KEY in the environment, or write
 * `~/.pi/agent/extensions/exa-remote.json` with `{ "apiKey": "..." }`.
 * URL pattern: https://mcp.exa.ai/mcp?exaApiKey=<key>&tools=...
 */

import { keyHint, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const EXA_TOOL_LIST = "web_search_exa,crawling_exa";

function loadExaApiKey(): string | undefined {
  const fromEnv = process.env.EXA_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const configPath = join(homedir(), ".pi/agent/extensions/exa-remote.json");
  if (!existsSync(configPath)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8")) as { apiKey?: string };
    return raw.apiKey?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function buildExaUrl(): string | undefined {
  const key = loadExaApiKey();
  if (!key) return undefined;
  return `https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(key)}&tools=${EXA_TOOL_LIST}`;
}

const EXA_TOOLS = [
  {
    name: "web_search_exa",
    description: "Search the web for any topic and get clean, ready-to-use content.",
  },
  {
    name: "crawling_exa",
    description: "Get the full content of a specific webpage. Pass {\"urls\": [\"https://...\"]} as arguments.",
  },
] as const;

let exaClient: Client | null = null;
let exaTransport: StreamableHTTPClientTransport | null = null;
let connecting = false;

async function getExaClient(): Promise<Client> {
  if (exaClient) return exaClient;
  if (connecting) {
    while (connecting) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (exaClient) return exaClient;
  }

  connecting = true;
  try {
    const url = buildExaUrl();
    if (!url) {
      throw new Error(
        "Exa API key missing. Set EXA_API_KEY env var or write ~/.pi/agent/extensions/exa-remote.json with { \"apiKey\": \"...\" }.",
      );
    }
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client(
      { name: "pi-exa-remote", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    exaClient = client;
    exaTransport = transport;
    return client;
  } finally {
    connecting = false;
  }
}

function parseArgumentsJson(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "string") {
    throw new Error("argumentsJson must be a JSON string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return {};
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("argumentsJson must parse to a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function toToolContent(result: { content?: Array<any> }) {
  const content: Array<any> = [];
  for (const item of result.content ?? []) {
    if (item.type === "text") {
      content.push({ type: "text", text: item.text });
    } else {
      content.push({ type: "text", text: `[exa:${item.type}] ${JSON.stringify(item)}` });
    }
  }
  return content.length ? content : [{ type: "text", text: "(empty result)" }];
}

function resultText(result: { content?: Array<any> }): string {
  return (result.content ?? [])
    .map((item) => item?.type === "text" ? String(item.text ?? "") : JSON.stringify(item))
    .filter(Boolean)
    .join("\n");
}

function compactToolText(text: string, maxLines = 8, maxChars = 1800): { preview: string; lineCount: number; truncated: boolean } {
  const lines = text.split("\n");
  const joined = lines.slice(0, maxLines).join("\n");
  const preview = joined.length > maxChars ? `${joined.slice(0, maxChars - 1)}…` : joined;
  return {
    preview,
    lineCount: lines.length,
    truncated: lines.length > maxLines || joined.length > maxChars,
  };
}

function renderExpandableResult(result: any, options: { expanded: boolean; isPartial?: boolean }, theme: any) {
  if (options.isPartial) return new Text(theme.fg("warning", "Running Exa request..."), 0, 0);

  const text = resultText(result) || "(empty result)";
  const { preview, lineCount, truncated } = compactToolText(text);
  const raw = result?.details?.raw;
  const itemCount = Array.isArray(raw?.content) ? raw.content.length : undefined;

  let output = theme.fg(result?.isError ? "error" : "success", result?.isError ? "Exa error" : "Exa result");
  output += theme.fg("dim", ` (${lineCount} line${lineCount === 1 ? "" : "s"}${itemCount !== undefined ? `, ${itemCount} item${itemCount === 1 ? "" : "s"}` : ""})`);

  if (!options.expanded) {
    output += ` ${theme.fg("muted", keyHint("app.tools.expand", "to expand"))}`;
    if (preview.trim()) output += `\n${theme.fg("dim", preview)}`;
    if (truncated) output += `\n${theme.fg("muted", "… output compacted")}`;
    return new Text(output, 0, 0);
  }

  output += ` ${theme.fg("muted", keyHint("app.tools.expand", "to collapse"))}`;
  output += `\n${text}`;
  return new Text(output, 0, 0);
}

async function callExaTool(toolName: string, rawArgumentsJson: unknown) {
  const client = await getExaClient();
  const args = parseArgumentsJson(rawArgumentsJson);
  const result = await client.request(
    {
      method: "tools/call",
      params: { name: toolName, arguments: args },
    },
    CallToolResultSchema
  );

  return {
    content: toToolContent(result),
    details: { tool: toolName, raw: result },
  };
}

export default function(pi: ExtensionAPI) {
  for (const tool of EXA_TOOLS) {
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: Type.Object({
        argumentsJson: Type.Optional(
          Type.String({
            description: 'Arguments as JSON (e.g., {"query":"...", "numResults": 5})',
          })
        ),
      }),
      async execute(_toolCallId, params: any) {
        try {
          return await callExaTool(tool.name, params?.argumentsJson);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: `Exa error: ${msg}` }],
            details: {},
            isError: true,
          };
        }
      },
      renderResult(result, options, theme) {
        return renderExpandableResult(result, options, theme);
      },
    });
  }

  // Warm the remote connection in the background without blocking startup.
  // Only do this in the interactive UI so short-lived print/RPC runs can exit cleanly.
  pi.on("session_start", (_event, ctx) => {
    if (!ctx?.hasUI) {
      return;
    }

    void getExaClient().catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[exa-remote] Failed to connect:", msg);
      ctx.ui.notify(`Exa connection failed: ${msg}`, "warning");
    });
  });

  pi.on("session_shutdown", async () => {
    if (exaTransport) {
      try {
        await exaTransport.close();
      } catch {
        // ignore
      }
      exaTransport = null;
    }
    exaClient = null;
  });
}
