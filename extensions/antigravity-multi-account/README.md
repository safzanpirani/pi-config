# Antigravity Multi-Account Extension

Round-robin multi-account support for pi's `google-antigravity` provider.

## Features

- **Round-robin rotation**: Distribute load evenly across all accounts
- **Use-until-exhausted mode**: Use one account until rate-limited, then switch
- **Auto-switch on rate limits**: Automatically detects 429/quota errors and switches
- **Rate limit tracking**: Remembers when each account was rate-limited
- **Request counting**: Tracks requests per account for monitoring

## Quick Start

1. The extension auto-loads from `~/.pi/agent/extensions/antigravity-multi-account/`
2. Your 8 accounts are pre-configured in `~/.pi/agent/antigravity-accounts.json`
3. Use `/ag-accounts` to see all accounts and their status
4. Use `/ag-mode rr` for round-robin or `/ag-mode ue` for use-until-exhausted

## Commands

| Command | Description |
|---------|-------------|
| `/ag-accounts` | List all accounts with status, request counts, rate limits |
| `/ag-import` | Import account from pi's auth (after `/login google-antigravity`) |
| `/ag-remove <email\|index>` | Remove an account |
| `/ag-mode <rr\|ue>` | Switch rotation mode |
| `/ag-next` | Force switch to next account |
| `/ag-status` | Show current account and stats |
| `/ag-clear` | Clear all rate limit timers (debugging) |

## Rotation Modes

### Round-Robin (`rr`)
Rotates to the next available account on each request. Best for distributing load evenly.

### Use-Until-Exhausted (`ue`) 
Stays on one account until it hits a rate limit, then switches. Best for maximizing each account's quota before moving on.

## Adding New Accounts

1. Run `/login google-antigravity` in pi
2. Complete the OAuth flow in your browser
3. Run `/ag-import` to add the account to the pool

## How It Works

The extension overrides `google-antigravity`'s OAuth provider with a custom implementation that:

1. On each token refresh (which happens per-request when expired), selects the next account based on rotation mode
2. Tracks rate limit errors in `turn_end` events and marks accounts as unavailable
3. Automatically skips rate-limited accounts until their reset time passes

## Config File

`~/.pi/agent/antigravity-accounts.json`:

```json
{
  "version": 1,
  "accounts": [
    {
      "email": "user@gmail.com",
      "refreshToken": "1//...",
      "projectId": "project-id",
      "addedAt": 1234567890,
      "requestCount": 42
    }
  ],
  "activeIndex": 0,
  "rotationMode": "round-robin"
}
```

## Status Bar

When using an antigravity model, the status bar shows:
- `AG: 8acct (username)` - Number of accounts and current user
- `AG: username (#42)` - During a request, shows request count
