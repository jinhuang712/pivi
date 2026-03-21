# 房主运行时设计（Host Runtime）

## 角色定位

房主运行时是频道控制节点，负责房间生命周期、成员管理与媒体中转兜底。

## 核心职责

- 房间创建、销毁与状态持有
- 成员鉴权（口令/token）、权限管理与黑名单拦截
- 房主权限移交协调（通知新房主节点启动，并广播全体重连）
- 信令中继（Offer/Answer/ICE）
- 媒体转发（仅在 P2P 失败时）
- 房间消息（文本/图片）广播与顺序同步
- 屏幕共享流会话协调与状态广播
- 心跳检测与成员超时剔除

## 运行模型与性能隔离

- **独立子进程**：必须与客户端 UI 渲染进程严格隔离，建议以 Node.js 独立 worker 进程或直接采用 Rust sidecar/Tauri 架构运行，避免 UI 卡顿影响媒体转发。
- **自动端口映射**：启动时自动执行 UPnP/NAT-PMP 映射，将协商的 UDP/TCP 端口暴露至公网。
- **网络监听**：使用单独端口监听控制面连接（信令/消息），及一组 UDP 端口池用于媒体中继。
- **内存与 CPU 约束**：房主作为“服务器”，需保证在游戏（如高负载 3A 大作）运行时不抢占过多资源，最高 CPU 占用应控制在单核的 10% 以内。

## 数据结构（概念）

- Room：roomId、hostId、createdAt、policy
- Member：memberId(UUID)、displayName、joinAt、role、connState
- Session：peerId、mode(P2P/Relay)、latency、lossRate
- BlacklistEntry：blockedMemberId、blockedAt、reason

## 可靠性策略

- 心跳间隔与超时踢出
- 信令重试与幂等处理
- 中转压力过高时限流与降级
- 房主关闭房间前触发二次确认并广播关闭事件

## 观测指标

- 在线成员数
- 会话建立成功率
- 平均协商时长
- 中转比例（Relay Ratio）
- 房主 CPU 与带宽占用
