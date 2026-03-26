# Local Voice Chat

Local Voice Chat 是一个面向电竞开黑场景的桌面语音应用项目，目标是以 **Tauri + React + Rust** 实现低资源占用、本地优先、可逐步演进到跨网络可用的语音协作体验。

当前项目采用「**Spec 驱动开发**」模式，产品、架构、技术、测试、交付都在 `spec/` 下维护，并与代码实现同步推进。

## 当前状态

- 前端 UI 原型与核心交互：已完成主要页面和组件
- Host Runtime 基础能力（Phase 3）：已完成（信令结构、发现映射、监听、房态、鉴权、广播）
- WebRTC 协商骨架（Phase 4.1）：已完成（Offer/Answer/ICE 透传路由）
- 本地设备采集（Phase 4.2）：进行中（设置页采集与设备同步已接入）

详细进度请查看：
- [spec/06-delivery/project-tracker.md](./spec/06-delivery/project-tracker.md)
- [spec/06-delivery/changelog.md](./spec/06-delivery/changelog.md)

## 技术架构（简版）

- **桌面容器**：Tauri v2
- **前端**：React 19 + TypeScript + TailwindCSS v4
- **后端运行时**：Rust（Host Runtime / 信令与状态管理）
- **实时通信方向**：
  - 控制面：WebSocket 信令
  - 媒体面：WebRTC（P2P Mesh 优先）

核心 Rust 模块：
- `src-tauri/src/signaling.rs`：信令消息定义
- `src-tauri/src/discovery.rs`：6 位码发现映射
- `src-tauri/src/ws_server.rs`：本地监听能力
- `src-tauri/src/room_state.rs`：房间内存状态
- `src-tauri/src/auth.rs`：鉴权与黑名单门禁
- `src-tauri/src/room_broadcast.rs`：房态广播消息构建
- `src-tauri/src/webrtc_router.rs`：WebRTC 协商信令透传路由

## 目录结构

- `src/`：React 前端页面与组件
- `src/__tests__/`：前端单元测试（Vitest + RTL）
- `src-tauri/`：Tauri 与 Rust 运行时代码
- `spec/`：完整规格体系（产品/架构/技术/测试/交付）

推荐先读：
1. [spec/index.md](./spec/index.md)
2. [spec/06-delivery/project-tracker.md](./spec/06-delivery/project-tracker.md)
3. [spec/08-technical-design/signaling-webrtc.md](./spec/08-technical-design/signaling-webrtc.md)
4. [spec/04-host-runtime/host-runtime-design.md](./spec/04-host-runtime/host-runtime-design.md)

## 开发命令

- 安装依赖
  - `npm install`
- 启动前端开发环境
  - `npm run dev`
- 前端测试
  - `npx vitest run`
- 前端构建
  - `npm run build`

Rust 侧测试命令（环境需安装 Rust/Cargo）：
- `cd src-tauri && cargo test`

## 安装与打包（预留）

当前可用命令：
- macOS 打包（`.app` + `.dmg`）：
  - `npm run tauri:build:macos`

详细交付说明：
- [spec/06-delivery/macos-build.md](./spec/06-delivery/macos-build.md)

后续将在本 README 持续补充：
- Windows 打包流程（`.exe`）
- 常见故障排查与网络连通建议
