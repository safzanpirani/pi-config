import type { AgentMessage } from "@mariozechner/pi-agent-core";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type, type Static } from "@sinclair/typebox";

import { readFileSync, writeFileSync } from "node:fs";

const CLEANUP_ENTRY_TYPE = "tool-result-cleanup";

const PREVIEW_LIMIT = 120;

const DEFAULT_LIMIT = 20;

const MAX_LIMIT = 200;

const CLEANUP_PROMPT_GUIDELINES = [
  "If a tool result is unexpectedly large or noisy and is no longer needed, clean it before the final answer.",
  "Prefer cleaning tool output before tool input unless the input is the real token hog.",
  "If tool_calls_search or tool_calls_list is used only to find cleanup targets, clean those discovery artifacts too.",
] as const;

const CLEANUP_MODES = ["drop", "replace"] as const;

const CLEANUP_TARGETS = ["input", "output", "all"] as const;

const RESULT_STATUSES = ["active", "cleaned"] as const;

const SEARCH_SCOPES = ["preview", "full_text"] as const;

const SORT_ORDERS = ["recent", "largest"] as const;

const SEARCH_STATUSES = ["active", "cleaned", "any"] as const;

type CleanupMode = (typeof CLEANUP_MODES)[number];

type CleanupTarget = (typeof CLEANUP_TARGETS)[number];

type ResultStatus = (typeof RESULT_STATUSES)[number];

type SearchScope = (typeof SEARCH_SCOPES)[number];

type SortOrder = (typeof SORT_ORDERS)[number];

type SearchStatus = (typeof SEARCH_STATUSES)[number];

type ToolResultMessage = Extract<AgentMessage, { role: "toolResult" }>;

type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;

type AssistantContentItem = AssistantMessage["content"][number];

type StorageRecord = Record<string, unknown>;

type BranchEntry = unknown;

interface SessionMessageEntry {
  type: "message";
  message: AgentMessage;
}

interface SessionCustomEntry {
  type: "custom";
  customType: string;
  data?: unknown;
}

type MessageEntry = SessionMessageEntry;

type CustomEntry = SessionCustomEntry;

interface CleanupRule {
  toolCallId: string;
  reason: string;
  mode: CleanupMode;
  target: CleanupTarget;
  createdAt: number;
}

interface AddCleanupEntry {
  action: "add";
  rule: CleanupRule;
}

interface RemoveCleanupEntry {
  action: "remove";
  toolCallId: string;
}

type CleanupEntry = AddCleanupEntry | RemoveCleanupEntry;

interface ToolCallChunk {
  type: "toolCall";
  id?: string;
  name?: string;
  arguments?: unknown;
  [key: string]: unknown;
}

interface ToolCallArtifactRow {
  toolCallId: string;
  toolName: string;
  target: CleanupTarget;
  preview: string;
  fullText: string;
  status: ResultStatus;
  approxChars: number;
  approxLines: number;
  inputChars: number;
  inputLines: number;
  outputChars: number;
  outputLines: number;
  reason?: string;
  mode?: CleanupMode;
}

const toolCallCleanupSchema = Type.Object({
  toolCallId: Type.String({ description: "Tool call ID to clean up from future context" }),
  reason: Type.String({ description: "Why this tool call artifact should be cleaned up" }),
  target: Type.Optional(
    Type.Union([Type.Literal("input"), Type.Literal("output"), Type.Literal("all")], {
      description: "What to clean: input, output, or all (default: output)",
    }),
  ),
  mode: Type.Optional(Type.String({ description: "drop or replace (default: replace)" })),
});

const toolCallCleanupRemoveSchema = Type.Object({
  toolCallId: Type.String({ description: "Tool call ID to remove from cleanup list" }),
});

const listToolCallsSchema = Type.Object({
  limit: Type.Optional(Type.Number({ description: "Max rows to return (default: 20)" })),
  includeRedacted: Type.Optional(
    Type.Boolean({
      description: "Include tool call artifacts that have already been cleaned up (default: false)",
    }),
  ),
  target: Type.Optional(
    Type.Union([Type.Literal("input"), Type.Literal("output"), Type.Literal("all")], {
      description: "Which artifacts to list (default: all)",
    }),
  ),
  sort: Type.Optional(
    Type.Union([Type.Literal("recent"), Type.Literal("largest")], {
      description: "Sort order (default: recent). 'largest' ranks by approximate character count.",
    }),
  ),
});

const searchToolCallsSchema = Type.Object({
  query: Type.String({
    description: "Text to search for. Matches are case-insensitive by default unless regex=true.",
  }),
  regex: Type.Optional(
    Type.Boolean({
      description:
        "If true, treat query as a JavaScript regex (case-sensitive unless you add flags). Default: false.",
    }),
  ),
  scope: Type.Optional(
    Type.Union([Type.Literal("preview"), Type.Literal("full_text")], {
      description: "Where to search: 'preview' (fast) or 'full_text' (best-effort). Default: preview.",
    }),
  ),
  target: Type.Optional(
    Type.Union([Type.Literal("input"), Type.Literal("output"), Type.Literal("all")], {
      description: "Which artifacts to search (default: all)",
    }),
  ),
  toolName: Type.Optional(
    Type.String({
      description: "Optional filter: only match artifacts from this tool name (e.g., 'bash', 'read').",
    }),
  ),
  status: Type.Optional(
    Type.Union([Type.Literal("active"), Type.Literal("cleaned"), Type.Literal("any")], {
      description: "Filter by cleanup status (default: active).",
    }),
  ),
  limit: Type.Optional(Type.Number({ description: "Max rows to return (default: 20)" })),
  sort: Type.Optional(
    Type.Union([Type.Literal("recent"), Type.Literal("largest")], {
      description: "Sort order (default: recent). 'largest' ranks by approximate character count.",
    }),
  ),
});

type ListToolCallsParams = Static<typeof listToolCallsSchema>;

type SearchToolCallsParams = Static<typeof searchToolCallsSchema>;

type ToolCallCleanupParams = Static<typeof toolCallCleanupSchema>;

type ToolCallCleanupRemoveParams = Static<typeof toolCallCleanupRemoveSchema>;

function normalizeCleanupMode(input: unknown): CleanupMode {
  return input === "drop" ? "drop" : "replace";
}

function normalizeCleanupTarget(input: unknown, fallback: CleanupTarget = "output"): CleanupTarget {
  return input === "input" || input === "output" || input === "all" ? input : fallback;
}

function normalizeSearchScope(input: unknown): SearchScope {
  return input === "full_text" ? "full_text" : "preview";
}

function normalizeSortOrder(input: unknown): SortOrder {
  return input === "largest" ? "largest" : "recent";
}

function normalizeSearchStatus(input: unknown): SearchStatus {
  return input === "cleaned" || input === "any" ? input : "active";
}

function normalizeLimit(input: unknown): number {
  const raw = typeof input === "number" ? input : DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, raw));
}

function targetIncludes(target: CleanupTarget, candidate: Exclude<CleanupTarget, "all">): boolean {
  return target === "all" || target === candidate;
}

function shouldIncludeByStatus(row: ToolCallArtifactRow, status: SearchStatus): boolean {
  return status === "any" || row.status === status;
}

function isObjectRecord(value: unknown): value is StorageRecord {
  return typeof value === "object" && value !== null;
}

function isMessageEntry(entry: BranchEntry): entry is MessageEntry {
  return isObjectRecord(entry) && entry.type === "message" && "message" in entry;
}

function isCustomEntry(entry: BranchEntry): entry is CustomEntry {
  return isObjectRecord(entry) && entry.type === "custom" && typeof entry.customType === "string";
}

function toolCallChunkFromContentItem(item: unknown): ToolCallChunk | null {
  if (!isObjectRecord(item) || item.type !== "toolCall") return null;
  return item as ToolCallChunk;
}

function getToolCallIdBase(toolCallId: string): string {
  const separatorIndex = toolCallId.indexOf("|");
  return separatorIndex === -1 ? toolCallId : toolCallId.slice(0, separatorIndex);
}

function toolCallIdsMatch(actualToolCallId: unknown, requestedToolCallId: unknown): boolean {
  if (typeof actualToolCallId !== "string" || typeof requestedToolCallId !== "string") return false;
  return actualToolCallId === requestedToolCallId || getToolCallIdBase(actualToolCallId) === getToolCallIdBase(requestedToolCallId);
}

function getCleanupRule(cleanups: Map<string, CleanupRule>, toolCallId: string): CleanupRule | undefined {
  return cleanups.get(toolCallId) ?? cleanups.get(getToolCallIdBase(toolCallId));
}

function stringifyToolArgs(argumentsValue: unknown): string {
  if (typeof argumentsValue === "string") return argumentsValue;
  if (argumentsValue === undefined) return "";
  try {
    return JSON.stringify(argumentsValue, null, 2);
  } catch {
    return String(argumentsValue);
  }
}

function toPreview(text: string, fallback = ""): string {
  if (!text) return fallback;
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return fallback;
  return oneLine.length <= PREVIEW_LIMIT ? oneLine : `${oneLine.slice(0, PREVIEW_LIMIT - 3)}...`;
}

function getApproxSize(text: string): { approxChars: number; approxLines: number } {
  return text ? { approxChars: text.length, approxLines: text.split("\n").length } : { approxChars: 0, approxLines: 0 };
}

function getToolOutputText(message: ToolResultMessage): string {
  return message.content
    .filter((chunk): chunk is Extract<ToolResultMessage["content"][number], { type: "text" }> => chunk.type === "text")
    .map((chunk) => chunk.text)
    .join("\n");
}

function buildArtifactRow(params: {
  toolCallId: string;
  toolName: string;
  target: Exclude<CleanupTarget, "all">;
  text: string;
  previewFallback?: string;
  rule?: CleanupRule;
}): ToolCallArtifactRow {
  const { toolCallId, toolName, target, text, previewFallback = "", rule } = params;
  const { approxChars, approxLines } = getApproxSize(text);
  const isInput = target === "input";
  return {
    toolCallId,
    toolName,
    target,
    preview: toPreview(text, previewFallback),
    fullText: text,
    status: cleanupStatusForTarget(rule, target),
    approxChars,
    approxLines,
    inputChars: isInput ? approxChars : 0,
    inputLines: isInput ? approxLines : 0,
    outputChars: isInput ? 0 : approxChars,
    outputLines: isInput ? 0 : approxLines,
    reason: rule?.reason,
    mode: rule?.mode,
  };
}

function cleanupStatusForTarget(rule: CleanupRule | undefined, target: Exclude<CleanupTarget, "all">): ResultStatus {
  if (!rule) return "active";
  return targetIncludes(rule.target, target) ? "cleaned" : "active";
}

function buildRowString(row: ToolCallArtifactRow): string {
  const marker = row.status === "cleaned" ? "[CLEANED]" : "[ACTIVE]";
  const cleanedDetails =
    row.status === "cleaned" ? ` reason="${row.reason ?? ""}" mode=${row.mode ?? "replace"}` : "";
  return `${marker} target=${row.target} chars=${row.approxChars} lines=${row.approxLines} input_chars=${row.inputChars} input_lines=${row.inputLines} output_chars=${row.outputChars} output_lines=${row.outputLines} id=${row.toolCallId} tool=${row.toolName}${cleanedDetails} preview="${row.preview}"`;
}

function stripFullText(row: ToolCallArtifactRow): Omit<ToolCallArtifactRow, "fullText"> {
  const { fullText: _fullText, ...rest } = row;
  return rest;
}

function mergePairedArtifactSizes(rows: ToolCallArtifactRow[]): ToolCallArtifactRow[] {
  const sizesByToolCallId = new Map<string, Pick<ToolCallArtifactRow, "inputChars" | "inputLines" | "outputChars" | "outputLines">>();

  for (const row of rows) {
    const current = sizesByToolCallId.get(row.toolCallId) ?? {
      inputChars: 0,
      inputLines: 0,
      outputChars: 0,
      outputLines: 0,
    };
    current.inputChars = Math.max(current.inputChars, row.inputChars);
    current.inputLines = Math.max(current.inputLines, row.inputLines);
    current.outputChars = Math.max(current.outputChars, row.outputChars);
    current.outputLines = Math.max(current.outputLines, row.outputLines);
    sizesByToolCallId.set(row.toolCallId, current);
  }

  return rows.map((row) => ({ ...row, ...sizesByToolCallId.get(row.toolCallId)! }));
}

function sortRows(rows: ToolCallArtifactRow[], sort: SortOrder): ToolCallArtifactRow[] {
  if (sort !== "largest") return rows;
  return [...rows].sort(
    (a, b) => b.inputChars + b.outputChars - (a.inputChars + a.outputChars) || b.approxChars - a.approxChars,
  );
}

function formatRowsResult(
  toolCallId: string,
  rows: ToolCallArtifactRow[],
  details: Record<string, unknown>,
  emptyText: string,
): { content: [{ type: "text"; text: string }]; details: Record<string, unknown> } {
  if (rows.length === 0) {
    return {
      content: [{ type: "text", text: emptyText }],
      details: { count: 0, results: [], selfToolCallId: toolCallId, ...details },
    };
  }
  return {
    content: [{ type: "text", text: rows.map(buildRowString).join("\n") }],
    details: { count: rows.length, results: rows.map(stripFullText), selfToolCallId: toolCallId, ...details },
  };
}

function compileMatcher(query: string, regex: boolean): (s: string) => boolean {
  if (regex) {
    const pattern = new RegExp(query);
    return (value) => pattern.test(value);
  }
  const loweredQuery = query.toLowerCase();
  return (value) => value.toLowerCase().includes(loweredQuery);
}

function replaceAssistantToolCallChunk(chunk: ToolCallChunk, replacementText: string): AssistantContentItem {
  return { ...chunk, arguments: replacementText } as unknown as AssistantContentItem;
}

function toolResultWillRemainAfterCleanup(rule: CleanupRule, hasExistingToolResult: boolean): boolean {
  if (!hasExistingToolResult) return false;
  if (!targetIncludes(rule.target, "output")) return true;
  return rule.mode === "replace";
}

function shouldPreserveAssistantToolCallShell(rule: CleanupRule, hasExistingToolResult: boolean): boolean {
  if (!targetIncludes(rule.target, "input")) return false;
  return toolResultWillRemainAfterCleanup(rule, hasExistingToolResult);
}

function cleanupAssistantToolCallChunk(
  chunk: ToolCallChunk,
  rule: CleanupRule,
  hasExistingToolResult: boolean,
  replacementText: string,
): AssistantContentItem[] {
  if (rule.mode === "replace" || shouldPreserveAssistantToolCallShell(rule, hasExistingToolResult)) {
    return [replaceAssistantToolCallChunk(chunk, replacementText)];
  }
  return [];
}

function applyCleanupToAssistantMessage(
  message: AgentMessage,
  rule: CleanupRule,
  hasExistingToolResult: boolean,
): AgentMessage | null {
  if (message.role !== "assistant" || !targetIncludes(rule.target, "input")) return message;

  let changed = false;
  const nextContent = message.content.flatMap<AssistantContentItem>((item) => {
    const chunk = toolCallChunkFromContentItem(item);
    if (!chunk || !toolCallIdsMatch(chunk.id, rule.toolCallId)) return [item];
    changed = true;
    return cleanupAssistantToolCallChunk(
      chunk,
      rule,
      hasExistingToolResult,
      `[Tool input cleaned up: ${rule.reason}]`,
    );
  });

  if (!changed) return message;
  if (nextContent.length === 0) return null;
  return { ...message, content: nextContent };
}

function applyCleanupToToolResult(message: AgentMessage, rule: CleanupRule): AgentMessage | null {
  if (message.role !== "toolResult" || !targetIncludes(rule.target, "output") || !toolCallIdsMatch(message.toolCallId, rule.toolCallId)) {
    return message;
  }

  if (rule.mode === "drop") return null;

  const details = isObjectRecord(message.details) ? message.details : {};
  return {
    ...message,
    content: [{ type: "text", text: `[Tool result cleaned up: ${rule.reason}]` }],
    details: {
      ...details,
      cleanedUp: true,
      cleanupReason: rule.reason,
      cleanupMode: rule.mode,
      cleanupTarget: rule.target,
    },
  };
}

function applyCleanup(message: AgentMessage, rule: CleanupRule, hasExistingToolResult: boolean): AgentMessage | null {
  const assistantCleaned = applyCleanupToAssistantMessage(message, rule, hasExistingToolResult);
  return assistantCleaned === null ? null : applyCleanupToToolResult(assistantCleaned, rule);
}

function getStorageReplacementText(kind: "input" | "output", reason: string, mode: CleanupMode): string {
  const label = kind === "input" ? "Tool input" : "Tool result";
  const action = mode === "drop" ? "purged from storage" : "cleaned up in storage";
  return `[${label} ${action}: ${reason}]`;
}

function rewriteStorageToolResult(
  message: StorageRecord,
  toolCallId: string,
  reason: string,
  mode: CleanupMode,
  target: CleanupTarget,
): boolean {
  if (!targetIncludes(target, "output") || message.role !== "toolResult" || !toolCallIdsMatch(message.toolCallId, toolCallId)) return false;

  message.content = [{ type: "text", text: getStorageReplacementText("output", reason, mode) }];
  const details = isObjectRecord(message.details) ? message.details : {};
  message.details = {
    ...details,
    storagePurged: true,
    storagePurgeReason: reason,
    storagePurgeMode: mode,
    storagePurgeTarget: target,
    storagePurgedAt: Date.now(),
  };

  return true;
}

function rewriteStorageAssistantMessage(
  message: StorageRecord,
  toolCallId: string,
  reason: string,
  mode: CleanupMode,
  target: CleanupTarget,
  hasExistingToolResult: boolean,
): boolean {
  if (!targetIncludes(target, "input") || message.role !== "assistant" || !Array.isArray(message.content)) return false;

  let changed = false;
  const rule: CleanupRule = { toolCallId, reason, mode, target, createdAt: 0 };
  message.content = message.content.flatMap((item) => {
    const chunk = toolCallChunkFromContentItem(item);
    if (!chunk || !toolCallIdsMatch(chunk.id, toolCallId)) return [item];
    changed = true;
    return cleanupAssistantToolCallChunk(
      chunk,
      rule,
      hasExistingToolResult,
      `[Tool input cleaned up in storage: ${reason}]`,
    );
  });

  return changed;
}

function purgeToolCallArtifactsInStorage(
  sessionFile: string,
  toolCallId: string,
  reason: string,
  mode: CleanupMode,
  target: CleanupTarget,
): number {
  const lines = readFileSync(sessionFile, "utf8").split("\n");

  const hasExistingToolResult = lines.some((line) => {
    if (!line.trim()) return false;
    try {
      const parsed = JSON.parse(line) as { type?: unknown; message?: StorageRecord };
      return (
        parsed.type === "message" &&
        isObjectRecord(parsed.message) &&
        parsed.message.role === "toolResult" &&
        toolCallIdsMatch(parsed.message.toolCallId, toolCallId)
      );
    } catch {
      return false;
    }
  });

  let purged = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!isObjectRecord(parsed) || parsed.type !== "message" || !isObjectRecord(parsed.message)) continue;

    const message = parsed.message;
    const changed =
      rewriteStorageToolResult(message, toolCallId, reason, mode, target) ||
      rewriteStorageAssistantMessage(message, toolCallId, reason, mode, target, hasExistingToolResult);

    if (!changed) continue;
    lines[index] = JSON.stringify(parsed);
    purged++;
  }

  if (purged > 0) writeFileSync(sessionFile, lines.join("\n"), "utf8");
  return purged;
}

function collectArtifactRows(
  branch: BranchEntry[],
  cleanups: Map<string, CleanupRule>,
  target: CleanupTarget,
  includeRedacted: boolean,
): ToolCallArtifactRow[] {
  const rows: ToolCallArtifactRow[] = [];

  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (!isMessageEntry(entry)) continue;

    const { message } = entry;

    if (targetIncludes(target, "input") && message.role === "assistant") {
      for (const item of message.content) {
        const chunk = toolCallChunkFromContentItem(item);
        if (!chunk?.id || !chunk.name) continue;

        const rule = getCleanupRule(cleanups, chunk.id);
        const row = buildArtifactRow({
          toolCallId: chunk.id,
          toolName: chunk.name,
          target: "input",
          text: stringifyToolArgs(chunk.arguments),
          rule,
        });

        if (!includeRedacted && row.status === "cleaned") continue;
        rows.push(row);
      }
    }

    if (targetIncludes(target, "output") && message.role === "toolResult") {
      const rule = getCleanupRule(cleanups, message.toolCallId);
      const row = buildArtifactRow({
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        target: "output",
        text: getToolOutputText(message),
        previewFallback: "[non-text content]",
        rule,
      });

      if (!includeRedacted && row.status === "cleaned") continue;
      rows.push(row);
    }
  }

  return mergePairedArtifactSizes(rows);
}

export default function(pi: ExtensionAPI) {
  const cleanups = new Map<string, CleanupRule>();

  pi.on("session_start", async (_event, ctx) => {
    cleanups.clear();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (!isCustomEntry(entry) || entry.customType !== CLEANUP_ENTRY_TYPE) continue;
      const data = entry.data as CleanupEntry | undefined;
      if (!data) continue;
      if (data.action === "add") {
        cleanups.set(data.rule.toolCallId, { ...data.rule, target: normalizeCleanupTarget(data.rule.target) });
      }
      if (data.action === "remove") cleanups.delete(data.toolCallId);
    }
  });

  pi.on("context", async (event) => {
    if (cleanups.size === 0) return;

    const existingToolResultIds = new Set(
      event.messages.filter((message) => message.role === "toolResult").map((message) => getToolCallIdBase(message.toolCallId)),
    );

    const messages: AgentMessage[] = [];
    for (const message of event.messages) {
      let current: AgentMessage | null = message;
      for (const rule of cleanups.values()) {
        if (!current) break;
        current = applyCleanup(current, rule, existingToolResultIds.has(getToolCallIdBase(rule.toolCallId)));
      }
      if (current) messages.push(current);
    }
    return { messages };
  });

  pi.registerTool({
    name: "tool_calls_list",
    label: "Tool Calls: List",
    description: "List recent tool call artifacts and their toolCallIds so specific prior calls can be cleaned up.",
    promptSnippet: "List recent tool call artifacts and their toolCallIds",
    promptGuidelines: [...CLEANUP_PROMPT_GUIDELINES],
    parameters: listToolCallsSchema as any,
    async execute(toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = rawParams as ListToolCallsParams;
      const limit = normalizeLimit(params.limit);
      const includeRedacted = params.includeRedacted === true;
      const sort = normalizeSortOrder(params.sort);
      const target = normalizeCleanupTarget(params.target, "all");

      const rows = collectArtifactRows(ctx.sessionManager.getBranch(), cleanups, target, includeRedacted);
      const picked = sortRows(rows, sort).slice(0, limit);

      return formatRowsResult(toolCallId, picked, { sort, target }, "No tool call artifacts found in current branch.");
    },
  });

  pi.registerTool({
    name: "tool_calls_search",
    label: "Tool Calls: Search",
    description: "Search tool call artifacts by preview or full text to quickly find toolCallIds for cleanup.",
    promptSnippet: "Search tool call artifacts and return matching toolCallIds",
    promptGuidelines: [...CLEANUP_PROMPT_GUIDELINES],
    parameters: searchToolCallsSchema as any,
    async execute(toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = rawParams as SearchToolCallsParams;
      const limit = normalizeLimit(params.limit);
      const query = params.query;
      const regex = params.regex === true;
      const scope = normalizeSearchScope(params.scope);
      const status = normalizeSearchStatus(params.status);
      const sort = normalizeSortOrder(params.sort);
      const toolName = typeof params.toolName === "string" && params.toolName.trim() ? params.toolName.trim() : null;
      const target = normalizeCleanupTarget(params.target, "all");

      let match: (value: string) => boolean;
      try {
        match = compileMatcher(query, regex);
      } catch (error) {
        return formatRowsResult(
          toolCallId,
          [],
          { query, regex, scope, status, toolName, sort, target, error: String(error) },
          "Invalid regex for tool_calls_search.query. Tip: set regex=false to use plain substring search.",
        );
      }

      const matches = collectArtifactRows(ctx.sessionManager.getBranch(), cleanups, target, true).filter((row) => {
        if (toolName && row.toolName !== toolName) return false;
        if (!shouldIncludeByStatus(row, status)) return false;
        const haystack = scope === "full_text" ? row.fullText : row.preview;
        return Boolean(haystack) && match(haystack);
      });

      const picked = sortRows(matches, sort).slice(0, limit);

      return formatRowsResult(
        toolCallId,
        picked,
        { query, regex, scope, status, toolName, sort, target },
        "No matching tool call artifacts found. Tip: try scope='full_text' or status='any'.",
      );
    },
  });

  pi.registerTool({
    name: "tool_call_cleanup",
    label: "Tool Call: Cleanup",
    description: "Clean up prior tool call artifacts by toolCallId. target=output cleans the tool result, target=input cleans the tool arguments, target=all cleans both. mode=drop removes content; mode=replace keeps a placeholder.",
    promptSnippet: "Clean up tool call input/output artifacts by toolCallId",
    promptGuidelines: [...CLEANUP_PROMPT_GUIDELINES],
    parameters: toolCallCleanupSchema as any,
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = rawParams as ToolCallCleanupParams;
      const mode = normalizeCleanupMode(params.mode);
      const target = normalizeCleanupTarget(params.target, "output");
      const createdAt = Date.now();
      const branch = ctx.sessionManager.getBranch() as BranchEntry[];

      const primaryRule: CleanupRule = {
        toolCallId: params.toolCallId,
        reason: params.reason,
        mode,
        target,
        createdAt,
      };

      cleanups.set(params.toolCallId, primaryRule);
      pi.appendEntry(CLEANUP_ENTRY_TYPE, { action: "add", rule: primaryRule });

      const autoCleanupReason = `Auto-cleaned prior tool_calls_list output after cleanup: ${params.toolCallId}`;
      const autoCleanedToolCallIds: string[] = [];

      for (let index = branch.length - 1; index >= 0; index--) {
        const entry = branch[index];
        if (!isMessageEntry(entry)) continue;
        const { message } = entry;

        if (message.role !== "toolResult") continue;
        if (message.toolName !== "tool_calls_list") continue;
        if (toolCallIdsMatch(message.toolCallId, params.toolCallId)) continue;
        if (getCleanupRule(cleanups, message.toolCallId)) continue;

        const autoRule: CleanupRule = {
          toolCallId: message.toolCallId,
          reason: autoCleanupReason,
          mode: "drop",
          target: "output",
          createdAt,
        };

        cleanups.set(message.toolCallId, autoRule);
        pi.appendEntry(CLEANUP_ENTRY_TYPE, { action: "add", rule: autoRule });
        autoCleanedToolCallIds.push(message.toolCallId);
      }

      let purged = 0;
      let autoPurged = 0;

      const sessionFile = ctx.sessionManager.getSessionFile();
      if (sessionFile) {
        purged = purgeToolCallArtifactsInStorage(sessionFile, params.toolCallId, params.reason, mode, target);
        for (const autoToolCallId of autoCleanedToolCallIds) {
          autoPurged += purgeToolCallArtifactsInStorage(
            sessionFile,
            autoToolCallId,
            autoCleanupReason,
            "drop",
            "output",
          );
        }
      }

      const confirmation = `Cleanup applied for toolCallId=${params.toolCallId}. reason="${params.reason}" target=${target} mode=${mode}. Storage purge matches=${purged}. Auto-cleaned tool_calls_list outputs=${autoCleanedToolCallIds.length}. Auto-purged matches=${autoPurged}.`;

      return {
        content: [{ type: "text", text: confirmation }],
        details: {
          toolCallId: params.toolCallId,
          reason: params.reason,
          target,
          mode,
          purged,
          autoCleanedToolCallIds,
          autoPurged,
          sessionFile,
        },
      };
    },
  });

  pi.registerTool({
    name: "tool_call_cleanup_remove",
    label: "Tool Call Cleanup: Remove",
    description: "Remove a previously configured cleanup rule for a toolCallId.",
    parameters: toolCallCleanupRemoveSchema as any,
    async execute(_toolCallId, rawParams) {
      const params = rawParams as ToolCallCleanupRemoveParams;
      const existed = cleanups.delete(params.toolCallId);

      if (existed) pi.appendEntry(CLEANUP_ENTRY_TYPE, { action: "remove", toolCallId: params.toolCallId });

      const text = existed
        ? `Removed cleanup for toolCallId=${params.toolCallId}.`
        : `No cleanup found for toolCallId=${params.toolCallId}.`;

      return { content: [{ type: "text", text }], details: { toolCallId: params.toolCallId, removed: existed } };
    },
  });
}
