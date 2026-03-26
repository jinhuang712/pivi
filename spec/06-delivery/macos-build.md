# macOS 打包交付说明（Phase 6.1）

## 1. 目标产物

- `.app`：本地可运行应用包
- `.dmg`：用于分发的安装镜像

## 2. 构建前置

- Node.js 与 npm 可用
- Rust / Cargo 可用
- Xcode Command Line Tools 可用（`xcode-select --install`）

## 3. 构建命令

- 安装依赖：`npm install`
- 前端构建：`npm run build`
- macOS 打包：`npm run tauri:build:macos`

## 4. 产物路径

- 打包结果位于 `src-tauri/target/release/bundle/`
- 常见路径：
  - `src-tauri/target/release/bundle/macos/*.app`
  - `src-tauri/target/release/bundle/macos/*.dmg`（当前构建链路产物）
  - `src-tauri/target/release/bundle/dmg/`（DMG 脚本与中间产物）

## 5. 失败排查

- 若出现签名相关错误，优先使用未签名本地包验证功能链路，再补充证书签名流程。
- 若出现工具链错误，优先检查 `cargo --version` 与 `xcode-select -p`。
- 若命令末尾提示 `bundle_dmg.sh` 非零退出，但 `bundle/macos` 下已存在 `.dmg`，可先将该构建结果作为本地分发包验证。
