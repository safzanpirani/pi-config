import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListToolsResultSchema, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

type McpServerConfig = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: string[] | Record<string, string>;
};

type McpShortcutConfig = {
  server: string;
  tool: string;
};

type McpBridgeConfig = {
  servers: Record<string, McpServerConfig>;
  shortcuts?: Record<string, McpShortcutConfig>;
};

type CachedServerTool = {
  sourceToolName: string;
  description?: string;
};

type McpShortcutCache = {
  version: 1;
  servers: Record<string, CachedServerTool[]>;
};

const DEFAULT_CONFIG_PATH = "~/.pi/agent/mcp.json";
const DEFAULT_CACHE_PATH = "~/.pi/agent/mcp-tools-cache.json";

function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return `${home}/${path.slice(2)}`;
  }
  return path;
}

function loadConfig(): { path: string; config: McpBridgeConfig } | null {
  const path = expandHome(DEFAULT_CONFIG_PATH);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as McpBridgeConfig;
    if (!parsed?.servers || typeof parsed.servers !== "object") return null;
    return { path, config: parsed };
  } catch {
    return null;
  }
}

function loadShortcutCache(): McpShortcutCache {
  const path = expandHome(DEFAULT_CACHE_PATH);
  try {
    if (!existsSync(path)) {
      return { version: 1, servers: {} };
    }
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<McpShortcutCache>;
    return {
      version: 1,
      servers: parsed.servers && typeof parsed.servers === "object" ? parsed.servers : {},
    };
  } catch {
    return { version: 1, servers: {} };
  }
}

function saveShortcutCache(cache: McpShortcutCache): void {
  const path = expandHome(DEFAULT_CACHE_PATH);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache, null, 2));
  } catch {
    // ignore cache write failures
  }
}

function resolveEnv(env: McpServerConfig["env"]): Record<string, string> {
  const out: Record<string, string> = {};

  if (Array.isArray(env)) {
    for (const name of env) {
      const val = process.env[name];
      if (typeof val === "string" && val.length > 0) out[name] = val;
    }
    return out;
  }

  if (env && typeof env === "object") {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value !== "string") continue;
      if (value.startsWith("$") && value.length > 1) {
        const from = process.env[value.slice(1)];
        if (typeof from === "string" && from.length > 0) out[key] = from;
        continue;
      }
      out[key] = value;
    }
  }

  return out;
}

export default function (pi: ExtensionAPI) {
  const clients = new Map<string, { client: Client; transport: StdioClientTransport }>();
  const shortcutCache = loadShortcutCache();
  const registeredShortcutKeys = new Set<string>();
  const warmups = new Map<string, Promise<void>>();

  function sanitizeToolName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, "_");
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

  function extractToolArgs(
    params: Record<string, unknown> | undefined,
    wrapperKeys: string[] = []
  ): Record<string, unknown> {
    if (!params || typeof params !== "object" || Array.isArray(params)) return {};
    if (typeof params.argumentsJson === "string") {
      return parseArgumentsJson(params.argumentsJson);
    }

    const args: Record<string, unknown> = {};
    const excluded = new Set(["argumentsJson", ...wrapperKeys]);
    for (const [key, value] of Object.entries(params)) {
      if (excluded.has(key) || value === undefined) continue;
      args[key] = value;
    }
    return args;
  }

  function normalizeKnownArgs(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    cwd?: string
  ): Record<string, unknown> {
    const normalized = { ...args };

    if (serverName === "morph-mcp" && toolName === "edit_file") {
      if (typeof normalized.instruction !== "string" || normalized.instruction.trim().length === 0) {
        const target = typeof normalized.path === "string" && normalized.path.trim().length > 0
          ? basename(normalized.path)
          : "this file";
        normalized.instruction = `I am applying the requested edit to ${target}.`;
      }
      return normalized;
    }

    if (
      serverName === "morph-mcp" &&
      (toolName === "codebase_search" || toolName === "warpgrep_codebase_search")
    ) {
      if (typeof normalized.search_string !== "string" && typeof normalized.query === "string") {
        normalized.search_string = normalized.query;
      }
      if (typeof normalized.repo_path !== "string" && typeof cwd === "string" && cwd.length > 0) {
        normalized.repo_path = cwd;
      }
      delete normalized.query;
      return normalized;
    }

    if (
      serverName === "morph-mcp" &&
      (toolName === "github_codebase_search" || toolName === "warpgrep_github_search")
    ) {
      if (typeof normalized.search_string !== "string" && typeof normalized.query === "string") {
        normalized.search_string = normalized.query;
      }
      delete normalized.query;
    }

    return normalized;
  }

  function toToolContent(result: { content?: Array<any> }) {
    const content: Array<any> = [];
    for (const item of result.content ?? []) {
      if (item.type === "text") content.push({ type: "text", text: item.text });
      else content.push({ type: "text", text: `[mcp:${item.type}] ${JSON.stringify(item)}` });
    }
    return content.length ? content : [{ type: "text", text: "(empty result)" }];
  }

  async function getClient(serverName: string, ctx: any, signal?: AbortSignal) {
    const loaded = loadConfig();
    if (!loaded) throw new Error(`Missing MCP config at ${DEFAULT_CONFIG_PATH}`);
    const server = loaded.config.servers[serverName];
    if (!server) throw new Error(`Unknown MCP server '${serverName}' (see ${loaded.path})`);

    const cached = clients.get(serverName);
    if (cached) return cached.client;

    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      env: resolveEnv(server.env),
      stderr: "pipe",
    });

    const client = new Client(
      { name: "pi-mcp-bridge", version: "1.0.0" },
      { capabilities: {} }
    );

    client.onerror = (err) => {
      if (ctx?.hasUI) ctx.ui.notify(`MCP(${serverName}) error: ${err.message}`, "error");
    };

    await client.connect(transport);
    clients.set(serverName, { client, transport });
    return client;
  }

  function registerShortcutTool(serverName: string, sourceToolName: string, description?: string) {
    const shortcutKey = `${serverName}:${sourceToolName}`;
    if (registeredShortcutKeys.has(shortcutKey)) {
      return;
    }

    const existing = new Set(pi.getAllTools().map((tool) => tool.name));
    const preferred = sanitizeToolName(sourceToolName);
    const fallback = sanitizeToolName(`mcp_${serverName}_${sourceToolName}`);
    const toolName = !existing.has(preferred)
      ? preferred
      : (!existing.has(fallback) ? fallback : null);

    if (!toolName) {
      return;
    }

    registeredShortcutKeys.add(shortcutKey);

    pi.registerTool({
      name: toolName,
      label: toolName,
      description: `MCP ${serverName}:${sourceToolName}${description ? ` - ${description}` : ""}`,
      parameters: Type.Object(
        {
          argumentsJson: Type.Optional(
            Type.String({
              description: "Tool arguments as JSON object string (e.g. {\"query\":\"...\"}).",
            })
          ),
        },
        { additionalProperties: true }
      ),
      async execute(_toolCallId, params: any, signal, _onUpdate, ctx) {
        const client = await getClient(serverName, ctx, signal);
        const args = normalizeKnownArgs(
          serverName,
          sourceToolName,
          extractToolArgs(params as Record<string, unknown> | undefined),
          ctx?.cwd
        );
        const result = await client.request(
          { method: "tools/call", params: { name: sourceToolName, arguments: args } },
          CallToolResultSchema
        );

        return {
          content: toToolContent(result),
          details: { mcp: { server: serverName, tool: sourceToolName }, raw: result },
        };
      },
    });
  }

  function hydrateCachedShortcuts(serverName: string) {
    for (const tool of shortcutCache.servers[serverName] ?? []) {
      registerShortcutTool(serverName, tool.sourceToolName, tool.description);
    }
  }

  function rememberServerTools(serverName: string, tools: Array<{ name: string; description?: string }>) {
    shortcutCache.servers[serverName] = tools.map((tool) => ({
      sourceToolName: tool.name,
      description: tool.description,
    }));
    saveShortcutCache(shortcutCache);
  }

  function warmServerTools(serverName: string, ctx: any) {
    if (warmups.has(serverName)) {
      return;
    }

    const task = (async () => {
      const client = await getClient(serverName, ctx);
      const listed = await client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);

      for (const tool of listed.tools) {
        registerShortcutTool(serverName, tool.name, tool.description);
      }

      rememberServerTools(serverName, listed.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })));
    })()
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        if (ctx?.hasUI) ctx.ui.notify(`MCP(${serverName}) failed: ${msg}`, "error");
      })
      .finally(() => {
        warmups.delete(serverName);
      });

    warmups.set(serverName, task);
  }

  pi.on("session_shutdown", async () => {
    const all = [...clients.values()];
    clients.clear();
    await Promise.all(
      all.map(async ({ transport }) => {
        try {
          await transport.close();
        } catch {
          // ignore
        }
      })
    );
  });

  pi.registerTool({
    name: "mcp_list_tools",
    label: "MCP List Tools",
    description: "List tools exposed by an MCP server (configured in ~/.pi/agent/mcp.json).",
    parameters: Type.Object({
      server: Type.String({ description: "Server name from ~/.pi/agent/mcp.json" }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const client = await getClient(params.server, ctx, signal);
      const result = await client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);

      for (const tool of result.tools) {
        registerShortcutTool(params.server, tool.name, tool.description);
      }
      rememberServerTools(params.server, result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })));

      const lines = result.tools.map((tool) => {
        const desc = tool.description ? ` - ${tool.description}` : "";
        return `- ${tool.name}${desc}`;
      });

      return {
        content: [{ type: "text", text: lines.length ? lines.join("\n") : "(no tools)" }],
        details: { toolCount: result.tools.length, tools: result.tools },
      };
    },
  });

  pi.registerTool({
    name: "mcp_call",
    label: "MCP Call",
    description:
      "Call any MCP tool by name. Use mcp_list_tools first to discover tool names. Servers configured in ~/.pi/agent/mcp.json.",
    parameters: Type.Object(
      {
        server: Type.String({ description: "Server name from ~/.pi/agent/mcp.json" }),
        tool: Type.String({ description: "Tool name (from mcp_list_tools)" }),
        argumentsJson: Type.Optional(
          Type.String({
            description: "Tool arguments as a JSON object string (e.g. {\"query\":\"...\"}).",
          })
        ),
      },
      { additionalProperties: true }
    ),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const client = await getClient(params.server, ctx, signal);
      const args = normalizeKnownArgs(
        params.server,
        params.tool,
        extractToolArgs(params as Record<string, unknown>, ["server", "tool"]),
        ctx?.cwd
      );
      const result = await client.request(
        {
          method: "tools/call",
          params: { name: params.tool, arguments: args },
        },
        CallToolResultSchema
      );

      return {
        content: toToolContent(result),
        details: { mcp: { server: params.server, tool: params.tool }, raw: result },
      };
    },
  });

  // Restore cached shortcut tools instantly, then refresh them in the background.
  // Only warm MCP servers in the interactive UI so short-lived print/RPC runs can exit cleanly.
  pi.on("session_start", (_event, ctx) => {
    const loaded = loadConfig();
    if (!loaded) {
      if (ctx?.hasUI) {
        ctx.ui.notify(
          `MCP bridge loaded. Create ${DEFAULT_CONFIG_PATH} to enable MCP tools.`,
          "info"
        );
      }
      return;
    }

    for (const serverName of Object.keys(loaded.config.servers ?? {})) {
      hydrateCachedShortcuts(serverName);
      if (ctx?.hasUI) {
        warmServerTools(serverName, ctx);
      }
    }
  });
}
