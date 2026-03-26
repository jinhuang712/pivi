# 信令与 WebRTC 会话建立协议

房主 Runtime 作为信令服务器（Signaling Server），负责房间内所有客户端的连接调度。我们采用 **Mesh 拓扑**（每个人都与其他所有人建立 P2P 连接）作为主要媒体架构，房主节点负责在 P2P 失败时提供中转（Relay）。

## 1. 发现服务与会话建立时序图

本时序图展示了成员如何通过 **统一 16 位邀请码** 解析房间信息（展示二次确认弹窗），进而加入房间并与其他成员通过信令交换建立 P2P WebRTC 通道的过程。

```mermaid
sequenceDiagram
    participant C1 as 成员 A (Client)
    participant D as Invite Decoder
    participant H as 房主 Runtime (WebSocket)
    participant C2 as 成员 B (Client)

    %% 房间发现阶段（统一 16位邀请码）
    C1->>D: resolve(code=K7M2-9Q4P-T8XD-3F6N)
    D-->>C1: 返回 {roomName: "周末电竞开黑房", wsUrl: "ws://192.168.x.x:8080"}
    C1->>C1: UI 弹窗询问“是否加入：周末电竞开黑房？”
    C1->>C1: 用户点击“确认加入”

    %% 成员加入阶段
    C1->>H: ws.connect(wsUrl)
    H-->>C1: WS Connected
    C1->>H: {type: "JOIN_ROOM", payload: {uuid, nickname, code: "A9B2K8"}}
    H->>C1: {type: "ROOM_STATE", payload: {members: [...]}}
    H->>C2: {type: "MEMBER_JOINED", payload: {uuid, nickname}}

    %% WebRTC 协商阶段 (P2P Mesh 拓扑)
    C1->>C1: create RTCPeerConnection(C2)
    C1->>H: {type: "WEBRTC_OFFER", target: C2, sdp: ...}
    H->>C2: {type: "WEBRTC_OFFER", from: C1, sdp: ...}
    
    C2->>C2: setRemoteDescription(sdp)
    C2->>C2: createAnswer()
    C2->>H: {type: "WEBRTC_ANSWER", target: C1, sdp: ...}
    H->>C1: {type: "WEBRTC_ANSWER", from: C2, sdp: ...}

    %% ICE 候选收集
    C1->>H: {type: "ICE_CANDIDATE", target: C2, candidate: ...}
    H->>C2: Relay ICE
    C2->>H: {type: "ICE_CANDIDATE", target: C1, candidate: ...}
    H->>C1: Relay ICE

    %% 媒体通道建立
    C1<-->>C2: DTLS-SRTP 媒体流与 DataChannel 建立完成
```

## 2. 信令消息定义

所有控制面信令均通过 JSON 格式在 WebSocket 通道中传输。

## 3. 邀请码最小实现（Phase 3.2，无云）

- **数据模型**：`InviteCode -> RoomEndpoint(roomName, host, port, scope, expiry)` 的自描述编码。
- **写入能力**：房主创建房间并完成入口探测后，签发统一 16 位邀请码。
- **读取能力**：成员加入房间前在本地解码邀请码，返回房间名与连接地址。
- **删除能力**：房间销毁或房主迁移完成后使旧邀请码过期。
- **输入约束**：`16 位 Base32 + TTL + Checksum`。
- **部署约束**：不依赖中心服务器；当前阶段优先支持已知可达地址场景。

## 4. 信令消息分类

### 4.1 客户端 -> 房主 (Client to Host)
- `JOIN_ROOM`: 发送客户端 UUID、昵称、以及用于加入房间的邀请码。
- `LEAVE_ROOM`: 客户端主动离开。
- `WEBRTC_OFFER` / `WEBRTC_ANSWER` / `ICE_CANDIDATE`: WebRTC 协商相关的透传信令，需包含 `target` (目标成员 UUID)。
- `CHAT_MESSAGE`: 发送轻量级文本消息。

### 4.2 房主 -> 客户端 (Host to Client)
- `ROOM_STATE`: 发送当前房间的完整成员列表与状态（仅在加入成功后下发一次）。
- `MEMBER_JOINED` / `MEMBER_LEFT`: 广播成员变动。
- `HOST_MUTE`: 广播某成员被房主全局闭麦的状态变更。
- `MIGRATE`: 房主迁移指令，要求全体重连至新地址。

## 5. JoinRoom 鉴权判定顺序（Phase 3.5）

- Host 在收到 `JOIN_ROOM` 后先执行输入校验：
  - `invite_code` 必须满足 16 位 Base32、校验通过且未过期。
- 校验通过后进入房间入口比对：
  - 使用解码出的入口与当前 Runtime 监听入口比对。
- 通过入口比对后再执行黑名单拦截：命中则拒绝连接，不写入 `RoomState`。
- 仅全部通过时才返回 `ROOM_STATE` 并触发后续成员广播流程。

## 6. 房间广播消息结构（Phase 3.6）

- `ROOM_STATE`：`{ room_id, members[] }`，其中 `members` 为成员快照数组。
- `MEMBER_JOINED`：`{ member }`，包含新成员快照。
- `MEMBER_LEFT`：`{ member_id }`，用于触发客户端离房清理。
- `member` 快照字段统一为：
  - `member_id`
  - `display_name`
  - `role` (`Host` | `Member`)
  - `conn_state` (`Connected` | `Disconnected`)

## 7. WebRTC 透传路由规则（Phase 4.1）

- Runtime 对 `WEBRTC_OFFER` / `WEBRTC_ANSWER` / `ICE_CANDIDATE` 执行统一路由判定。
- 判定规则：
  - `from` 必须存在于当前 `RoomState`。
  - `target` 必须存在于当前 `RoomState`。
  - `from != target`。
- 通过判定后将原始信令原样转发到 `target`，不改写 `payload`。

## 8. 网络降级与中转切换规则（Phase 4.4）

- 客户端持续监听 `RTCPeerConnection.iceConnectionState`。
- 满足以下任一条件时触发降级决策：
  - 状态为 `failed`。
  - 状态为 `checking` 且持续超过超时阈值（默认 8s）。
- 降级后将该 `peerId` 标记为 Relay 会话，并把媒体路由切换到房主中转路径。
- 当会话进入 `closed` 时清理对应 Relay 标记。
