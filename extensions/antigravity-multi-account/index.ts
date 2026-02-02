/**
 * Antigravity Multi-Account Round-Robin Extension
 * 
 * Provides multi-account support for the google-antigravity provider with:
 * - Round-robin rotation (per-request) OR use-until-exhausted mode
 * - Auto-switch on rate limits (429)
 * - Multiple account management via /ag-login, /ag-accounts, /ag-remove
 * - Persistent storage in ~/.pi/agent/antigravity-accounts.json
 * 
 * Commands:
 *   /ag-accounts  - List all accounts and their status
 *   /ag-import    - Import account from pi's current google-antigravity auth
 *   /ag-remove    - Remove an account by email or index
 *   /ag-mode      - Switch rotation mode (round-robin | use-until-exhausted)
 *   /ag-next      - Force switch to next account
 *   /ag-status    - Show current account and request stats
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ============================================================================
// Types
// ============================================================================

interface AntigravityAccount {
  email: string;
  refreshToken: string;
  projectId: string;
  accessToken?: string;
  accessTokenExpires?: number;
  addedAt: number;
  lastUsed?: number;
  lastError?: string;
  rateLimitResetTime?: number;
  requestCount?: number;
}

interface AccountsConfig {
  version: number;
  accounts: AntigravityAccount[];
  activeIndex: number;
  rotationMode: "round-robin" | "use-until-exhausted";
}

interface MultiAccountCredentials {
  refresh: string;
  access: string;
  expires: number;
  projectId: string;
  email: string;
  // Multi-account metadata stored in credentials
  _multiAccount: {
    activeIndex: number;
    totalAccounts: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_FILE = path.join(os.homedir(), ".pi", "agent", "antigravity-accounts.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Antigravity OAuth credentials (same as pi's built-in)
const CLIENT_ID = atob("MTA3MTAwNjA2MDU5MS10bWhzc2luMmgyMWxjcmUyMzV2dG9sb2poNGc0MDNlcC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ==");
const CLIENT_SECRET = atob("R09DU1BYLUs1OEZXUjQ4NkxkTEoxbUxCOHNYQzR6NnFEQWY=");

// ============================================================================
// State
// ============================================================================

let config: AccountsConfig;
let totalRequests = 0;
let lastError: string | undefined;

// ============================================================================
// Account Management
// ============================================================================

function loadConfig(): AccountsConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      return {
        version: data.version ?? 1,
        accounts: data.accounts ?? [],
        activeIndex: data.activeIndex ?? 0,
        rotationMode: data.rotationMode ?? "round-robin",
      };
    }
  } catch (e) {
    console.error("[ag-multi] Failed to load config:", e);
  }
  return { version: 1, accounts: [], activeIndex: 0, rotationMode: "round-robin" };
}

function saveConfig(cfg: AccountsConfig): void {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error("[ag-multi] Failed to save config:", e);
  }
}

function migrateFromOpencode(): void {
  const opencodeFile = path.join(os.homedir(), "AppData", "Roaming", "opencode", "antigravity-accounts.json");
  if (!fs.existsSync(CONFIG_FILE) && fs.existsSync(opencodeFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(opencodeFile, "utf-8"));
      const migrated: AccountsConfig = {
        version: 1,
        accounts: (data.accounts ?? []).map((a: any) => ({
          email: a.email,
          refreshToken: a.refreshToken,
          projectId: a.projectId ?? a.managedProjectId,
          addedAt: a.addedAt ?? Date.now(),
          lastUsed: a.lastUsed,
        })),
        activeIndex: data.activeIndex ?? 0,
        rotationMode: "round-robin",
      };
      saveConfig(migrated);
      console.log(`[ag-multi] Migrated ${migrated.accounts.length} accounts from opencode`);
    } catch (e) {
      console.error("[ag-multi] Failed to migrate from opencode:", e);
    }
  }
}

// ============================================================================
// Token Refresh
// ============================================================================

async function refreshAccessToken(account: AntigravityAccount): Promise<{ accessToken: string; expires: number }> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed for ${account.email}: ${error}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expires: Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000), // 5 min buffer
  };
}

async function getValidAccessToken(account: AntigravityAccount): Promise<string> {
  // Check if we have a valid cached token
  if (account.accessToken && account.accessTokenExpires && Date.now() < account.accessTokenExpires) {
    return account.accessToken;
  }
  
  // Refresh the token
  const { accessToken, expires } = await refreshAccessToken(account);
  account.accessToken = accessToken;
  account.accessTokenExpires = expires;
  saveConfig(config);
  return accessToken;
}

// ============================================================================
// Round-Robin Logic
// ============================================================================

function getAvailableAccounts(): AntigravityAccount[] {
  const now = Date.now();
  return config.accounts.filter(a => {
    if (a.rateLimitResetTime && a.rateLimitResetTime > now) {
      return false;
    }
    return true;
  });
}

function getNextAccountIndex(forceSwitch = false): number {
  if (config.accounts.length === 0) return -1;
  
  const now = Date.now();
  const available = getAvailableAccounts();
  
  if (available.length === 0) {
    // All accounts are rate-limited, find the one that resets soonest
    let soonestIdx = 0;
    let soonestTime = Infinity;
    for (let i = 0; i < config.accounts.length; i++) {
      const resetTime = config.accounts[i].rateLimitResetTime ?? 0;
      if (resetTime < soonestTime) {
        soonestTime = resetTime;
        soonestIdx = i;
      }
    }
    return soonestIdx;
  }
  
  if (config.rotationMode === "round-robin" || forceSwitch) {
    // Find next available account after current
    let nextIdx = (config.activeIndex + 1) % config.accounts.length;
    for (let attempts = 0; attempts < config.accounts.length; attempts++) {
      const account = config.accounts[nextIdx];
      if (!account.rateLimitResetTime || account.rateLimitResetTime <= now) {
        return nextIdx;
      }
      nextIdx = (nextIdx + 1) % config.accounts.length;
    }
  }
  
  // use-until-exhausted mode: stay on current if available
  const current = config.accounts[config.activeIndex];
  if (current && (!current.rateLimitResetTime || current.rateLimitResetTime <= now)) {
    return config.activeIndex;
  }
  
  // Current is rate-limited, find any available
  for (let i = 0; i < config.accounts.length; i++) {
    const account = config.accounts[i];
    if (!account.rateLimitResetTime || account.rateLimitResetTime <= now) {
      return i;
    }
  }
  
  return config.activeIndex;
}

function markAccountRateLimited(accountIndex: number, resetMs: number): void {
  if (accountIndex < 0 || accountIndex >= config.accounts.length) return;
  const account = config.accounts[accountIndex];
  account.rateLimitResetTime = Date.now() + resetMs;
  account.lastError = `Rate limited until ${new Date(account.rateLimitResetTime).toISOString()}`;
  saveConfig(config);
}

function switchToNextAccount(): number {
  const nextIdx = getNextAccountIndex(true);
  if (nextIdx >= 0 && nextIdx !== config.activeIndex) {
    config.activeIndex = nextIdx;
    saveConfig(config);
  }
  return config.activeIndex;
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default function(pi: ExtensionAPI) {
  // Initialize
  migrateFromOpencode();
  config = loadConfig();
  
  console.log(`[ag-multi] Loaded ${config.accounts.length} accounts, mode: ${config.rotationMode}`);
  
  // ========================================================================
  // Override google-antigravity provider with multi-account OAuth
  // ========================================================================
  
  if (config.accounts.length > 0) {
    pi.registerProvider("google-antigravity", {
      oauth: {
        name: "Antigravity Multi-Account",
        
        // Login: redirect to pi's built-in login, then import
        async login(callbacks) {
          callbacks.onAuth({ 
            url: "about:blank",
            instructions: "Use /login google-antigravity first, then /ag-import to add the account"
          });
          
          // This shouldn't be called directly since we're not really doing OAuth here
          // Return placeholder that will be replaced
          return {
            refresh: "",
            access: "",
            expires: 0,
          };
        },
        
        // Refresh: get fresh tokens for the NEXT account (round-robin happens here)
        async refreshToken(credentials: any) {
          // Determine which account to use
          const nextIdx = getNextAccountIndex();
          if (nextIdx < 0) {
            throw new Error("No Antigravity accounts configured. Use /ag-import to add accounts.");
          }
          
          // Update active index if rotating
          if (config.rotationMode === "round-robin" && nextIdx !== config.activeIndex) {
            config.activeIndex = nextIdx;
            saveConfig(config);
          }
          
          const account = config.accounts[config.activeIndex];
          if (!account) {
            throw new Error("No active account found");
          }
          
          try {
            const accessToken = await getValidAccessToken(account);
            account.lastUsed = Date.now();
            account.requestCount = (account.requestCount ?? 0) + 1;
            totalRequests++;
            saveConfig(config);
            
            return {
              refresh: account.refreshToken,
              access: accessToken,
              expires: account.accessTokenExpires ?? Date.now() + 3600000,
              projectId: account.projectId,
              email: account.email,
              _multiAccount: {
                activeIndex: config.activeIndex,
                totalAccounts: config.accounts.length,
              },
            };
          } catch (e) {
            // Mark account as having an error and try next
            account.lastError = String(e);
            saveConfig(config);
            
            // Try to switch to another account
            const fallbackIdx = switchToNextAccount();
            if (fallbackIdx !== config.activeIndex) {
              const fallback = config.accounts[fallbackIdx];
              if (fallback) {
                const accessToken = await getValidAccessToken(fallback);
                return {
                  refresh: fallback.refreshToken,
                  access: accessToken,
                  expires: fallback.accessTokenExpires ?? Date.now() + 3600000,
                  projectId: fallback.projectId,
                  email: fallback.email,
                  _multiAccount: {
                    activeIndex: fallbackIdx,
                    totalAccounts: config.accounts.length,
                  },
                };
              }
            }
            throw e;
          }
        },
        
        // getApiKey: called for each request - this is where round-robin should happen
        getApiKey(credentials: any) {
          // The credentials contain the account info from refreshToken
          // Return the JSON format expected by google-gemini-cli
          return JSON.stringify({
            token: credentials.access,
            projectId: credentials.projectId,
          });
        },
      },
    });
    
    console.log("[ag-multi] Registered multi-account OAuth provider override");
  }
  
  // ========================================================================
  // Status Updates
  // ========================================================================
  
  pi.on("session_start", async (_event, ctx) => {
    if (config.accounts.length > 0) {
      const current = config.accounts[config.activeIndex];
      ctx.ui.setStatus("ag-multi", `AG: ${config.accounts.length}acct (${current?.email?.split("@")[0] ?? "?"})`);
    }
  });
  
  pi.on("model_select", async (event, ctx) => {
    if (event.model.provider === "google-antigravity" && config.accounts.length > 0) {
      const current = config.accounts[config.activeIndex];
      ctx.ui.setStatus("ag-multi", `AG: ${config.accounts.length}acct (${current?.email?.split("@")[0] ?? "?"})`);
    } else if (event.model.provider !== "google-antigravity") {
      ctx.ui.setStatus("ag-multi", undefined);
    }
  });
  
  // Track requests and handle errors
  pi.on("turn_start", async (event, ctx) => {
    if (ctx.model?.provider !== "google-antigravity") return;
    if (config.accounts.length === 0) return;
    
    // In round-robin mode, rotate before each turn
    if (config.rotationMode === "round-robin") {
      const nextIdx = getNextAccountIndex(true);
      if (nextIdx >= 0 && nextIdx !== config.activeIndex) {
        config.activeIndex = nextIdx;
        saveConfig(config);
      }
    }
    
    const current = config.accounts[config.activeIndex];
    if (current) {
      ctx.ui.setStatus("ag-multi", `AG: ${current.email.split("@")[0]} (#${totalRequests + 1})`);
    }
  });
  
  pi.on("turn_end", async (event, ctx) => {
    if (ctx.model?.provider !== "google-antigravity") return;
    if (config.accounts.length === 0) return;
    
    const message = event.message;
    if (message?.stopReason === "error" && message?.errorMessage) {
      const errorMsg = message.errorMessage.toLowerCase();
      
      // Check for rate limit errors
      if (errorMsg.includes("429") || 
          errorMsg.includes("rate") || 
          errorMsg.includes("quota") ||
          errorMsg.includes("resource exhausted") ||
          errorMsg.includes("resourceexhausted")) {
        
        // Extract retry delay if present
        let resetMs = 60000; // Default 1 minute
        const hourMatch = message.errorMessage.match(/(\d+)h(\d+)m(\d+)s/i);
        const minMatch = message.errorMessage.match(/(\d+)m(\d+)s/i);
        const secMatch = message.errorMessage.match(/(\d+)\s*s/i);
        
        if (hourMatch) {
          resetMs = (parseInt(hourMatch[1]) * 3600 + parseInt(hourMatch[2]) * 60 + parseInt(hourMatch[3])) * 1000;
        } else if (minMatch) {
          resetMs = (parseInt(minMatch[1]) * 60 + parseInt(minMatch[2])) * 1000;
        } else if (secMatch) {
          resetMs = parseInt(secMatch[1]) * 1000;
        }
        
        // Mark current account as rate limited
        const currentIdx = config.activeIndex;
        markAccountRateLimited(currentIdx, resetMs);
        
        const current = config.accounts[currentIdx];
        ctx.ui.notify(
          `Account ${current?.email ?? currentIdx} rate limited for ${Math.ceil(resetMs / 1000)}s`,
          "warning"
        );
        
        // Switch to next available account
        const nextIdx = switchToNextAccount();
        if (nextIdx !== currentIdx) {
          const next = config.accounts[nextIdx];
          ctx.ui.notify(`Switched to: ${next?.email ?? "account " + (nextIdx + 1)}`, "info");
          ctx.ui.setStatus("ag-multi", `AG: ${next?.email?.split("@")[0] ?? "?"}`);
        } else {
          ctx.ui.notify("No other accounts available, will retry with same account", "warning");
        }
      }
      
      lastError = message.errorMessage;
    }
  });
  
  // ========================================================================
  // Commands
  // ========================================================================
  
  // List accounts
  pi.registerCommand("ag-accounts", {
    description: "List all Antigravity accounts and their status",
    handler: async (args, ctx) => {
      config = loadConfig(); // Refresh
      
      if (config.accounts.length === 0) {
        ctx.ui.notify("No accounts configured.\n\n1. Run: /login google-antigravity\n2. Then: /ag-import", "info");
        return;
      }
      
      const now = Date.now();
      const lines = config.accounts.map((a, i) => {
        const active = i === config.activeIndex ? "→ " : "  ";
        const requests = a.requestCount ?? 0;
        let status = "";
        
        if (a.rateLimitResetTime && a.rateLimitResetTime > now) {
          const remaining = Math.ceil((a.rateLimitResetTime - now) / 1000);
          status = ` [rate limited: ${remaining}s]`;
        } else if (a.lastError) {
          status = ` [last error: ${a.lastError.slice(0, 30)}...]`;
        }
        
        return `${active}${i + 1}. ${a.email} (${requests} reqs)${status}`;
      });
      
      const header = `Mode: ${config.rotationMode} | Total requests: ${totalRequests}`;
      ctx.ui.notify(`${header}\n\n${lines.join("\n")}`, "info");
    },
  });
  
  // Import from pi's auth.json
  pi.registerCommand("ag-import", {
    description: "Import the current google-antigravity account from pi's auth",
    handler: async (args, ctx) => {
      const authFile = path.join(os.homedir(), ".pi", "agent", "auth.json");
      if (!fs.existsSync(authFile)) {
        ctx.ui.notify("No auth.json found. Run /login google-antigravity first.", "error");
        return;
      }
      
      try {
        const auth = JSON.parse(fs.readFileSync(authFile, "utf-8"));
        const ag = auth["google-antigravity"];
        if (!ag || !ag.refresh) {
          ctx.ui.notify("No google-antigravity credentials in auth.json.\nRun /login google-antigravity first.", "error");
          return;
        }
        
        // Check if already exists (by refresh token)
        const existing = config.accounts.find(a => a.refreshToken === ag.refresh);
        if (existing) {
          ctx.ui.notify(`Account already exists: ${existing.email ?? existing.projectId}`, "warning");
          return;
        }
        
        // Get email from userinfo if not present
        let email = ag.email ?? "unknown";
        if (email === "unknown" && ag.access) {
          try {
            const resp = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
              headers: { Authorization: `Bearer ${ag.access}` },
            });
            if (resp.ok) {
              const info = await resp.json() as { email?: string };
              email = info.email ?? "unknown";
            }
          } catch { /* ignore */ }
        }
        
        const newAccount: AntigravityAccount = {
          email,
          refreshToken: ag.refresh,
          projectId: ag.projectId,
          accessToken: ag.access,
          accessTokenExpires: ag.expires,
          addedAt: Date.now(),
          requestCount: 0,
        };
        
        config.accounts.push(newAccount);
        saveConfig(config);
        
        ctx.ui.notify(`✓ Added account: ${email}\n  Total accounts: ${config.accounts.length}`, "success");
        ctx.ui.setStatus("ag-multi", `AG: ${config.accounts.length}acct`);
        
        // Re-register provider if this is the first account
        if (config.accounts.length === 1) {
          ctx.ui.notify("Restart pi or run /reload to activate multi-account support", "info");
        }
      } catch (e) {
        ctx.ui.notify(`Failed to import: ${e}`, "error");
      }
    },
  });
  
  // Remove account
  pi.registerCommand("ag-remove", {
    description: "Remove an Antigravity account (usage: /ag-remove <email or index>)",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Usage: /ag-remove <email or index>", "error");
        return;
      }
      
      config = loadConfig();
      const arg = args.trim();
      let index = -1;
      
      // Try as 1-based index
      const num = parseInt(arg, 10);
      if (!isNaN(num) && num >= 1 && num <= config.accounts.length) {
        index = num - 1;
      } else {
        // Try as email (case-insensitive partial match)
        index = config.accounts.findIndex(a => 
          a.email.toLowerCase().includes(arg.toLowerCase())
        );
      }
      
      if (index === -1) {
        ctx.ui.notify(`Account not found: ${arg}`, "error");
        return;
      }
      
      const removed = config.accounts.splice(index, 1)[0];
      if (config.activeIndex >= config.accounts.length) {
        config.activeIndex = Math.max(0, config.accounts.length - 1);
      }
      saveConfig(config);
      
      ctx.ui.notify(`✓ Removed: ${removed.email}\n  Remaining: ${config.accounts.length}`, "success");
    },
  });
  
  // Switch rotation mode
  pi.registerCommand("ag-mode", {
    description: "Set rotation mode: round-robin (rr) or use-until-exhausted (ue)",
    handler: async (args, ctx) => {
      const mode = args?.trim().toLowerCase();
      
      if (mode === "round-robin" || mode === "rr" || mode === "r") {
        config.rotationMode = "round-robin";
        saveConfig(config);
        ctx.ui.notify("✓ Mode: round-robin\n  Rotates account on each request", "success");
      } else if (mode === "use-until-exhausted" || mode === "exhaust" || mode === "ue" || mode === "e") {
        config.rotationMode = "use-until-exhausted";
        saveConfig(config);
        ctx.ui.notify("✓ Mode: use-until-exhausted\n  Switches only on rate limit", "success");
      } else {
        ctx.ui.notify(
          `Current mode: ${config.rotationMode}\n\n` +
          `Usage: /ag-mode <mode>\n` +
          `  rr, round-robin     - Rotate each request\n` +
          `  ue, use-until-exhausted - Switch only on rate limit`,
          "info"
        );
      }
    },
  });
  
  // Force switch to next account
  pi.registerCommand("ag-next", {
    description: "Force switch to the next available account",
    handler: async (args, ctx) => {
      config = loadConfig();
      
      if (config.accounts.length === 0) {
        ctx.ui.notify("No accounts configured", "error");
        return;
      }
      
      const prevIdx = config.activeIndex;
      const nextIdx = switchToNextAccount();
      const next = config.accounts[nextIdx];
      
      if (nextIdx === prevIdx) {
        ctx.ui.notify(`Already on only available account: ${next?.email ?? "?"}`, "info");
      } else {
        ctx.ui.notify(`✓ Switched to: ${next?.email ?? "account " + (nextIdx + 1)}`, "success");
        ctx.ui.setStatus("ag-multi", `AG: ${next?.email?.split("@")[0] ?? "?"}`);
      }
    },
  });
  
  // Status
  pi.registerCommand("ag-status", {
    description: "Show current Antigravity multi-account status",
    handler: async (args, ctx) => {
      config = loadConfig();
      
      if (config.accounts.length === 0) {
        ctx.ui.notify("No accounts configured", "info");
        return;
      }
      
      const current = config.accounts[config.activeIndex];
      const available = getAvailableAccounts();
      const now = Date.now();
      
      let status = `Current: ${current?.email ?? "none"}\n`;
      status += `Mode: ${config.rotationMode}\n`;
      status += `Accounts: ${available.length}/${config.accounts.length} available\n`;
      status += `Total requests: ${totalRequests}\n`;
      
      if (lastError) {
        status += `Last error: ${lastError.slice(0, 50)}...\n`;
      }
      
      // Show rate-limited accounts
      const rateLimited = config.accounts.filter(a => a.rateLimitResetTime && a.rateLimitResetTime > now);
      if (rateLimited.length > 0) {
        status += `\nRate limited:\n`;
        for (const a of rateLimited) {
          const remaining = Math.ceil((a.rateLimitResetTime! - now) / 1000);
          status += `  - ${a.email}: ${remaining}s\n`;
        }
      }
      
      ctx.ui.notify(status, "info");
    },
  });
  
  // Clear rate limits (for debugging)
  pi.registerCommand("ag-clear", {
    description: "Clear all rate limit timers (for debugging)",
    handler: async (args, ctx) => {
      config = loadConfig();
      
      for (const account of config.accounts) {
        account.rateLimitResetTime = undefined;
        account.lastError = undefined;
      }
      saveConfig(config);
      
      ctx.ui.notify("✓ Cleared all rate limit timers", "success");
    },
  });
  
  // OAuth login for new account
  pi.registerCommand("ag-login", {
    description: "Add a new Antigravity account via OAuth login",
    handler: async (args, ctx) => {
      try {
        // Start local callback server
        const http = await import("node:http");
        const { URLSearchParams } = await import("node:url");
        
        // Find available port (try 9096-9105, avoiding 8096 which is often used by Jellyfin)
        let port = 9096;
        let server: any = null;
        
        const tryPort = (p: number): Promise<any> => {
          return new Promise((resolve, reject) => {
            const s = http.createServer();
            s.once('error', (err: any) => {
              if (err.code === 'EADDRINUSE') {
                reject(err);
              } else {
                reject(err);
              }
            });
            s.once('listening', () => {
              s.close();
              resolve(p);
            });
            s.listen(p);
          });
        };
        
        // Find available port
        for (let p = 9096; p <= 9105; p++) {
          try {
            await tryPort(p);
            port = p;
            break;
          } catch (e) {
            if (p === 9105) {
              throw new Error("No available ports (9096-9105 all in use)");
            }
          }
        }
        
        // Generate OAuth URL with dynamic port
        const redirectUri = `http://localhost:${port}/oauth/callback`;
        const scopes = [
          "openid",
          "https://www.googleapis.com/auth/cloud-platform",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/cclog",
          "https://www.googleapis.com/auth/experimentsandconfigs",
        ];
        const scopeParam = encodeURIComponent(scopes.join(" "));
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopeParam}&access_type=offline&prompt=consent`;
        
        ctx.ui.notify(
          `Opening OAuth flow on port ${port}...\n\n` +
          `If browser doesn't open, visit:\n${authUrl}\n\n` +
          `Waiting for callback...`,
          "info"
        );
        
        const server = http.createServer(async (req, res) => {
          const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
          
          if (url.pathname === "/oauth/callback") {
            const code = url.searchParams.get("code");
            const error = url.searchParams.get("error");
            
            if (error) {
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end(`<html><body><h1>OAuth Error</h1><p>${error}</p><p>You can close this window.</p></body></html>`);
              server.close();
              ctx.ui.notify(`OAuth error: ${error}`, "error");
              return;
            }
            
            if (!code) {
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end(`<html><body><h1>Missing authorization code</h1><p>You can close this window.</p></body></html>`);
              server.close();
              ctx.ui.notify("OAuth failed: no authorization code", "error");
              return;
            }
            
            // Exchange code for tokens
            try {
              const tokenResponse = await fetch(TOKEN_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  client_id: CLIENT_ID,
                  client_secret: CLIENT_SECRET,
                  code,
                  redirect_uri: redirectUri,
                  grant_type: "authorization_code",
                }),
              });
              
              if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                throw new Error(`Token exchange failed: ${errorText}`);
              }
              
              const tokens = await tokenResponse.json() as {
                access_token: string;
                refresh_token: string;
                expires_in: number;
              };
              
              // Get user email and project ID
              const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
              });
              
              if (!userinfoResponse.ok) {
                throw new Error("Failed to get user info");
              }
              
              const userInfo = await userinfoResponse.json() as { email: string };
              
              // Get project ID (try to get default billing project)
              let projectId = "unknown";
              try {
                const projectsResponse = await fetch(
                  "https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState:ACTIVE",
                  { headers: { Authorization: `Bearer ${tokens.access_token}` } }
                );
                if (projectsResponse.ok) {
                  const projects = await projectsResponse.json() as { projects?: Array<{ projectId: string }> };
                  if (projects.projects && projects.projects.length > 0) {
                    projectId = projects.projects[0].projectId;
                  }
                }
              } catch {
                // Ignore, will use "unknown"
              }
              
              // Check if account already exists
              config = loadConfig();
              const existing = config.accounts.find(a => a.refreshToken === tokens.refresh_token || a.email === userInfo.email);
              if (existing) {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(`<html><body><h1>Account Already Exists</h1><p>${userInfo.email}</p><p>You can close this window.</p></body></html>`);
                server.close();
                ctx.ui.notify(`Account already exists: ${userInfo.email}`, "warning");
                return;
              }
              
              // Add new account
              const newAccount: AntigravityAccount = {
                email: userInfo.email,
                refreshToken: tokens.refresh_token,
                projectId,
                accessToken: tokens.access_token,
                accessTokenExpires: Date.now() + (tokens.expires_in * 1000) - (5 * 60 * 1000),
                addedAt: Date.now(),
                requestCount: 0,
              };
              
              config.accounts.push(newAccount);
              saveConfig(config);
              
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(`<html><body><h1>Success!</h1><p>Added account: ${userInfo.email}</p><p>Total accounts: ${config.accounts.length}</p><p>You can close this window.</p></body></html>`);
              server.close();
              
              ctx.ui.notify(
                `✓ Added account: ${userInfo.email}\n` +
                `  Project: ${projectId}\n` +
                `  Total accounts: ${config.accounts.length}`,
                "success"
              );
              ctx.ui.setStatus("ag-multi", `AG: ${config.accounts.length}acct`);
              
            } catch (e) {
              res.writeHead(500, { "Content-Type": "text/html" });
              res.end(`<html><body><h1>Error</h1><p>${e}</p><p>You can close this window.</p></body></html>`);
              server.close();
              ctx.ui.notify(`OAuth failed: ${e}`, "error");
            }
          } else {
            res.writeHead(404);
            res.end("Not Found");
          }
        });
        
        // Create server with proper error handling
        let timeoutHandle: NodeJS.Timeout | null = null;
        
        server.on('error', (err: any) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          ctx.ui.notify(`Server error: ${err.message}`, "error");
        });
        
        server.listen(port, () => {
          // Open browser
          const open = async () => {
            try {
              const { exec } = await import("node:child_process");
              const platform = process.platform;
              const cmd = platform === "win32" ? "start" : platform === "darwin" ? "open" : "xdg-open";
              exec(`${cmd} "${authUrl}"`);
            } catch {
              // Browser open failed, URL already shown to user
            }
          };
          open();
        });
        
        // Timeout after 5 minutes
        timeoutHandle = setTimeout(() => {
          if (server.listening) {
            server.close();
            ctx.ui.notify("OAuth timeout (5 minutes)", "warning");
          }
        }, 5 * 60 * 1000);
        
      } catch (e) {
        ctx.ui.notify(`Failed to start OAuth: ${e}`, "error");
      }
    },
  });
}
