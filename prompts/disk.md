---
description: Check all drives storage space on main, server, or vps via SSH.
argument-hint: "<main|server|vps|phone>"
---

Check storage space on ALL drives for the target PC.

**Target**: `$1`
- `main` / `maints` — Main Windows PC (Tailscale)
- `server` / `serverts` — Server Windows PC (Tailscale)
- `vps` — Linux VPS (direct SSH)
- `phone` / `phonets` — Android phone via Termux SSH (local or Tailscale)

## Windows Targets (main / server)

Write a temp PowerShell script to the remote machine and execute it, then clean up. Avoid complex inline quoting which breaks through SSH.

```bash
# Create script locally
cat > /tmp/diskcheck.ps1 << 'EOF'
Get-PSDrive -PSProvider FileSystem | ForEach-Object {
    $usedGB = [math]::Round($_.Used / 1GB, 2)
    $freeGB = [math]::Round($_.Free / 1GB, 2)
    $totalGB = [math]::Round(($_.Used + $_.Free) / 1GB, 2)
    $pct = [math]::Round(($_.Used / ($_.Used + $_.Free)) * 100, 1)
    Write-Output "$($_.Name): $usedGB GB used / $freeGB GB free (Total: $totalGB GB, $pct% used)"
}
EOF

# Copy and run on target
scp /tmp/diskcheck.ps1 $1:/tmp/diskcheck.ps1
ssh $1 'powershell -File /tmp/diskcheck.ps1'
ssh $1 'rm /tmp/diskcheck.ps1'
rm /tmp/diskcheck.ps1
```

## Linux Targets (vps / phone)

Use `df -h` directly via SSH:

```bash
ssh $1 'df -h | grep -v tmpfs'
```

For phone, try local first then Tailscale if connection refused:
```bash
ssh phone 'df -h' 2>/dev/null || ssh phonets 'df -h'
```

Report the results clearly. Flag any drive above 90% used as a warning.