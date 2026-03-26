#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

export PATH="$HOME/.cargo/bin:$PATH"

VERSION="$(node -p "require('./package.json').version")"
WINDOWS_PORTABLE_SOURCE_NAME="$(awk -F ' *= *' '/^name = / {gsub(/"/, "", $2); print $2 ".exe"; exit}' "$ROOT_DIR/src-tauri/Cargo.toml")"
DIST_DIR="$ROOT_DIR/release-share"
WINDOWS_TMP_DIR="$DIST_DIR/.windows-tmp"
BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"
WINDOWS_TARGET_DIR="$ROOT_DIR/src-tauri/target/release"
TARGET="${1:-auto}"
WINDOWS_WORKFLOW="${PIVI_WINDOWS_WORKFLOW:-windows-build.yml}"
WINDOWS_RUN_ID="${PIVI_WINDOWS_RUN_ID:-}"
WINDOWS_POLL_SECONDS="${PIVI_WINDOWS_POLL_SECONDS:-10}"
DID_LOCAL_MACOS_BUILD=0
DID_LOCAL_WINDOWS_BUILD=0

mkdir -p "$DIST_DIR"

log() {
  printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >&2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    log "缺少命令：$1"
    exit 1
  }
}

is_macos() {
  [[ "$OSTYPE" == darwin* ]]
}

is_windows() {
  [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* || "$OSTYPE" == win32* ]]
}

build_macos() {
  DID_LOCAL_MACOS_BUILD=1
  log "开始构建 macOS 安装包 (.app/.dmg)"
  npm run tauri:build:macos || true
}

build_windows_local() {
  DID_LOCAL_WINDOWS_BUILD=1
  log "开始本地构建 Windows 安装包与便携版 exe"
  npm run tauri:build:windows
}

collect_latest() {
  local pattern="$1"
  find "$BUNDLE_DIR" -type f -name "$pattern" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -n 1
}

collect_windows_portable_local() {
  find "$WINDOWS_TARGET_DIR" -maxdepth 1 -type f -name "$WINDOWS_PORTABLE_SOURCE_NAME" 2>/dev/null | head -n 1
}

resolve_repo() {
  gh repo view --json nameWithOwner --jq '.nameWithOwner'
}

resolve_default_branch() {
  gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
}

resolve_windows_ref() {
  local current_branch
  local default_branch

  current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  default_branch="$(resolve_default_branch)"

  if [[ -n "${PIVI_WINDOWS_REF:-}" ]]; then
    printf '%s' "$PIVI_WINDOWS_REF"
    return
  fi

  if [[ -n "$current_branch" ]] && git ls-remote --exit-code --heads origin "$current_branch" >/dev/null 2>&1; then
    printf '%s' "$current_branch"
    return
  fi

  printf '%s' "$default_branch"
}

warn_remote_windows_scope() {
  local ref="$1"
  local current_branch
  local tracking_branch
  local divergence
  local ahead_count

  current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

  if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
    log "检测到本地未提交改动，远程 Windows 构建不会包含这些改动。"
  fi

  tracking_branch="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
  if [[ -n "$tracking_branch" ]]; then
    divergence="$(git rev-list --left-right --count "${tracking_branch}...HEAD" 2>/dev/null || echo '0 0')"
    ahead_count="$(printf '%s' "$divergence" | awk '{print $2}')"
    if [[ "${ahead_count:-0}" != "0" ]]; then
      log "检测到本地有 ${ahead_count} 个未推送提交，远程 Windows 构建使用的是远程分支版本。"
    fi
  fi

  if [[ -n "$current_branch" && "$ref" != "$current_branch" ]]; then
    log "当前将使用远程分支 $ref 触发 Windows 构建。"
  fi
}

start_windows_remote_build() {
  local ref
  local run_id
  local run_url

  require_command gh

  ref="$(resolve_windows_ref)"

  log "开始触发远程 Windows 构建"
  log "目标仓库：$(resolve_repo)"
  log "目标分支：$ref"
  warn_remote_windows_scope "$ref"

  gh workflow run "$WINDOWS_WORKFLOW" --ref "$ref" >/dev/null
  sleep 3

  run_id="$(gh run list --workflow "$WINDOWS_WORKFLOW" --branch "$ref" --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId')"
  run_url="$(gh run view "$run_id" --json url --jq '.url')"

  log "已触发 Windows 工作流，Run ID：$run_id"
  log "工作流地址：$run_url"

  printf '%s' "$run_id"
}

wait_for_windows_run() {
  local run_id="$1"
  local status=""
  local conclusion=""
  local step=""
  local snapshot=""
  local last_snapshot=""
  local run_url=""

  run_url="$(gh run view "$run_id" --json url --jq '.url')"
  log "开始轮询 Windows 构建进度"

  while true; do
    status="$(gh run view "$run_id" --json status --jq '.status')"
    conclusion="$(gh run view "$run_id" --json conclusion --jq '.conclusion // ""')"
    step="$(gh run view "$run_id" --json jobs --jq '.jobs[]?.steps[]? | select(.status=="in_progress") | .name' | head -n 1 || true)"

    if [[ -z "$step" && "$status" != "completed" ]]; then
      step="$(gh run view "$run_id" --json jobs --jq '.jobs[]?.steps[]? | select(.status=="completed") | .name' | tail -n 1 || true)"
      if [[ -n "$step" ]]; then
        step="等待下一步（最近完成：$step）"
      fi
    fi

    snapshot="${status}|${conclusion}|${step}"
    if [[ "$snapshot" != "$last_snapshot" ]]; then
      if [[ -n "$step" ]]; then
        log "Windows 构建状态：$status ${conclusion:+($conclusion)} | 当前步骤：$step"
      else
        log "Windows 构建状态：$status ${conclusion:+($conclusion)}"
      fi
      last_snapshot="$snapshot"
    fi

    if [[ "$status" == "completed" ]]; then
      if [[ "$conclusion" != "success" ]]; then
        log "Windows 构建失败，请查看：$run_url"
        exit 1
      fi
      log "Windows 构建完成"
      break
    fi

    sleep "$WINDOWS_POLL_SECONDS"
  done
}

download_windows_remote_artifacts() {
  local run_id="$1"
  local repo
  local artifact_id
  local artifact_size
  local zip_file
  local unpack_dir
  local exe_source
  local msi_source
  local portable_exe_source
  local exe_target_root
  local msi_target_root
  local portable_exe_target_root

  require_command curl
  require_command unzip

  repo="$(resolve_repo)"
  artifact_id="$(gh api "repos/$repo/actions/runs/$run_id/artifacts" --jq '.artifacts[] | select(.name=="windows-bundles" and .expired==false) | .id' | head -n 1)"
  artifact_size="$(gh api "repos/$repo/actions/runs/$run_id/artifacts" --jq '.artifacts[] | select(.name=="windows-bundles" and .expired==false) | .size_in_bytes' | head -n 1)"

  if [[ -z "$artifact_id" ]]; then
    log "未找到 windows-bundles artifact"
    exit 1
  fi

  rm -rf "$WINDOWS_TMP_DIR"
  mkdir -p "$WINDOWS_TMP_DIR"

  zip_file="$WINDOWS_TMP_DIR/windows-bundles.zip"
  unpack_dir="$WINDOWS_TMP_DIR/unpacked"

  log "开始下载 Windows artifact（${artifact_size:-unknown} bytes）"
  curl -L --progress-bar \
    -H "Authorization: Bearer $(gh auth token)" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo/actions/artifacts/$artifact_id/zip" \
    -o "$zip_file"

  log "下载完成，开始解压"
  unzip -o "$zip_file" -d "$unpack_dir" >/dev/null

  exe_source="$(find "$unpack_dir" -type f -path '*/bundle/nsis/*.exe' | head -n 1 || true)"
  msi_source="$(find "$unpack_dir" -type f -name '*.msi' | head -n 1 || true)"
  portable_exe_source="$(find "$unpack_dir" -type f -name "$WINDOWS_PORTABLE_SOURCE_NAME" ! -path '*/bundle/*' | head -n 1 || true)"

  exe_target_root="$DIST_DIR/Pivi-${VERSION}-windows.exe"
  msi_target_root="$DIST_DIR/Pivi-${VERSION}-windows.msi"
  portable_exe_target_root="$DIST_DIR/Pivi-${VERSION}-windows-portable.exe"

  if [[ -n "$exe_source" ]]; then
    cp -f "$exe_source" "$exe_target_root"
    log "EXE：$exe_target_root"
  else
    log "EXE：未找到"
  fi

  if [[ -n "$msi_source" ]]; then
    cp -f "$msi_source" "$msi_target_root"
    log "MSI：$msi_target_root"
  else
    log "MSI：未找到"
  fi

  if [[ -n "$portable_exe_source" ]]; then
    cp -f "$portable_exe_source" "$portable_exe_target_root"
    log "便携版 EXE：$portable_exe_target_root"
  else
    log "便携版 EXE：未找到"
  fi

  rm -rf "$WINDOWS_TMP_DIR"
  log "Windows 产物目录：$DIST_DIR"
}

build_windows_remote() {
  local run_id="$WINDOWS_RUN_ID"

  require_command gh

  if [[ -n "$run_id" ]]; then
    log "使用指定的 Windows Run ID：$run_id"
  else
    run_id="$(start_windows_remote_build)"
  fi

  wait_for_windows_run "$run_id"
  download_windows_remote_artifacts "$run_id"
}

copy_local_outputs() {
  local dmg_file
  local exe_file
  local msi_file
  local portable_exe_file

  dmg_file="$(collect_latest '*.dmg' || true)"
  exe_file="$(collect_latest '*.exe' || true)"
  msi_file="$(collect_latest '*.msi' || true)"
  portable_exe_file="$(collect_windows_portable_local || true)"

  if [[ "$DID_LOCAL_MACOS_BUILD" == "1" && -n "${dmg_file:-}" ]]; then
    cp -f "$dmg_file" "$DIST_DIR/Pivi-${VERSION}-macos.dmg"
    log "DMG：$DIST_DIR/Pivi-${VERSION}-macos.dmg"
  elif [[ "$DID_LOCAL_MACOS_BUILD" == "1" ]]; then
    log "DMG：未找到"
  fi

  if [[ "$DID_LOCAL_WINDOWS_BUILD" == "1" && -n "${exe_file:-}" ]]; then
    cp -f "$exe_file" "$DIST_DIR/Pivi-${VERSION}-windows.exe"
    log "EXE：$DIST_DIR/Pivi-${VERSION}-windows.exe"
  elif [[ "$DID_LOCAL_WINDOWS_BUILD" == "1" ]]; then
    log "EXE：未找到"
  fi

  if [[ "$DID_LOCAL_WINDOWS_BUILD" == "1" && -n "${msi_file:-}" ]]; then
    cp -f "$msi_file" "$DIST_DIR/Pivi-${VERSION}-windows.msi"
    log "MSI：$DIST_DIR/Pivi-${VERSION}-windows.msi"
  elif [[ "$DID_LOCAL_WINDOWS_BUILD" == "1" ]]; then
    log "MSI：未找到"
  fi

  if [[ "$DID_LOCAL_WINDOWS_BUILD" == "1" && -n "${portable_exe_file:-}" ]]; then
    cp -f "$portable_exe_file" "$DIST_DIR/Pivi-${VERSION}-windows-portable.exe"
    log "便携版 EXE：$DIST_DIR/Pivi-${VERSION}-windows-portable.exe"
  elif [[ "$DID_LOCAL_WINDOWS_BUILD" == "1" ]]; then
    log "便携版 EXE：未找到"
  fi
}

case "$TARGET" in
  auto)
    if is_macos; then
      build_macos
    elif is_windows; then
      build_windows_local
    else
      log "当前环境不是 macOS 或 Windows，跳过本地构建"
    fi
    ;;
  macos)
    build_macos
    ;;
  windows)
    if is_windows; then
      build_windows_local
    else
      build_windows_remote
    fi
    ;;
  all)
    if is_macos; then
      build_macos
      build_windows_remote
    elif is_windows; then
      build_windows_local
    else
      build_windows_remote
    fi
    ;;
  *)
    log "未知目标：$TARGET，可选值：auto | macos | windows | all"
    exit 1
    ;;
esac

copy_local_outputs

log "分享产物目录：$DIST_DIR"
