#!/usr/bin/env bash
# Build Geminio for this Mac and replace /Applications/Geminio.app in place.
#
# Apple Silicon only, no dmg/zip, no version bump. Three things a plain copy
# gets wrong, and this script exists to get right:
#   1. The user's chosen app icon is a Finder custom icon stored *inside* the
#      bundle (`Icon\r` + the bundle's FinderInfo). Replacing the bundle drops
#      it, so the stock icon shows until the next launch. It is carried over.
#   2. Old copies are moved to the Trash, never deleted.
#   3. Launch Services remembers every copy it has seen (build output, Trash),
#      which shows up as duplicate apps. All but the installed one are
#      unregistered.
set -euo pipefail

APP="/Applications/Geminio.app"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILT="$ROOT/dist/mac-arm64/Geminio.app"
LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
ICON=$'Icon\r'
STAMP="$(date +%Y%m%d-%H%M%S)"

if pgrep -f "$APP/Contents/MacOS/Geminio" >/dev/null; then
  echo "Geminio is running. Quit it first, then run this again." >&2
  exit 1
fi

cd "$ROOT"
rm -rf "$ROOT/dist/mac-arm64"
npm run build
npx electron-builder --mac --arm64 --dir
rm -f "$ROOT/dist/builder-debug.yml"
# The build regenerates this with unrelated churn; keep the tree clean.
git checkout -- src/renderer/src/licenses.generated.json 2>/dev/null || true

[ -d "$BUILT" ] || { echo "Build output missing: $BUILT" >&2; exit 1; }
[ "$(lipo -archs "$BUILT/Contents/MacOS/Geminio")" = "arm64" ] || { echo "Expected an arm64-only build" >&2; exit 1; }

# 1. Carry the custom icon into the new bundle before the old one leaves.
if [ -d "$APP" ] && [ -e "$APP/$ICON" ]; then
  ditto "$APP/$ICON" "$BUILT/$ICON"
  if info="$(xattr -px com.apple.FinderInfo "$APP" 2>/dev/null)"; then
    xattr -wx com.apple.FinderInfo "$info" "$BUILT"
  fi
  echo "Kept the custom app icon."
fi

# 2. Swap. The previous copy goes to the Trash, as does the build output once copied.
if [ -d "$APP" ]; then mv "$APP" "$HOME/.Trash/Geminio-previous-$STAMP.app"; fi
ditto "$BUILT" "$APP"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
mv "$BUILT" "$HOME/.Trash/Geminio-build-$STAMP.app"
rmdir "$ROOT/dist/mac-arm64" 2>/dev/null || true

# 3. One registered copy only. Paths come from the registry itself: the Trash
#    cannot be listed without Full Disk Access.
"$LSREG" -dump 2>/dev/null \
  | sed -nE 's/^path: +(.*Geminio[^/]*\.app) \(0x[0-9a-f]+\)$/\1/p' \
  | sort -u \
  | while IFS= read -r path; do
      [ "$path" = "$APP" ] || "$LSREG" -u "$path" 2>/dev/null || true
    done
"$LSREG" -f "$APP"
touch "$APP"

echo "Installed $APP ($(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString), arm64)."
[ -e "$APP/$ICON" ] && echo "Custom icon present." || echo "No custom icon yet — the app saves it on next launch."
