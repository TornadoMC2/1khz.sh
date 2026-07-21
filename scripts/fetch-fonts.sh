#!/usr/bin/env bash
#
# fetch-fonts.sh — regenerate the self-hosted fonts in assets/fonts/.
#
# The site pulls no fonts from Google at runtime (no third-party requests,
# nothing about a visitor leaks). Instead we vendor the *latin subset* woff2
# of each weight we use. This script rebuilds those files from Google Fonts;
# run it if you change weights or want to refresh the files.
#
#   npm run fonts        # or: bash scripts/fetch-fonts.sh
#
# Fonts are OFL-licensed (Barlow Semi Condensed, IBM Plex Mono) — see LICENSE.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p assets/fonts

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

# family (URL-encoded) | weight | output filename
grab() {
  local family="$1" weight="$2" out="$3" css url
  css=$(curl -fsS -A "$UA" "https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap")
  # Pull the woff2 URL from the /* latin */ @font-face block only.
  url=$(printf '%s\n' "$css" | awk '
    /\/\* latin \*\// { inlatin = 1 }
    /\/\* / && !/\/\* latin \*\// { inlatin = 0 }
    inlatin && /src:/ { match($0, /url\(([^)]*)\)/, a); print a[1]; exit }')
  [ -n "$url" ] || { echo "!! no latin URL for ${family} ${weight}" >&2; return 1; }
  curl -fsS -A "$UA" -o "assets/fonts/${out}" "$url"
  echo "  ${out}  ($(wc -c < "assets/fonts/${out}") bytes)"
}

echo "Fetching latin-subset woff2 into assets/fonts/ …"
grab "Barlow+Semi+Condensed" 500 "barlow-sc-500.woff2"
grab "Barlow+Semi+Condensed" 600 "barlow-sc-600.woff2"
grab "Barlow+Semi+Condensed" 700 "barlow-sc-700.woff2"
grab "IBM+Plex+Mono"         400 "ibm-plex-mono-400.woff2"
grab "IBM+Plex+Mono"         500 "ibm-plex-mono-500.woff2"
grab "IBM+Plex+Mono"         600 "ibm-plex-mono-600.woff2"
echo "Done."
