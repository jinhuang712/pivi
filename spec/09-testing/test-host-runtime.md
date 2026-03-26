# Host Runtime 核心逻辑测试用例 (TDD)

## 1. WebSocket 连接与鉴权模块

### [TC-HR-01] 正常成员加入房间
- **描述**：验证携带正确 16 位邀请码与有效 UUID 的客户端能否成功建立 WS 连接。
- **前置条件**：Host Runtime 已启动，设置口令为 `A9B2K8`。
- **步骤**：
  1. Client A 使用合法邀请码发起 WebSocket 连接并发送 `JOIN_ROOM`。
  2. Client B 使用同一邀请码发起连接并发送 `JOIN_ROOM`。
- **预期结果**：
  - A 和 B 都能收到 WebSocket 成功连接响应。
  - A 收到 `ROOM_STATE` 包含 A 和 B 的信息（若 B 先加入）。
  - B 加入时，A 收到 `MEMBER_JOINED` 广播。

### [TC-HR-02] 非法邀请码拒绝加入
- **描述**：验证携带错误邀请码的连接请求在鉴权阶段被拒绝。
- **前置条件**：Host Runtime 设置口令为 `A9B2K8`。
- **步骤**：
  1. Client C 携带 `B1C2D3` 尝试发送 `JOIN_ROOM`。
- **预期结果**：
  - Host Runtime 返回错误或直接关闭连接（如状态码 4003）。

### [TC-HR-03] 黑名单成员拒绝加入
- **描述**：验证在黑名单中的 UUID 即使邀请码正确也会被拒绝连接。
- **前置条件**：Host Runtime 设置口令为 `A9B2K8`，黑名单 Set 包含 `uuid-evil`。
- **测试步骤**：客户端携带 `A9B2K8` 发起连接，并使用 `uuid-evil` 发送 `JOIN_ROOM`。
- **预期结果**：连接被拒绝，返回错误或断开连接。

### [TC-HR-03A] 邀请码签发与解析
- **描述**：验证 Runtime 能签发 16 位邀请码，并可恢复出与当前监听入口一致的房间端点。
- **测试步骤**：
  1. Runtime 完成监听并准备就绪。
  2. 签发邀请码。
  3. 对邀请码执行解码。
- **预期结果**：
  - 步骤 2：返回长度合法的邀请码。
  - 步骤 3：返回与 Runtime 当前入口一致的房间端点。

### [TC-HR-03B] 房主本地服务端口监听
- **描述**：验证 Host Runtime 能在指定地址端口上完成监听，并在端口冲突时返回错误。
- **测试步骤**：
  1. 在 `127.0.0.1:0` 启动服务监听并记录分配端口。
  2. 在同一端口再次启动第二个监听实例。
- **预期结果**：
  - 步骤 1：监听成功，返回有效端口号。
  - 步骤 2：监听失败并返回端口占用错误。

### [TC-HR-03C] 鉴权门禁顺序与错误类型
- **描述**：验证 JoinRoom 请求在 Runtime 内按固定顺序执行鉴权，并返回正确错误类型。
- **测试步骤**：
  1. 使用非法邀请码（长度错误）发起鉴权。
  2. 使用合法长度但校验错误的邀请码发起鉴权。
  3. 将 `uuid-evil` 加入黑名单后，使用正确邀请码鉴权。
  4. 使用过期的邀请码发起鉴权。
  5. 使用正确邀请码 + 非黑名单 UUID 鉴权。
- **预期结果**：
  - 步骤 1：返回 `InvalidInviteCode`。
  - 步骤 2：返回 `InvalidChecksum`。
  - 步骤 3：返回 `BlacklistedUser`。
  - 步骤 4：返回 `ExpiredInviteCode`。
  - 步骤 5：鉴权通过。

---

## 2. 房间状态与信令转发模块

### [TC-HR-04] 成员加入广播
- **描述**：新成员加入时，现有成员应收到通知。
- **测试步骤**：
  1. A 在房间内。
  2. B 发送 `JOIN_ROOM` 消息。
- **预期结果**：A 的 WebSocket 收到 `{type: "MEMBER_JOINED", payload: {uuid: "uuid-b"}}`。

### [TC-HR-04A] RoomState 内存生命周期维护
- **描述**：验证房间内存状态对加入、离开、重复加入与连接状态更新的处理。
- **测试步骤**：
  1. 创建房间并初始化 Host 成员。
  2. 新成员 `uuid-b` 加入房间。
  3. 再次以 `uuid-b` 重复加入。
  4. 将 `uuid-b` 连接状态更新为 `Disconnected`。
  5. 执行 `uuid-b` 离开操作。
- **预期结果**：
  - 步骤 2：成员数 +1 且存在 `uuid-b`。
  - 步骤 3：返回重复成员错误。
  - 步骤 4：`uuid-b` 的连接状态变为 `Disconnected`。
  - 步骤 5：成员从内存映射移除。

### [TC-HR-04B] 3类广播消息构建正确性
- **描述**：验证 Runtime 能正确构建 `ROOM_STATE`、`MEMBER_JOINED`、`MEMBER_LEFT` 载荷。
- **测试步骤**：
  1. 以房间内 Host + 1 名成员构建 `ROOM_STATE`。
  2. 以成员快照构建 `MEMBER_JOINED`。
  3. 以成员 ID 构建 `MEMBER_LEFT`。
- **预期结果**：
  - 步骤 1：`members` 数量与内存状态一致，`role/conn_state` 字段值合法。
  - 步骤 2：`member_id` 与 `display_name` 与输入一致。
  - 步骤 3：消息包含正确的 `member_id`。

### [TC-HR-05] 成员断线与清理
- **描述**：成员异常断开 WS 连接时，Runtime 必须清理内存并广播离开事件。
- **测试步骤**：
  1. 强制关闭 B 的底层 TCP 连接。
  2. 等待心跳超时或 close 事件触发。
- **预期结果**：
  - Runtime 从 `members` Map 移除 B。
  - A 收到 `{type: "MEMBER_LEFT", target: "uuid-b"}`。

### [TC-HR-06] SDP 与 ICE 靶向透传
- **描述**：验证 `WEBRTC_OFFER` 等信令仅被转发给指定的 `target`，而非全员广播。
- **测试步骤**：
  1. 房间内有 A, B, C 三人。
  2. A 向 Runtime 发送 `{type: "WEBRTC_OFFER", target: "uuid-b", sdp: "..."}`。
- **预期结果**：
  - B 收到该消息，且包含 `from: "uuid-a"`。
  - C **不应该**收到该消息。

### [TC-HR-06A] WebRTC 透传路由拦截
- **描述**：验证 WebRTC 透传在非法来源、非法目标、自指向目标时拒绝转发。
- **测试步骤**：
  1. 使用房间外成员作为 `from` 发起 `WEBRTC_OFFER`。
  2. 使用房间外成员作为 `target` 发起 `WEBRTC_ANSWER`。
  3. 使用 `from == target` 发起 `ICE_CANDIDATE`。
- **预期结果**：
  - 步骤 1：返回 `SourceNotInRoom`。
  - 步骤 2：返回 `TargetNotInRoom`。
  - 步骤 3：返回 `TargetIsSelf`。

---

## 3. 房主管理与热迁移模块

### [TC-HR-07] 房主执行全局闭麦
- **描述**：房主发起闭麦指令，Runtime 需更新该成员状态并广播。
- **前置条件**：A 是房主，B 是成员。
- **测试步骤**：A 发送 `{type: "HOST_ACTION_MUTE", target: "uuid-b"}`。
- **预期结果**：
  - Runtime 将内部 B 的状态更新为 `serverMuted: true`。
  - A 和 B 都收到 `{type: "HOST_MUTE", target: "uuid-b", state: true}`。

### [TC-HR-08] 房主移交状态机完整流转
- **描述**：验证房主迁移的底层信令顺序。
- **前置条件**：A 是房主，B 是成员。
- **测试步骤**：
  1. A 发起移交：发送 `{type: "INITIATE_MIGRATION", target: "uuid-b"}`。
  2. Runtime 将此指令转发给 B：`{type: "START_HOST_RUNTIME"}`。
  3. B 模拟本地进程启动成功，回复：`{type: "RUNTIME_READY", url: "ws://192.168.1.100:8080"}`。
- **预期结果**：
  - Runtime 收到就绪指令后，向所有人广播 `{type: "MIGRATE", newHost: "ws://192.168.1.100:8080"}`。
  - Runtime 自身进入 `DESTROYING` 倒计时状态。

### [TC-HR-08A] 房主移交超时与非法流转拦截
- **描述**：验证迁移状态机在目标主机超时与错误顺序调用时进入正确错误分支。
- **测试步骤**：
  1. 进入 `MigrationInitiated` 后等待超过超时阈值再执行 `runtime_ready`。
  2. 在 `Normal` 状态直接调用 `broadcast_migrate`。
- **预期结果**：
  - 步骤 1：状态变为 `Failed`，错误原因为 `TARGET_RUNTIME_TIMEOUT`。
  - 步骤 2：返回 `InvalidTransition`。
