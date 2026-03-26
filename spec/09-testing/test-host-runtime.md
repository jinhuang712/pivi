# Host Runtime 核心逻辑测试用例 (TDD)

## 1. WebSocket 连接与鉴权模块

### [TC-HR-01] 正常成员加入房间
- **描述**：验证携带正确 6 位 Code 与有效 UUID 的客户端能否成功建立 WS 连接。
- **前置条件**：Host Runtime 已启动，设置口令为 `A9B2K8`。
- **步骤**：
  1. Client A 使用 Code `A9B2K8` 发起 WebSocket 连接并发送 `JOIN_ROOM`。
  2. Client B 使用 Code `A9B2K8` 发起连接并发送 `JOIN_ROOM`。
- **预期结果**：
  - A 和 B 都能收到 WebSocket 成功连接响应。
  - A 收到 `ROOM_STATE` 包含 A 和 B 的信息（若 B 先加入）。
  - B 加入时，A 收到 `MEMBER_JOINED` 广播。

### [TC-HR-02] 口令错误拒绝连接
- **描述**：验证携带错误 Code 的连接请求在鉴权阶段被拒绝。
- **前置条件**：Host Runtime 设置口令为 `A9B2K8`。
- **步骤**：
  1. Client C 携带 `B1C2D3` 尝试发送 `JOIN_ROOM`。
- **预期结果**：
  - Host Runtime 返回错误或直接关闭连接（如状态码 4003）。

### [TC-HR-03] 黑名单拦截
- **描述**：验证在黑名单中的 UUID 即使 Code 正确也会被拒绝连接。
- **前置条件**：Host Runtime 设置口令为 `A9B2K8`，黑名单 Set 包含 `uuid-evil`。
- **测试步骤**：客户端携带 `A9B2K8` 发起连接，并使用 `uuid-evil` 发送 `JOIN_ROOM`。
- **预期结果**：连接被拒绝，返回错误或断开连接。

### [TC-HR-03A] Discovery 映射注册与查询
- **描述**：验证 6 位 Code 的注册、查询、删除与大小写归一化逻辑。
- **测试步骤**：
  1. 注册 `A9B2K8 -> {roomName, host, port}`。
  2. 使用 `a9b2k8` 查询映射。
  3. 删除 `A9B2K8` 后再次查询。
- **预期结果**：
  - 步骤 2：返回与注册一致的房间端点。
  - 步骤 3：查询结果为空。

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
  1. 使用非法 Code（长度错误）发起鉴权。
  2. 使用合法但错误的 Code 发起鉴权。
  3. 将 `uuid-evil` 加入黑名单后，使用正确 Code 鉴权。
  4. 使用正确 Code + 非黑名单 UUID 鉴权。
- **预期结果**：
  - 步骤 1：返回 `InvalidRoomCode`。
  - 步骤 2：返回 `WrongRoomCode`。
  - 步骤 3：返回 `BlacklistedUser`。
  - 步骤 4：鉴权通过。

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
