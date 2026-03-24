# 信令与 WebRTC 会话建立协议

房主 Runtime 作为信令服务器（Signaling Server），负责房间内所有客户端的连接调度。我们采用 **Mesh 拓扑**（每个人都与其他所有人建立 P2P 连接）作为主要媒体架构，房主节点负责在 P2P 失败时提供中转（Relay）。

## 1. 发现服务与会话建立时序图

本时序图展示了成员如何通过 6 位 Code 解析房间信息（展示二次确认弹窗），进而加入房间并与其他成员通过信令交换建立 P2P WebRTC 通道的过程。

```mermaid
sequenceDiagram
    participant C1 as 成员 A (Client)
    participant D as Discovery Service (云端轻量服务)
    participant H as 房主 Runtime (WebSocket)
    participant C2 as 成员 B (Client)

    %% 房间发现阶段 (6位Code)
    C1->>D: HTTP GET /resolve?code=A9B2K8
    D-->>C1: 返回 {roomName: "周末电竞开黑房", wsUrl: "ws://x.x.x.x:8080"}
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

## 3. 发现服务最小实现（Phase 3.2）

- **数据模型**：`code -> RoomEndpoint(roomName, host, port)` 的内存映射。
- **写入能力**：房主创建房间时注册 6 位 Code，若同 Code 重复注册则覆盖旧值。
- **读取能力**：成员加入房间前按 Code 解析房间端点，返回房间名与连接地址。
- **删除能力**：房间销毁或房主迁移完成后移除旧映射。
- **输入约束**：Code 必须满足 `6 位 + 字母数字`，查询时统一按大写归一化。

## 4. 信令消息分类

### 4.1 客户端 -> 房主 (Client to Host)
- `JOIN_ROOM`: 发送客户端 UUID、昵称、以及用于加入房间的口令。
- `LEAVE_ROOM`: 客户端主动离开。
- `WEBRTC_OFFER` / `WEBRTC_ANSWER` / `ICE_CANDIDATE`: WebRTC 协商相关的透传信令，需包含 `target` (目标成员 UUID)。
- `CHAT_MESSAGE`: 发送轻量级文本消息。

### 4.2 房主 -> 客户端 (Host to Client)
- `ROOM_STATE`: 发送当前房间的完整成员列表与状态（仅在加入成功后下发一次）。
- `MEMBER_JOINED` / `MEMBER_LEFT`: 广播成员变动。
- `HOST_MUTE`: 广播某成员被房主全局闭麦的状态变更。
- `MIGRATE`: 房主迁移指令，要求全体重连至新地址。
