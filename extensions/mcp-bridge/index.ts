import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

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

const DEFAULT_CONFIG_PATH = "~/.pi/agent/mcp.json";

function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return `${home}/${path.slice(2)}`;
  }
  return path;
}

async function loadConfig(pi: ExtensionAPI): Promise<{ path: string; config: McpBridgeConfig } | null> {
  const path = expandHome(DEFAULT_CONFIG_PATH);
  try {
    const res = await pi.exec("node", ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(path)}, 'utf8'))`], {
      timeout: 2000,
    });
    if (res.code !== 0) return null;
    const parsed = JSON.parse(res.stdout) as McpBridgeConfig;
    if (!parsed?.servers || typeof parsed.servers !== "object") return null;
    return { path, config: parsed };
  } catch {
    return null;
  }
}

function resolveEnv(env: McpServerConfig["env"]): Record<string, string> {
  const out: Record<string, string> = {};

  // env: ["FOO", "BAR"] => inherit from process.env
  if (Array.isArray(env)) {
    for (const name of env) {
      const val = process.env[name];
      if (typeof val === "string" && val.length > 0) out[name] = val;
    }
    return out;
  }

  // env: { "FOO": "literal", "BAR": "$FROM_ENV" }
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

  function sanitizeToolName(name: string): string {
    // Google function calling is picky; keep it simple.
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

  async function getClient(serverName: string, ctx: any, signal?: AbortSignal) {
    const loaded = await loadConfig(pi);
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
    async execute(_toolCallId, params, _onUpdate, ctx, signal) {
      const client = await getClient(params.server, ctx, signal);
      const result = await client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);

      const lines = result.tools.map((t) => {
        const desc = t.description ? ` - ${t.description}` : "";
        return `- ${t.name}${desc}`;
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
    parameters: Type.Object({
      server: Type.String({ description: "Server name from ~/.pi/agent/mcp.json" }),
      tool: Type.String({ description: "Tool name (from mcp_list_tools)" }),
      argumentsJson: Type.Optional(
        Type.String({
          description: "Tool arguments as a JSON object string (e.g. {\"query\":\"...\"}).",
        })
      ),
    }),
    async execute(_toolCallId, params, _onUpdate, ctx, signal) {
      const client = await getClient(params.server, ctx, signal);
      const args = parseArgumentsJson((params as Record<string, unknown>).argumentsJson);
      const result = await client.request(
        {
          method: "tools/call",
          params: { name: params.tool, arguments: args },
        },
        CallToolResultSchema
      );

      // Pass through MCP content blocks as-is where possible; fall back to text.
      const content: Array<any> = [];
      for (const item of result.content) {
        if (item.type === "text") content.push({ type: "text", text: item.text });
        else content.push({ type: "text", text: `[mcp:${item.type}] ${JSON.stringify(item)}` });
      }

      return {
        content: content.length ? content : [{ type: "text", text: "(empty result)" }],
        details: { mcp: { server: params.server, tool: params.tool }, raw: result },
      };
    },
  });

  // Optional shortcut tools (convenience wrappers)
  pi.on("session_start", async (_event, ctx) => {
    const loaded = await loadConfig(pi);
    if (!loaded) {
      if (ctx?.hasUI) {
        ctx.ui.notify(
          `MCP bridge loaded. Create ${DEFAULT_CONFIG_PATH} to enable MCP tools.`,
          "info"
        );
      }
      return;
    }

    // Expose each server's tools as pi tools.
    for (const [serverName, _serverCfg] of Object.entries(loaded.config.servers ?? {})) {
      try {
        const client = await getClient(serverName, ctx);
        const listed = await client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);

        for (const tool of listed.tools) {
          const preferred = sanitizeToolName(tool.name);
          const fallback = sanitizeToolName(`mcp_${serverName}_${tool.name}`);
          const existing = pi.getAllTools().map((t) => t.name);

          const toolName = !existing.includes(preferred)
            ? preferred
            : (!existing.includes(fallback) ? fallback : null);

          if (!toolName) continue;

          pi.registerTool({
            name: toolName,
            label: toolName,
            description: `MCP ${serverName}:${tool.name}${tool.description ? ` - ${tool.description}` : ""}`,
            parameters: Type.Object({
              argumentsJson: Type.Optional(
                Type.String({
                  description: "Tool arguments as JSON object string (e.g. {\"query\":\"...\"}).",
                })
              ),
            }),
            async execute(_toolCallId, params: any, _onUpdate, ctx2, signal) {
              const c = await getClient(serverName, ctx2, signal);
              const args = parseArgumentsJson(params?.argumentsJson);
              const result = await c.request(
                { method: "tools/call", params: { name: tool.name, arguments: args } },
                CallToolResultSchema
              );

              const content: Array<any> = [];
              for (const item of result.content) {
                if (item.type === "text") content.push({ type: "text", text: item.text });
                else content.push({ type: "text", text: `[mcp:${item.type}] ${JSON.stringify(item)}` });
              }

              return {
                content: content.length ? content : [{ type: "text", text: "(empty result)" }],
                details: { mcp: { server: serverName, tool: tool.name }, raw: result },
              };
            },
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (ctx?.hasUI) ctx.ui.notify(`MCP(${serverName}) failed: ${msg}`, "error");
      }
    }
  });
}
