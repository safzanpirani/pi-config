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
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const EXA_MCP_URL = "https://mcp.exa.ai/mcp?tools=web_search_exa,research_paper_search_exa,news_search_exa,company_search_exa,crawling_exa,get_page_contents_exa";

const EXA_TOOLS = [
  {
    name: "web_search_exa",
    description: "Search the web for any topic and get clean, ready-to-use content.",
  },
  {
    name: "research_paper_search_exa",
    description: "Search for research papers and scholarly content.",
  },
  {
    name: "news_search_exa",
    description: "Search recent news articles.",
  },
  {
    name: "company_search_exa",
    description: "Search for company information.",
  },
  {
    name: "crawling_exa",
    description: "Get the full content of a specific webpage.",
  },
  {
    name: "get_page_contents_exa",
    description: "Get page contents from a specific webpage.",
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
    async execute(_toolCallId, params) {
      try {
        return await callExaTool(params.tool, (params as Record<string, unknown>).argumentsJson);
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
