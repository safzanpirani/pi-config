import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const POLL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;
const WIDGET_KEY = "codex-usage";
const STATUS_KEY = "codex-usage";

type Window = {
	used_percent?: number;
	limit_window_seconds?: number;
	reset_at?: number;
};

type Snapshot = {
	planType?: string;
	primary: Window | null;
	secondary: Window | null;
	error?: string;
	fetchedAt: number;
};

function readCodexAuth(): { token?: string; accountId?: string } {
	try {
		const raw = readFileSync(join(homedir(), ".pi/agent/auth.json"), "utf8");
		const data = JSON.parse(raw) as Record<string, unknown>;
		const codex = data["openai-codex"] as
			| { access?: string; key?: string; accountId?: string; account_id?: string }
			| undefined;
		const token = codex?.access ?? codex?.key;
		const accountId = codex?.accountId ?? codex?.account_id;
		return { token, accountId };
	} catch {
		return {};
	}
}

async function fetchUsage(signal: AbortSignal): Promise<Snapshot> {
	const { token, accountId } = readCodexAuth();
	if (!token) {
		return { primary: null, secondary: null, error: "no codex auth", fetchedAt: Date.now() };
	}

	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		Accept: "application/json",
		"User-Agent": "pi-codex-usage-indicator/0.1",
	};
	if (accountId) headers["ChatGPT-Account-Id"] = accountId;

	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	const combined = AbortSignal.any([signal, timeout]);

	try {
		const res = await fetch(USAGE_URL, { headers, signal: combined });
		if (!res.ok) {
			return {
				primary: null,
				secondary: null,
				error: res.status === 401 || res.status === 403 ? "auth expired" : `HTTP ${res.status}`,
				fetchedAt: Date.now(),
			};
		}
		const json = (await res.json()) as {
			plan_type?: string;
			rate_limit?: { primary_window?: Window | null; secondary_window?: Window | null };
		};
		return {
			planType: json.plan_type,
			primary: json.rate_limit?.primary_window ?? null,
			secondary: json.rate_limit?.secondary_window ?? null,
			fetchedAt: Date.now(),
		};
	} catch (err) {
		const msg = combined.aborted || signal.aborted ? "aborted" : (err as Error)?.message ?? "network error";
		return { primary: null, secondary: null, error: msg, fetchedAt: Date.now() };
	}
}

function formatRemaining(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "now";
	if (seconds >= 86_400) {
		const d = Math.floor(seconds / 86_400);
		const h = Math.floor((seconds % 86_400) / 3600);
		return h > 0 ? `${d}d${h}h` : `${d}d`;
	}
	if (seconds >= 3600) {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return m > 0 ? `${h}h${m}m` : `${h}h`;
	}
	const m = Math.max(1, Math.floor(seconds / 60));
	return `${m}m`;
}

function formatResetClock(resetAtSeconds: number): string {
	const date = new Date(resetAtSeconds * 1000);
	const now = new Date();
	const sameDay =
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate();
	const time = date
		.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
		.toLowerCase()
		.replace(/\s+/g, "");
	if (sameDay) return time;
	const datePart = date.toLocaleDateString([], { day: "numeric", month: "short" });
	return `${datePart} ${time}`;
}

type ThemeColor = "success" | "accent" | "warning" | "error" | "dim";

function colorForUsage(usagePct: number, elapsedPct: number): ThemeColor {
	if (usagePct >= 90) return "error";
	if (usagePct >= 75) return "warning";
	if (usagePct >= elapsedPct + 10) return "warning";
	if (usagePct >= 50) return "accent";
	return "success";
}

function renderBar(
	width: number,
	usagePct: number,
	elapsedPct: number,
	theme: ExtensionContext["ui"]["theme"],
): string {
	const w = Math.max(4, width);
	const usage = Math.max(0, Math.min(100, usagePct));
	const elapsed = Math.max(0, Math.min(100, elapsedPct));
	const filledEnd = Math.round((usage / 100) * w);
	const cursorPos = Math.max(0, Math.min(w - 1, Math.round((elapsed / 100) * (w - 1))));
	const fillColor = colorForUsage(usage, elapsed);

	let out = "";
	let runStart = 0;
	let runColor: ThemeColor | null = null;
	const flush = (endExclusive: number) => {
		if (runColor === null || endExclusive <= runStart) return;
		out += theme.fg(runColor, "━".repeat(endExclusive - runStart));
	};

	for (let i = 0; i < w; i++) {
		if (i === cursorPos) {
			flush(i);
			out += theme.fg("accent", "|");
			runStart = i + 1;
			runColor = null;
			continue;
		}
		const color: ThemeColor = i < filledEnd ? fillColor : "dim";
		if (runColor === null) {
			runColor = color;
			runStart = i;
		} else if (color !== runColor) {
			flush(i);
			runColor = color;
			runStart = i;
		}
	}
	flush(w);
	return out;
}

function describeWindow(win: Window | null): { usagePct: number; elapsedPct: number; meta: string } | null {
	if (!win) return null;
	const usagePct = Math.max(0, Math.min(100, win.used_percent ?? 0));
	const nowSec = Math.floor(Date.now() / 1000);
	let elapsedPct = usagePct;
	let remainingPart = "";
	if (win.reset_at && win.limit_window_seconds && win.limit_window_seconds > 0) {
		const remainingSec = Math.max(0, win.reset_at - nowSec);
		elapsedPct = Math.max(
			0,
			Math.min(100, ((win.limit_window_seconds - remainingSec) / win.limit_window_seconds) * 100),
		);
		remainingPart = `${formatRemaining(remainingSec)}→${formatResetClock(win.reset_at)}`;
	} else if (win.reset_at) {
		const remainingSec = Math.max(0, win.reset_at - nowSec);
		remainingPart = `${formatRemaining(remainingSec)}→${formatResetClock(win.reset_at)}`;
	} else if (win.limit_window_seconds) {
		remainingPart = `${formatRemaining(win.limit_window_seconds)} window`;
	}
	const pctLabel = `${usagePct.toFixed(usagePct < 10 ? 1 : 0)}%`;
	const meta = remainingPart ? `${pctLabel} · ${remainingPart}` : pctLabel;
	return { usagePct, elapsedPct, meta };
}

function renderLines(snapshot: Snapshot | null, terminalWidth: number, theme: ExtensionContext["ui"]["theme"]): string[] {
	if (!snapshot) return [theme.fg("dim", "codex usage loading…")];
	if (snapshot.error) return [theme.fg("dim", `codex usage: ${snapshot.error}`)];

	const cells = [describeWindow(snapshot.primary), describeWindow(snapshot.secondary)].filter(
		(c): c is { usagePct: number; elapsedPct: number; meta: string } => Boolean(c),
	);
	if (cells.length === 0) return [theme.fg("dim", "codex usage: no data")];

	const sep = "  ";
	const fixedOverhead = cells.reduce((sum, c) => sum + c.meta.length + 1, 0) + sep.length * (cells.length - 1);
	const usableWidth = Math.max(20, terminalWidth - fixedOverhead - 2);
	const barWidth = Math.max(6, Math.floor(usableWidth / cells.length));

	const segments = cells.map((cell) => {
		const bar = renderBar(barWidth, cell.usagePct, cell.elapsedPct, theme);
		const meta = theme.fg(colorForUsage(cell.usagePct, cell.elapsedPct), cell.meta);
		return `${bar} ${meta}`;
	});

	return [segments.join(sep)];
}

function isCodexModel(ctx: ExtensionContext | undefined): boolean {
	return ctx?.model?.provider === "openai-codex";
}

export default function codexUsageIndicator(pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let abort: AbortController | undefined;
	let snapshot: Snapshot | null = null;
	let activeCtx: ExtensionContext | undefined;

	const clearWidget = () => {
		activeCtx?.ui.setWidget(WIDGET_KEY, undefined);
	};

	const refresh = () => {
		if (!activeCtx?.hasUI) return;
		if (!isCodexModel(activeCtx)) {
			clearWidget();
			return;
		}
		const lines = renderLines(snapshot, process.stdout.columns ?? 100, activeCtx.ui.theme);
		activeCtx.ui.setWidget(WIDGET_KEY, lines, { placement: "belowEditor" });
	};

	const tick = async () => {
		if (!activeCtx?.hasUI || !isCodexModel(activeCtx)) return;
		abort?.abort();
		const controller = new AbortController();
		abort = controller;
		const next = await fetchUsage(controller.signal);
		if (controller.signal.aborted) return;
		snapshot = next;
		refresh();
	};

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		activeCtx = ctx;
		refresh();
		void tick();
		clearInterval(timer);
		timer = setInterval(() => {
			void tick();
		}, POLL_MS);
		timer.unref?.();
	});

	pi.on("model_select", async (_event, ctx) => {
		activeCtx = ctx;
		if (isCodexModel(ctx)) {
			refresh();
			void tick();
		} else {
			clearWidget();
		}
	});

	pi.on("turn_end", async (_event, ctx) => {
		activeCtx = ctx;
		void tick();
	});

	pi.on("session_shutdown", async () => {
		clearInterval(timer);
		timer = undefined;
		abort?.abort();
		abort = undefined;
		clearWidget();
		activeCtx?.ui.setStatus(STATUS_KEY, undefined);
		activeCtx = undefined;
	});

	pi.registerCommand("codex-usage-refresh", {
		description: "Refresh the Codex usage indicator now",
		handler: async (_args, ctx) => {
			activeCtx = ctx;
			await tick();
			ctx.ui.notify("Codex usage refreshed", "info");
		},
	});
}
