#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

export PATH="$HOME/.cargo/bin:$PATH"

VERSION="$(node -p "require('./package.json').version")"
DIST_DIR="$ROOT_DIR/release-share"
BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"

mkdir -p "$DIST_DIR"

build_macos() {
  echo "==> Building macOS bundles (.app/.dmg)"
  npm run tauri:build:macos || true
}

build_windows() {
  echo "==> Building Windows bundles (.exe/.msi)"
  npm run tauri:build:windows
}

collect_latest() {
  local pattern="$1"
  find "$BUNDLE_DIR" -type f -name "$pattern" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -n 1
}

if [[ "$OSTYPE" == darwin* ]]; then
  build_macos
elif [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* || "$OSTYPE" == win32* ]]; then
  build_windows
else
  echo "==> Non-macOS/Windows environment detected, skip build."
fi

DMG_FILE="$(collect_latest '*.dmg' || true)"
EXE_FILE="$(collect_latest '*.exe' || true)"
MSI_FILE="$(collect_latest '*.msi' || true)"

if [[ -n "${DMG_FILE:-}" ]]; then
  DMG_TARGET="$DIST_DIR/Pivi-${VERSION}-macos.dmg"
  cp -f "$DMG_FILE" "$DMG_TARGET"
  echo "DMG: $DMG_TARGET"
else
  echo "DMG: not found"
fi

if [[ -n "${EXE_FILE:-}" ]]; then
  EXE_TARGET="$DIST_DIR/Pivi-${VERSION}-windows.exe"
  cp -f "$EXE_FILE" "$EXE_TARGET"
  echo "EXE: $EXE_TARGET"
else
  echo "EXE: not found (请在 Windows 环境运行本脚本或先执行 CI Windows 构建)"
fi

if [[ -n "${MSI_FILE:-}" ]]; then
  MSI_TARGET="$DIST_DIR/Pivi-${VERSION}-windows.msi"
  cp -f "$MSI_FILE" "$MSI_TARGET"
  echo "MSI: $MSI_TARGET"
fi

echo "==> Share artifacts directory: $DIST_DIR"
