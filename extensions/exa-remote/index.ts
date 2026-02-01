/**
 * Exa Remote MCP Extension
 *
 * Connects directly to Exa's remote MCP endpoint via Streamable HTTP.
 * Same approach as opencode's remote MCP config.
 *
 * URL: https://mcp.exa.ai/mcp?tools=...
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const EXA_MCP_URL = "https://mcp.exa.ai/mcp?tools=web_search_exa,research_paper_search_exa,news_search_exa,company_search_exa,crawling_exa,get_page_contents_exa";

let exaClient: Client | null = null;
let exaTransport: StreamableHTTPClientTransport | null = null;
let connecting = false;

async function getExaClient(): Promise<Client> {
  if (exaClient) return exaClient;
  if (connecting) {
    // Wait for connection
    while (connecting) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (exaClient) return exaClient;
  }

  connecting = true;
  try {
    const transport = new StreamableHTTPClientTransport(new URL(EXA_MCP_URL));
    const client = new Client(
      { name: "pi-exa-remote", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    exaClient = client;
    exaTransport = transport;
    console.log("[exa-remote] Connected to Exa MCP via Streamable HTTP");
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

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

export default function(pi: ExtensionAPI) {
  // Register generic Exa call tool
  pi.registerTool({
    name: "exa_call",
    label: "Exa Call",
    description: "Call any Exa MCP tool. Tools: web_search_exa, research_paper_search_exa, news_search_exa, company_search_exa, crawling_exa, get_page_contents_exa",
    parameters: Type.Object({
      tool: Type.String({ description: "Tool name (e.g., web_search_exa)" }),
      argumentsJson: Type.Optional(
        Type.String({
          description: 'Tool arguments as JSON (e.g., {"query":"...", "numResults": 5})',
        })
      ),
    }),
    async execute(_toolCallId, params, _onUpdate, ctx, signal) {
      try {
        const client = await getExaClient();
        const args = parseArgumentsJson((params as Record<string, unknown>).argumentsJson);
        
        const result = await client.request(
          {
            method: "tools/call",
            params: { name: params.tool, arguments: args },
          },
          CallToolResultSchema
        );

        const content: Array<any> = [];
        for (const item of result.content) {
          if (item.type === "text") {
            content.push({ type: "text", text: item.text });
          } else {
            content.push({ type: "text", text: `[exa:${item.type}] ${JSON.stringify(item)}` });
          }
        }

        return {
          content: content.length ? content : [{ type: "text", text: "(empty result)" }],
          details: { tool: params.tool, raw: result },
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Exa error: ${msg}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  // On session start, list available tools and register shortcuts
  pi.on("session_start", async (_event, ctx) => {
    try {
      const client = await getExaClient();
      const listed = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );

      const existingTools = pi.getAllTools().map(t => t.name);

      for (const tool of listed.tools) {
        const toolName = sanitizeToolName(tool.name);
        
        // Skip if already registered
        if (existingTools.includes(toolName)) continue;

        pi.registerTool({
          name: toolName,
          label: tool.name,
          description: tool.description ?? `Exa: ${tool.name}`,
          parameters: Type.Object({
            argumentsJson: Type.Optional(
              Type.String({
                description: 'Arguments as JSON (e.g., {"query":"...", "numResults": 5})',
              })
            ),
          }),
          async execute(_toolCallId, params: any, _onUpdate, ctx2, signal) {
            try {
              const c = await getExaClient();
              const args = parseArgumentsJson(params?.argumentsJson);
              
              const result = await c.request(
                { method: "tools/call", params: { name: tool.name, arguments: args } },
                CallToolResultSchema
              );

              const content: Array<any> = [];
              for (const item of result.content) {
                if (item.type === "text") {
                  content.push({ type: "text", text: item.text });
                } else {
                  content.push({ type: "text", text: `[exa:${item.type}] ${JSON.stringify(item)}` });
                }
              }

              return {
                content: content.length ? content : [{ type: "text", text: "(empty result)" }],
                details: { tool: tool.name, raw: result },
              };
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              return {
                content: [{ type: "text", text: `Exa error: ${msg}` }],
                details: {},
                isError: true,
              };
            }
          },
        });
      }

      if (ctx?.hasUI) {
        ctx.ui.notify(`Exa: ${listed.tools.length} tools registered via Streamable HTTP`, "info");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[exa-remote] Failed to connect:", msg);
      if (ctx?.hasUI) {
        ctx.ui.notify(`Exa connection failed: ${msg}`, "warning");
      }
    }
  });

  // Cleanup on shutdown
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
