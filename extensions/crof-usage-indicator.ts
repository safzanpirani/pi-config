import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const USAGE_URL = "https://crof.ai/usage_api/";
const POLL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;
const WIDGET_KEY = "crof-usage";
const PROVIDER_ID = "nahcrof";
const HIGHWATER_FLOOR = 50; // keep the bar from looking maxed when usable_requests is low at session start

type Snapshot = {
	usableRequests: number | null;
	requestsPlan: number | null;
	credits: number | null;
	highWater: number;
	error?: string;
	fetchedAt: number;
};

type ThemeColor = "success" | "accent" | "warning" | "error" | "dim";

function isCrofModel(ctx: ExtensionContext | undefined): boolean {
	return ctx?.model?.provider === PROVIDER_ID;
}

async function resolveApiKey(ctx: ExtensionContext | undefined): Promise<string | undefined> {
	if (ctx?.model && ctx.modelRegistry) {
		try {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
			if (auth?.ok && auth.apiKey) return auth.apiKey;
		} catch {
			// fall through to env
		}
	}
	return process.env.NAHCROF_API_KEY || undefined;
}

async function fetchUsage(
	ctx: ExtensionContext | undefined,
	signal: AbortSignal,
	prevHighWater: number,
): Promise<Snapshot> {
	const apiKey = await resolveApiKey(ctx);
	if (!apiKey) {
		return { usableRequests: null, requestsPlan: null, credits: null, highWater: prevHighWater, error: "no crof auth", fetchedAt: Date.now() };
	}

	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	const combined = AbortSignal.any([signal, timeout]);

	try {
		const res = await fetch(USAGE_URL, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Accept: "application/json",
				"User-Agent": "pi-crof-usage-indicator/0.1",
			},
			signal: combined,
		});
		if (!res.ok) {
			return {
				usableRequests: null,
				requestsPlan: null,
				credits: null,
				highWater: prevHighWater,
				error: res.status === 401 || res.status === 403 ? "auth expired" : `HTTP ${res.status}`,
				fetchedAt: Date.now(),
			};
		}
		const json = (await res.json()) as {
			usable_requests?: number | null;
			requests_plan?: number | null;
			credits?: number | null;
		};
		const usable = typeof json.usable_requests === "number" ? json.usable_requests : null;
		const plan = typeof json.requests_plan === "number" ? json.requests_plan : null;
		const credits = typeof json.credits === "number" ? json.credits : null;
		// requests_plan is the authoritative daily cap when subscribed; otherwise fall back to the largest usable count seen this session.
		const highWater = usable !== null ? Math.max(prevHighWater, usable, HIGHWATER_FLOOR) : prevHighWater;
		return { usableRequests: usable, requestsPlan: plan, credits, highWater, fetchedAt: Date.now() };
	} catch (err) {
		const aborted = combined.aborted || signal.aborted;
		return {
			usableRequests: null,
			requestsPlan: null,
			credits: null,
			highWater: prevHighWater,
			error: aborted ? "aborted" : (err as Error)?.message ?? "network error",
			fetchedAt: Date.now(),
		};
	}
}

function colorForUsedPct(pct: number): ThemeColor {
	if (pct >= 90) return "error";
	if (pct >= 75) return "warning";
	if (pct >= 50) return "accent";
	return "success";
}

function renderBar(width: number, usedPct: number, theme: ExtensionContext["ui"]["theme"]): string {
	const w = Math.max(4, width);
	const pct = Math.max(0, Math.min(100, usedPct));
	const filledEnd = Math.round((pct / 100) * w);
	const fillColor = colorForUsedPct(pct);
	const fillLen = Math.min(w, filledEnd);
	const dimLen = w - fillLen;
	const filled = fillLen > 0 ? theme.fg(fillColor, "━".repeat(fillLen)) : "";
	const empty = dimLen > 0 ? theme.fg("dim", "━".repeat(dimLen)) : "";
	return filled + empty;
}

function formatCredits(credits: number | null): string {
	if (credits === null) return "—";
	if (credits >= 100) return `$${credits.toFixed(0)}`;
	if (credits >= 10) return `$${credits.toFixed(2)}`;
	return `$${credits.toFixed(3)}`;
}

function renderLines(snapshot: Snapshot | null, terminalWidth: number, theme: ExtensionContext["ui"]["theme"]): string[] {
	if (!snapshot) return [theme.fg("dim", "crof usage loading…")];
	if (snapshot.error) return [theme.fg("dim", `crof usage: ${snapshot.error}`)];

	const credits = formatCredits(snapshot.credits);
	const cap = snapshot.requestsPlan && snapshot.requestsPlan > 0 ? snapshot.requestsPlan : snapshot.highWater;
	const reqText =
		snapshot.usableRequests === null
			? "credits only"
			: cap > 0
				? `${snapshot.usableRequests}/${cap} req`
				: `${snapshot.usableRequests} req left`;
	const meta = `${reqText} · ${credits}`;

	if (snapshot.usableRequests === null || cap <= 0) {
		return [theme.fg("dim", `crof: ${meta}`)];
	}

	const usedPct = Math.max(0, Math.min(100, ((cap - snapshot.usableRequests) / cap) * 100));
	const fixedOverhead = meta.length + 8; // "crof  " + meta + spacing
	const barWidth = Math.max(8, Math.min(40, (terminalWidth || 100) - fixedOverhead));
	const bar = renderBar(barWidth, usedPct, theme);
	const metaColored = theme.fg(colorForUsedPct(usedPct), meta);
	return [`${theme.fg("dim", "crof ")}${bar} ${metaColored}`];
}

export default function crofUsageIndicator(pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let abort: AbortController | undefined;
	let snapshot: Snapshot | null = null;
	let highWater = 0;
	let activeCtx: ExtensionContext | undefined;

	const clearWidget = () => {
		activeCtx?.ui.setWidget(WIDGET_KEY, undefined);
	};

	const render = () => {
		if (!activeCtx?.hasUI) return;
		if (!isCrofModel(activeCtx)) {
			clearWidget();
			return;
		}
		const lines = renderLines(snapshot, process.stdout.columns ?? 100, activeCtx.ui.theme);
		activeCtx.ui.setWidget(WIDGET_KEY, lines, { placement: "belowEditor" });
	};

	const tick = async () => {
		if (!activeCtx?.hasUI || !isCrofModel(activeCtx)) return;
		abort?.abort();
		const controller = new AbortController();
		abort = controller;
		const next = await fetchUsage(activeCtx, controller.signal, highWater);
		if (controller.signal.aborted) return;
		highWater = next.highWater;
		snapshot = next;
		render();
	};

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		activeCtx = ctx;
		render();
		void tick();
		clearInterval(timer);
		timer = setInterval(() => {
			void tick();
		}, POLL_MS);
		timer.unref?.();
	});

	pi.on("model_select", async (_event, ctx) => {
		activeCtx = ctx;
		if (isCrofModel(ctx)) {
			render();
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
		activeCtx = undefined;
	});

	pi.registerCommand("crof-usage-refresh", {
		description: "Refresh the Crof usage indicator now",
		handler: async (_args, ctx) => {
			activeCtx = ctx;
			await tick();
			ctx.ui.notify("Crof usage refreshed", "info");
		},
	});

	pi.registerCommand("crof-balance", {
		description: "Print current Crof credit balance",
		handler: async (_args, ctx) => {
			activeCtx = ctx;
			const next = await fetchUsage(ctx, new AbortController().signal, highWater);
			highWater = next.highWater;
			snapshot = next;
			render();
			if (next.error) {
				ctx.ui.notify(`Crof balance: ${next.error}`, "error");
			} else {
				ctx.ui.notify(`Crof credits: ${formatCredits(next.credits)}`, "info");
			}
		},
	});

	pi.registerCommand("crof-requests", {
		description: "Print Crof daily requests remaining",
		handler: async (_args, ctx) => {
			activeCtx = ctx;
			const next = await fetchUsage(ctx, new AbortController().signal, highWater);
			highWater = next.highWater;
			snapshot = next;
			render();
			if (next.error) {
				ctx.ui.notify(`Crof requests: ${next.error}`, "error");
			} else if (next.usableRequests === null) {
				ctx.ui.notify("Crof: no subscription (credits-only)", "info");
			} else {
				ctx.ui.notify(`Crof requests left today: ${next.usableRequests}`, "info");
			}
		},
	});
}
