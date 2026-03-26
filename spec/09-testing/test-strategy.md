# TDD 测试策略总览 (Test Strategy)

为了支持测试驱动开发 (Test-Driven Development, TDD)，我们将整个项目的测试用例按领域划分为独立的文档。

在编写任何业务代码之前，开发人员应首先阅读并实现对应模块的测试用例。测试框架推荐使用 `Vitest` 或 `Jest`（针对前端逻辑与 Node.js/Rust Runtime）以及 `Playwright`（针对端到端与 WebRTC 模拟测试）。

---

## 1. 测试分层原则

1. **单元测试 (Unit Tests)**：
   - 聚焦纯函数与状态机（如分片算法、状态更新 Reducer、黑名单校验逻辑）。
   - 必须达到 90% 以上覆盖率。
2. **集成测试 (Integration Tests)**：
   - 验证客户端与 Host Runtime 的 WebSocket 握手、SDP 交换链路。
   - 需要 Mock 原生的 `RTCPeerConnection` 与 `WebSocket` 对象。
3. **端到端测试 (E2E Tests)**：
   - 重点验证核心用户旅程（建房 -> 进房 -> 发言 -> 发图片 -> 移交房主）。

---

## 2. 测试用例详细设计 (子文档)

请点击以下链接查看每个核心模块的详细测试用例与验收标准：

### 🛠️ [1. 房主运行时 (Host Runtime) 测试用例](./test-host-runtime.md)
- WebSocket 鉴权与黑名单拦截。
- 房间状态同步与成员管理。
- RoomState 内存生命周期状态维护（加入/离开/连接态）。
- ROOM_STATE / MEMBER_JOINED / MEMBER_LEFT 广播消息构建与载荷一致性。
- WebRTC Offer / Answer / ICE 靶向透传路由与非法目标拦截。
- 房主热迁移 (Host Migration) 状态机。
- 纯无云场景下的本地发现映射与端口监听能力。

### 🎛️ [2. 客户端媒体流与音频控制测试用例](./test-media-routing.md)
- Web Audio API `GainNode` 路由与本地音量调节。
- 本地屏蔽 (Local Mute) 与房主全局闭麦 (Host Mute) 逻辑。
- 麦克风/扬声器设备切换与 VAD/PTT 模式切换。
- 频道主页中置控制条的交互测试（共享状态切换、麦克风开关、麦克风音量滑杆、扬声器开关、扬声器音量滑杆、设置入口触发）。

### 🖼️ [3. DataChannel 与大文件分片测试用例](./test-datachannel.md)
- 大图片 (5MB) 的二进制分片 (Chunking) 算法。
- 接收端的 ArrayBuffer 拼接与 Blob 生成。
- 超大文件拦截与并发控制边界测试。
