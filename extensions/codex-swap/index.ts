import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type OAuthCred = {
  type: "oauth";
  refresh?: string;
  access?: string;
  expires?: number;
  accountId?: string;
  [k: string]: unknown;
};

type Profile = {
  id: string;
  label: string;
  savedAt: number;
  email?: string;
  accountId?: string;
  oauth: OAuthCred;
};

type StoreV2 = {
  version: 2;
  activeProfileId?: string;
  profiles: Profile[];
};

type LegacySlotName = "current" | "previous";

type LegacySlot = {
  label: string;
  savedAt: number;
  email?: string;
  accountId?: string;
  oauth: OAuthCred;
};

type LegacyStore = {
  version: 1;
  activeSlot?: LegacySlotName;
  slots: Partial<Record<LegacySlotName, LegacySlot>>;
};

const AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
const AUTH_FILE = path.join(AGENT_DIR, "auth.json");
const STORE_FILE = path.join(AGENT_DIR, "codexswap.json");
const BACKUPS_DIR = path.join(os.homedir(), ".pi", "backups");

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // ignore chmod issues on some filesystems
  }
}

function getOpenAICodexFromAuth(): OAuthCred | null {
  const auth = readJson<Record<string, unknown>>(AUTH_FILE);
  const entry = auth?.["openai-codex"] as OAuthCred | undefined;
  if (!entry || entry.type !== "oauth") return null;
  return entry;
}

function updateOpenAICodexInAuth(oauth: OAuthCred): void {
  const auth = readJson<Record<string, unknown>>(AUTH_FILE) ?? {};
  auth["openai-codex"] = oauth;
  writeJson(AUTH_FILE, auth);
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

function profileFromOauth(oauth: OAuthCred, label: string): Profile {
  return {
    id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    savedAt: Date.now(),
    email: inferEmail(oauth),
    accountId: typeof oauth.accountId === "string" ? oauth.accountId : undefined,
    oauth,
  };
}

function sanitizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

function ensureUniqueLabel(profiles: Profile[], preferred: string, excludeId?: string): string {
  const base = sanitizeLabel(preferred) || "profile";
  const taken = new Set(
    profiles
      .filter((p) => p.id !== excludeId)
      .map((p) => p.label.toLowerCase())
  );
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}

function defaultLabelFor(oauth: OAuthCred, profiles: Profile[]): string {
  const email = inferEmail(oauth);
  const fromEmail = email?.split("@")[0]?.trim();
  if (fromEmail) return ensureUniqueLabel(profiles, fromEmail);
  const acct = typeof oauth.accountId === "string" ? oauth.accountId.slice(0, 8) : "profile";
  return ensureUniqueLabel(profiles, `codex-${acct}`);
}

function findByRefresh(profiles: Profile[], refresh?: string): Profile | undefined {
  if (!refresh) return undefined;
  return profiles.find((p) => p.oauth.refresh === refresh);
}

function latestCodexBackupOauth(): OAuthCred | null {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return null;
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => /^openai-codex-oauth\..+\.json$/.test(f))
      .sort();
    if (files.length === 0) return null;
    const parsed = readJson<Record<string, OAuthCred>>(path.join(BACKUPS_DIR, files[files.length - 1]));
    const oauth = parsed?.["openai-codex"];
    if (!oauth || oauth.type !== "oauth") return null;
    return oauth;
  } catch {
    return null;
  }
}

function migrateLegacyStore(legacy: LegacyStore): StoreV2 {
  const profiles: Profile[] = [];
  const addLegacy = (name: LegacySlotName) => {
    const slot = legacy.slots?.[name];
    if (!slot?.oauth || slot.oauth.type !== "oauth") return;
    if (findByRefresh(profiles, slot.oauth.refresh)) return;
    profiles.push({
      id: `legacy_${name}`,
      label: sanitizeLabel(slot.label || name) || name,
      savedAt: slot.savedAt || Date.now(),
      email: slot.email,
      accountId: slot.accountId,
      oauth: slot.oauth,
    });
  };

  addLegacy("current");
  addLegacy("previous");

  let activeProfileId: string | undefined;
  if (legacy.activeSlot) {
    const found = profiles.find((p) => p.id === `legacy_${legacy.activeSlot}`);
    activeProfileId = found?.id;
  }

  return { version: 2, activeProfileId, profiles };
}

function loadStore(): StoreV2 {
  const raw = readJson<StoreV2 | LegacyStore | Record<string, unknown>>(STORE_FILE);

  if (raw && (raw as StoreV2).version === 2 && Array.isArray((raw as StoreV2).profiles)) {
    const s = raw as StoreV2;
    return { version: 2, activeProfileId: s.activeProfileId, profiles: s.profiles };
  }

  if (raw && (raw as LegacyStore).version === 1 && (raw as LegacyStore).slots) {
    return migrateLegacyStore(raw as LegacyStore);
  }

  return { version: 2, profiles: [] };
}

function saveStore(store: StoreV2): void {
  writeJson(STORE_FILE, store);
}

function ensureBootstrapped(store: StoreV2): StoreV2 {
  const live = getOpenAICodexFromAuth();
  if (!live) return store;

  let liveProfile = findByRefresh(store.profiles, live.refresh);
  if (!liveProfile) {
    const label = defaultLabelFor(live, store.profiles);
    liveProfile = profileFromOauth(live, label);
    store.profiles.push(liveProfile);
  }

  if (!store.activeProfileId) {
    store.activeProfileId = liveProfile.id;
  }

  // Seed from your earlier backup as a convenient second account.
  if (store.profiles.length < 2) {
    const backup = latestCodexBackupOauth();
    if (backup?.refresh && !findByRefresh(store.profiles, backup.refresh)) {
      const label = ensureUniqueLabel(store.profiles, inferEmail(backup)?.split("@")[0] || "backup");
      store.profiles.push(profileFromOauth(backup, label));
    }
  }

  return store;
}

function resolveProfile(profiles: Profile[], selector: string): Profile | undefined {
  const target = selector.trim();
  if (!target) return undefined;

  const asNum = Number(target);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= profiles.length) {
    return profiles[asNum - 1];
  }

  const lower = target.toLowerCase();
  const exact = profiles.find((p) => p.label.toLowerCase() === lower || p.id.toLowerCase() === lower);
  if (exact) return exact;

  const fuzzy = profiles.filter(
    (p) => p.label.toLowerCase().includes(lower) || (p.email ?? "").toLowerCase().includes(lower)
  );
  if (fuzzy.length === 1) return fuzzy[0];

  return undefined;
}

function shortWho(profile: Profile): string {
  return profile.email ?? profile.accountId ?? "unknown-account";
}

function helpText(): string {
  return [
    "Usage:",
    "  /codexswap                 Cycle to next saved Codex account",
    "  /codexswap status          Show current + saved accounts",
    "  /codexswap who             Show live account from auth.json",
    "  /codexswap add [label]     Save currently logged-in account",
    "  /codexswap use <label|#>   Switch to a saved account",
    "  /codexswap rm <label|#>    Remove a saved account",
    "  /codexswap rename <sel> <new-label>",
    "",
    "Flow to add a 3rd account:",
    "  1) /login openai-codex (sign into new account)",
    "  2) /codexswap add work3",
  ].join("\n");
}

export default function codexSwapExtension(pi: ExtensionAPI) {
  const showWho = (ctx: any, live: OAuthCred, store: StoreV2) => {
    const match = findByRefresh(store.profiles, live.refresh);
    const email = inferEmail(live);
    const who = email || (typeof live.accountId === "string" ? live.accountId : "unknown-account");
    ctx.ui.notify(
      `Live openai-codex: ${who}${match ? `\nSaved profile: ${match.label}` : "\nSaved profile: (not yet saved)"}`,
      "info"
    );
  };

  pi.registerCommand("codexwho", {
    description: "Show the currently active OpenAI Codex account",
    handler: async (_args, ctx) => {
      const live = getOpenAICodexFromAuth();
      if (!live) {
        ctx.ui.notify("No openai-codex OAuth found in auth.json.", "error");
        return;
      }
      const store = ensureBootstrapped(loadStore());
      saveStore(store);
      showWho(ctx, live, store);
    },
  });

  pi.registerCommand("codexswap", {
    description: "Manage/switch multiple OpenAI Codex OAuth accounts",
    handler: async (args, ctx) => {
      const live = getOpenAICodexFromAuth();
      if (!live) {
        ctx.ui.notify("No openai-codex OAuth found in auth.json.", "error");
        return;
      }

      const raw = (args ?? "").trim();
      const parts = raw.length ? raw.split(/\s+/) : [];
      const sub = (parts[0] ?? "").toLowerCase();
      const rest = raw.length ? raw.slice(parts[0]?.length ?? 0).trim() : "";

      const store = ensureBootstrapped(loadStore());
      const liveProfile = findByRefresh(store.profiles, live.refresh);
      if (liveProfile) store.activeProfileId = liveProfile.id;

      if (!sub || sub === "next" || sub === "toggle") {
        if (store.profiles.length < 2) {
          saveStore(store);
          ctx.ui.notify("Need at least 2 saved Codex accounts. Add another with /login openai-codex then /codexswap add <label>.", "warning");
          return;
        }

        const currentId = liveProfile?.id ?? store.activeProfileId ?? store.profiles[0].id;
        const idx = Math.max(0, store.profiles.findIndex((p) => p.id === currentId));
        const target = store.profiles[(idx + 1) % store.profiles.length];

        updateOpenAICodexInAuth(target.oauth);
        store.activeProfileId = target.id;
        saveStore(store);

        ctx.ui.notify(`Switched openai-codex → ${target.label} (${shortWho(target)}).\nRun /reload once if this session still uses old creds.`, "success");
        return;
      }

      if (sub === "status" || sub === "list") {
        const lines = store.profiles.map((p, i) => {
          const active = p.id === store.activeProfileId ? "*" : " ";
          const liveMark = p.oauth.refresh && p.oauth.refresh === live.refresh ? "(live)" : "";
          return `${active} ${i + 1}. ${p.label} - ${shortWho(p)} ${liveMark}`.trim();
        });
        saveStore(store);
        ctx.ui.notify(
          [
            `Profiles: ${store.profiles.length}`,
            `Active: ${store.profiles.find((p) => p.id === store.activeProfileId)?.label ?? "unknown"}`,
            "",
            lines.length ? lines.join("\n") : "(none)",
          ].join("\n"),
          "info"
        );
        return;
      }

      if (sub === "who") {
        saveStore(store);
        showWho(ctx, live, store);
        return;
      }

      if (sub === "add" || sub === "save" || sub === "save-current" || sub === "save-previous") {
        const forcedLabel = sub === "save-current" ? "current" : sub === "save-previous" ? "previous" : "";
        const desired = sanitizeLabel(forcedLabel || rest);

        const existing = findByRefresh(store.profiles, live.refresh);
        if (existing) {
          existing.oauth = live;
          existing.savedAt = Date.now();
          existing.email = inferEmail(live);
          existing.accountId = typeof live.accountId === "string" ? live.accountId : undefined;
          if (desired) existing.label = ensureUniqueLabel(store.profiles, desired, existing.id);
          store.activeProfileId = existing.id;
          saveStore(store);
          ctx.ui.notify(`Updated profile: ${existing.label} (${shortWho(existing)})`, "success");
          return;
        }

        const label = desired ? ensureUniqueLabel(store.profiles, desired) : defaultLabelFor(live, store.profiles);
        const profile = profileFromOauth(live, label);
        store.profiles.push(profile);
        store.activeProfileId = profile.id;
        saveStore(store);
        ctx.ui.notify(`Saved new profile: ${profile.label} (${shortWho(profile)})`, "success");
        return;
      }

      if (sub === "use" || sub === "current" || sub === "previous") {
        const selector = sub === "current" || sub === "previous" ? sub : rest;
        const target = resolveProfile(store.profiles, selector);
        if (!target) {
          ctx.ui.notify(`Profile not found: ${selector || "(empty)"}`, "error");
          return;
        }

        updateOpenAICodexInAuth(target.oauth);
        store.activeProfileId = target.id;
        saveStore(store);
        ctx.ui.notify(`Switched openai-codex → ${target.label} (${shortWho(target)}).\nRun /reload once if needed.`, "success");
        return;
      }

      if (sub === "rm" || sub === "remove") {
        const target = resolveProfile(store.profiles, rest);
        if (!target) {
          ctx.ui.notify(`Profile not found: ${rest || "(empty)"}`, "error");
          return;
        }

        store.profiles = store.profiles.filter((p) => p.id !== target.id);
        if (store.activeProfileId === target.id) {
          store.activeProfileId = store.profiles[0]?.id;
        }
        saveStore(store);
        ctx.ui.notify(`Removed profile: ${target.label}`, "success");
        return;
      }

      if (sub === "rename") {
        const [selector, ...labelParts] = rest.split(/\s+/);
        const newLabelRaw = labelParts.join(" ").trim();
        if (!selector || !newLabelRaw) {
          ctx.ui.notify("Usage: /codexswap rename <label|#> <new-label>", "error");
          return;
        }

        const target = resolveProfile(store.profiles, selector);
        if (!target) {
          ctx.ui.notify(`Profile not found: ${selector}`, "error");
          return;
        }

        target.label = ensureUniqueLabel(store.profiles, newLabelRaw, target.id);
        saveStore(store);
        ctx.ui.notify(`Renamed profile to: ${target.label}`, "success");
        return;
      }

      ctx.ui.notify(helpText(), "info");
    },
  });
}
