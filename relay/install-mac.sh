#!/bin/bash
# Installs the Mac relay (relay-local.mjs) as a launchd job that refreshes
# hillingdonstags.uk daily at 08:00 and 21:00, plus at login.
# Safe to re-run: it replaces any previous install.
#   Uninstall: launchctl bootout gui/$(id -u)/uk.hillingdonstags.relay
#              rm ~/Library/LaunchAgents/uk.hillingdonstags.relay.plist
#   Log:       ~/Library/Logs/stags-relay.log
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/scripts/stags-relay"
PLIST="$HOME/Library/LaunchAgents/uk.hillingdonstags.relay.plist"
LABEL="uk.hillingdonstags.relay"
NODE="$(command -v node)"

[ -f "$REPO/.ingest-token.local" ] || { echo "Missing $REPO/.ingest-token.local"; exit 1; }

mkdir -p "$DEST"
cp "$REPO/relay/relay-local.mjs" "$DEST/"
(umask 077; cp "$REPO/.ingest-token.local" "$DEST/token")

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DEST/relay-local.mjs</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>21</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/stags-relay.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/stags-relay.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed. First run is happening now (~2 min). Log: ~/Library/Logs/stags-relay.log"
