# 交付变更记录 (Changelog)

- **2026-03-22**: 梳理项目规范，输出完整的 `project-tracker.md` 交付追踪表。
- **2026-03-22**: 完成 Phase 1 基础设施搭建，完成 Phase 2 侧边栏基础 UI，完成 Phase 3 信令结构雏形。
- **2026-03-24**: 完成主界面控制条改版为中置布局，并同步更新 `channel-prd.md`、`desktop-app-design.md`、`test-strategy.md` 与 HTML 原型。
- **2026-03-24**: 完成中置控制条麦克风能力补齐（闭麦+输入音量）并同步更新 `channel-prd.md`、`audio-routing.md`、`test-strategy.md` 与 HTML 原型。
- **2026-03-24**: 完成 Discovery Service 首版（Code 映射注册/查询/删除），并同步更新 `signaling-webrtc.md` 与 `test-host-runtime.md`。
- **2026-03-24**: 在纯无云约束下完成房主本地服务端口监听首版，并补充无云发现约束与测试定义。
- **2026-03-24**: 完成 RoomState 内存管理首版实现（成员去重、离开清理、连接状态更新）并同步 Host Runtime 设计与测试清单。
- **2026-03-24**: 完成 HostAuthGate 首版实现（房间码格式校验、大小写归一化比对、黑名单拦截）并同步技术与测试文档。
- **2026-03-26**: 完成 RoomBroadcastBuilder 首版实现，统一 `ROOM_STATE`、`MEMBER_JOINED`、`MEMBER_LEFT` 的消息载荷结构。
- **2026-03-26**: 完成 WebRtcRelayRouter 首版实现，支持 Offer / Answer / ICE 靶向透传与非法路由拦截。
- **2026-03-26**: 完成交付文档重构，新增 `06-delivery/README.md`，并将迭代记录从 `project-tracker.md` 拆分至独立 `changelog.md`。
- **2026-03-26**: 完成设置面板本地设备采集首版（`getUserMedia` 麦克风采集、输入输出设备枚举、`devicechange` 监听）。
- **2026-03-26**: 新增仓库根 `README.md` 作为项目总入口，补充架构、目录、开发命令与安装打包预留说明。
- **2026-03-26**: 完成音频控制引擎骨架（远端流绑定、音量调节、本地屏蔽、房主闭麦轨道控制）与对应单元测试。
- **2026-03-26**: 完成 Relay Fallback 策略骨架（ICE failed/timeout 自动降级、closed 清理）与对应测试。
- **2026-03-26**: 完成可靠 DataChannel 通道骨架（ordered/protocol 参数、open 状态发送门禁、显式关闭接口）与对应测试。
