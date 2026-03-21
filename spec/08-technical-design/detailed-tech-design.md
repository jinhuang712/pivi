# 详细技术方案设计 (Technical Design) - 大纲总览

本文档是 Local Voice Chat 底层工程实现的**技术方案主入口**。为了保证方案的深度与可读性，各个核心复杂模块已拆分至独立的详细设计子文档中。

---

## 1. 核心技术栈与进程模型

- **客户端 (UI + WebRTC)**：
  - **框架**：Tauri (Rust) 或 Electron (Node.js)。优先推荐 Tauri 以满足“电竞开黑极低内存/CPU占用”的需求。
  - **前端**：React + TypeScript + Zustand (全局状态管理)。
  - **媒体栈**：浏览器原生 `RTCPeerConnection`, `AudioContext`。
- **房主运行时 (Host Runtime)**：
  - **运行机制**：与客户端 UI 进程严格隔离的**独立 Worker / Sidecar 进程**，避免 UI 线程卡顿导致信令或转发延迟。
  - **职责**：维护 WebSocket 信令服务，广播成员状态，并作为 TURN/Relay 兜底节点。
  - **端口映射**：使用 `nat-pmp` 或 `upnp` 库自动向家用路由器请求开放映射端口。

---

## 2. 核心模块详细设计 (子文档)

请点击以下链接查看每个核心子系统的详细底层流转逻辑、状态机与时序图：

### 📡 [1. 信令与 WebRTC 会话建立协议](./signaling-webrtc.md)
**覆盖内容**：
- WebSocket 连接握手与鉴权。
- 房间状态同步 (Room State Sync)。
- 基于 Mesh 拓扑的 SDP Offer/Answer 交换与 ICE 穿透时序图。

### 🎛️ [2. 音频路由与多层级控制引擎](./audio-routing.md)
**覆盖内容**：
- Web Audio API `AudioContext` 拓扑图。
- 解决本地独立音量调节的 `GainNode` 映射策略。
- “本地屏蔽”与“房主全局强制闭麦”在实现层面的本质区别。

### 🖼️ [3. 基于 DataChannel 的大文件/图片分片传输](./datachannel-transfer.md)
**覆盖内容**：
- 为什么必须使用 DataChannel 传输图片（防止信令阻塞）。
- 超过 16KB/64KB 限制时的二进制 Chunking（分片）算法。
- 接收端 ArrayBuffer 重组与 Blob 渲染时序。

### 🔄 [4. 房主热迁移与安全边界防御](./host-migration-security.md)
**覆盖内容**：
- 无云架构下的难点：房主迁移状态机（Host Migration State Machine）。
- 权限移交引发的“新进程拉起 -> 广播新地址 -> 全员断线重连”的平滑过渡机制。
- WebSocket 连接频控（Rate Limiting）与基于 UUID 的黑名单在握手层的拦截逻辑。