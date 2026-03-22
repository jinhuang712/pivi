# 项目交付追踪表 (Project Delivery Tracker)

> **文档说明**：本文档作为 Local Voice Chat 项目的**唯一进度基准 (Single Source of Truth)**。所有开发工作均依据此 Checklist 进行，并在每次功能交付后实时更新此表。

## 📊 当前进度概览

- **总体进度**：🟢 约 15% 
- **当前阶段**：Phase 2 (前端基础 UI 框架与组件开发)
- **最新交付**：项目骨架初始化、Tauri+Rust 环境搭建、前端 Vitest 测试环境、侧边栏 (Sidebar) 基础组件、Rust 信令基础结构与测试。

---

## 📋 功能点 Checklist (MVP)

### Phase 1: 基础设施与环境搭建 (✅ 100%)
- [x] 1.1 **代码仓库初始化**：Git, `.gitignore`。
- [x] 1.2 **项目骨架**：Tauri v2 + React 19 + TypeScript + TailwindCSS v4。
- [x] 1.3 **前端测试环境**：配置 Vitest + React Testing Library，跑通基础组件测试。
- [x] 1.4 **后端测试环境**：配置 Rust `cargo test`，支持信令结构的序列化/反序列化测试。

### Phase 2: UI 界面与交互原型 (🚧 40%)
- [x] 2.1 **侧边栏 (Sidebar)**：房间头部、成员列表占位、底部本地控制面板 (麦克风/扬声器/设置入口)。
- [ ] 2.2 **6位 Code 验证组件**：6个独立字符输入框，支持自动跳格、大写转换与 `Ctrl+V` 粘贴解析。
- [ ] 2.3 **全局弹窗系统**：
  - [ ] 加入房间的“二次确认”弹窗 (显示房间名与在线人数)。
  - [ ] 设置面板模态框 (包含 Tab 切换逻辑)。
- [ ] 2.4 **设置中心面板**：
  - [ ] 语音与设备 Tab (输入/输出设备选择，VAD/PTT 模式切换)。
  - [ ] 房间设置 Tab (6位 Code 展示与重新生成)。
  - [ ] 封禁与黑名单 Tab (解封操作)。
  - [ ] 移交房主权限 Tab。
- [ ] 2.5 **主交互区 (Main Area)**：
  - [ ] 顶部导航与网络状态指示器 (Ping, P2P/Relay 状态)。
  - [ ] 屏幕共享预览占位区。
  - [ ] 底部聊天框 (Chatbox)，包含 5MB 错误提示气泡。
- [ ] 2.6 **成员列表高级交互**：
  - [ ] 房主与普通成员状态标识 (说话指示灯)。
  - [ ] 悬浮时的本地独立音量滑块与本地屏蔽(🔇)按钮。
  - [ ] 房主右键菜单 (全局闭麦、踢人、封禁)。

### Phase 3: 核心网络与房主运行环境 (Host Runtime) (🚧 10%)
- [x] 3.1 **信令基础结构**：Rust `SignalingMessage` (JoinRoom, LeaveRoom, Mute 等) 及其 Serde 解析。
- [ ] 3.2 **发现服务 (Discovery Service)**：实现 6 位 Code 到具体 IP/Port 的映射与查询逻辑 (初期可使用轻量级云端或 Mock)。
- [ ] 3.3 **WebSocket Server**：房主本地启动 WS 服务，监听指定端口。
- [ ] 3.4 **房间生命周期管理**：成员加入/离开的内存状态维护。
- [ ] 3.5 **鉴权与安全拦截**：6位 Code 校验逻辑与 UUID 黑名单拦截机制。
- [ ] 3.6 **信令广播机制**：`ROOM_STATE`, `MEMBER_JOINED`, `MEMBER_LEFT`, 状态同步广播。

### Phase 4: WebRTC 媒体路由与通信 (Pending 0%)
- [ ] 4.1 **WebRTC 协商核心 (P2P Mesh)**：Offer / Answer / ICE Candidate 的信令透传与连接建立。
- [ ] 4.2 **本地设备采集**：基于浏览器 API 获取麦克风音频流。
- [ ] 4.3 **音频流播放与控制**：
  - [ ] 将远端音频流绑定到 `<audio>` 标签。
  - [ ] 实现本地屏蔽 (Local Mute，音量置 0)。
  - [ ] 实现房主全局闭麦 (Server Mute，拒绝转发及信令通知)。
- [ ] 4.4 **网络降级 (Relay Fallback)**：当 P2P ICE 穿透失败时，自动将媒体流切向房主中转节点。

### Phase 5: 高级功能与产品特性 (Pending 0%)
- [ ] 5.1 **数据通道 (DataChannel)**：建立高可靠的 RTCDataChannel。
- [ ] 5.2 **图文消息发送**：文本广播与图片（<5MB）的二进制 P2P 分发渲染。
- [ ] 5.3 **屏幕共享**：桌面/窗口流的采集与 WebRTC 推流。
- [ ] 5.4 **房主移交 (Host Migration)**：基于信令的状态机流转，全员断线重连至新房主节点。
- [ ] 5.5 **快捷键支持 (Global Hotkeys)**：Tauri 全局 PTT (按键说话) 与静音快捷键绑定。

### Phase 6: 打包与分发 (Pending 0%)
- [ ] 6.1 **macOS 构建**：打包输出 `.dmg` 文件。
- [ ] 6.2 **Windows 构建**：打包输出独立 `.exe` 文件。
- [ ] 6.3 **资源优化**：图标配置，清理无用依赖，确保极低内存占用。

---

## 📈 迭代记录 (Changelog)

- **202x-xx-xx**: 梳理项目规范，输出完整的 `project-tracker.md` 交付追踪表。
- **202x-xx-xx**: 完成 Phase 1 基础设施搭建，完成 Phase 2 侧边栏基础 UI，完成 Phase 3 信令结构雏形。