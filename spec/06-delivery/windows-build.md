# Windows 打包交付说明（Phase 6.2）

## 1. 目标产物

- `.exe`（NSIS 安装包）
- `.msi`（Windows Installer）

## 2. 构建前置

- Windows 10/11 构建环境
- Node.js 与 npm 可用
- Rust / Cargo 可用
- Visual Studio C++ Build Tools 可用

## 3. 构建命令

- 安装依赖：`npm install`
- 前端构建：`npm run build`
- Windows 打包：`npm run tauri:build:windows`

## 4. 产物路径

- 打包结果位于 `src-tauri/target/release/bundle/`
- 常见路径：
  - `src-tauri/target/release/bundle/nsis/*.exe`
  - `src-tauri/target/release/bundle/msi/*.msi`

## 5. CI 建议

- 使用 Windows Runner 执行打包命令。
- 构建产物以 artifacts 形式上传，供测试与发布流程复用。
