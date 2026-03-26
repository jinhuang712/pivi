# Local Voice Chat 技术设计总览（大纲版）

本目录用于沉淀「PC/macOS 电竞开黑语音软件」的技术设计，目标是先完成可落地的 MVP，再逐步演进稳定性与公网可用性。

## 🎯 核心入口：进度追踪

所有的开发工作均依据以下交付清单进行核对与进度更新：
👉 **[项目交付追踪表 (Project Tracker)](./06-delivery/project-tracker.md)** 👈

---

## 文档结构

- **00-overview/**: 产品目标与边界约束
  - [product-goals.md](./00-overview/product-goals.md)
  - [constraints-non-goals.md](./00-overview/constraints-non-goals.md)
- **01-architecture/**: 系统架构与网络策略
  - [system-architecture.md](./01-architecture/system-architecture.md)
  - [networking-nat-strategy.md](./01-architecture/networking-nat-strategy.md)
- **02-realtime-media/**: WebRTC 媒体流与屏幕共享设计
  - [webrtc-media-design.md](./02-realtime-media/webrtc-media-design.md)
- **03-client/**: 桌面客户端设计
  - [desktop-app-design.md](./03-client/desktop-app-design.md)
- **04-host-runtime/**: 房主运行时设计
  - [host-runtime-design.md](./04-host-runtime/host-runtime-design.md)
- **05-security/**: 安全与权限模型
  - [security-model.md](./05-security/security-model.md)
- **06-delivery/**: 里程碑与进度追踪
  - [project-tracker.md](./06-delivery/project-tracker.md) （唯一进度基准）
  - [changelog.md](./06-delivery/changelog.md)
  - [roadmap-mvp.md](./06-delivery/roadmap-mvp.md)
- **07-product-design/**: 产品详细设计与 UI 示意（包含 HTML Demo）
  - [detailed-prd.md](./07-product-design/detailed-prd.md)
- **08-technical-design/**: 详细技术方案与底层实现设计
  - [detailed-tech-design.md](./08-technical-design/detailed-tech-design.md)
  - [hotkeys-global.md](./08-technical-design/hotkeys-global.md)
- **09-testing/**: TDD 测试策略与用例定义
  - [test-strategy.md](./09-testing/test-strategy.md)
  - [test-hotkeys.md](./09-testing/test-hotkeys.md)

## 阅读顺序建议

1. `00-overview`：先看产品目标与边界
2. `01-architecture`：确定核心架构与网络连通策略
3. `02-realtime-media`：理解语音链路与媒体参数
4. `03-client` + `04-host-runtime`：拆分客户端与房主节点职责
5. `05-security`：定义最小可用的安全基线
6. `06-delivery`：按里程碑推进落地
7. `07-product-design`：结合界面 Demo 梳理最终用户交互体验
8. `08-technical-design`：研发开工前的底层技术时序图与状态机指导
9. `09-testing`：TDD 驱动开发的测试用例与验收标准

## 当前设计前提

- 不部署业务云后端
- 房主机器承担频道主控与必要中转
- 优先支持局域网与可端口映射场景
- 公网复杂 NAT 作为第二阶段增强项
