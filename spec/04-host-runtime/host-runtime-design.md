# 房主运行时设计（Host Runtime）

## 角色定位

房主运行时是频道控制节点，负责房间生命周期、成员管理与媒体中转兜底。

## 核心职责

- 房间创建、销毁与状态持有
- 生成统一 16 位自描述邀请码
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
- **邀请码生成**：在监听与入口自检通过后，基于 `IPv4 + Port + Scope + TTL + Checksum` 生成统一 16 位邀请码。
- **启动稳态**：在 UI 展示邀请码前完成端口监听、最优入口选择、可达性探测与邀请码签发。
- **内存与 CPU 约束**：房主作为“服务器”，需保证在游戏（如高负载 3A 大作）运行时不抢占过多资源，最高 CPU 占用应控制在单核的 10% 以内。

## 数据结构（概念）

- Room：roomId、hostId、createdAt、policy
- Member：memberId(UUID)、displayName、joinAt、role、connState
- Session：peerId、mode(P2P/Relay)、latency、lossRate
- BlacklistEntry：blockedMemberId、blockedAt、reason

## 房间生命周期状态管理（Phase 3.4）

- Runtime 在内存中持有 `RoomState`，由 `roomId`、`hostId`、`createdAt` 与 `members` 构成。
- 房主创建房间时自动写入 Host 成员状态（role=Host, connState=Connected）。
- 成员加入时执行去重检查，重复 UUID 直接拒绝并返回冲突错误。
- 成员离开时从 `members` 映射移除；房主离开必须通过后续“房主迁移”流程，不允许直接删除 Host。
- 连接状态变更（Connected/Disconnected）在内存中即时更新，为后续广播与超时清理提供基础状态。

## 鉴权与安全拦截（Phase 3.5）

- Runtime 维护 `HostAuthGate`，在 `JOIN_ROOM` 首次消息阶段执行准入判定。
- 准入规则按顺序执行：邀请码格式校验 -> 邀请码解码校验 -> 黑名单拦截。
- 统一邀请码采用 `16位 Base32 + Scope + TTL + Checksum` 约束，解码成功后再进入连接准入阶段。
- 黑名单命中时拒绝加入，不进入房间状态映射。
- 运行时支持黑名单的新增与移除操作，以便后续接入房主管理面板。

## 状态广播机制（Phase 3.6）

- Runtime 基于 `RoomState` 构建并下发三类标准广播消息：
  - `ROOM_STATE`：新成员加入后回包完整成员快照。
  - `MEMBER_JOINED`：向房间内其他成员广播新成员快照。
  - `MEMBER_LEFT`：成员离开后广播离开成员 ID。
- 广播载荷中的成员状态统一输出为字符串枚举（`Host/Member`, `Connected/Disconnected`），确保跨端反序列化一致性。

## WebRTC 协商透传骨架（Phase 4.1）

- Runtime 提供 `WebRtcRelayRouter`，仅负责透传 `OFFER` / `ANSWER` / `ICE_CANDIDATE`。
- 透传前执行准入校验：
  - `from` 必须在房间内。
  - `target` 必须在房间内。
  - `from` 与 `target` 不能相同。
- 透传层不改写 SDP/Candidate 内容，仅做路由判定与转发目标确认。

## 房主移交状态机骨架（Phase 5.4）

- Runtime 维护 `HostMigrationMachine`，核心状态：
  - `Normal`
  - `MigrationInitiated`
  - `BroadcastNewHost`
  - `Reconnecting`
  - `Failed`
- 正常流程：`initiate_migration -> runtime_ready -> broadcast_migrate -> reconnect_completed`。
- 超时策略：在 `MigrationInitiated` 阶段若超过迁移超时阈值（默认 5 秒）未收到就绪，进入 `Failed` 并标记 `TARGET_RUNTIME_TIMEOUT`。
- 状态机仅负责状态推进与非法流转拦截，不直接处理网络 I/O。

## 可靠性策略

- 心跳间隔与超时踢出
- 信令重试与幂等处理
- 中转压力过高时限流与降级
- 房主关闭房间前触发二次确认并广播关闭事件
- 监听端口复用与历史成功端口优先
- 邀请码 TTL 与入口健康状态联动刷新

## 观测指标

- 在线成员数
- 会话建立成功率
- 平均协商时长
- 中转比例（Relay Ratio）
- 房主 CPU 与带宽占用
