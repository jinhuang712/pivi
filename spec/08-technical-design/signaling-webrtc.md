# 信令与 WebRTC 会话建立协议

房主 Runtime 作为信令服务器（Signaling Server），负责房间内所有客户端的连接调度。我们采用 **Mesh 拓扑**（每个人都与其他所有人建立 P2P 连接）作为主要媒体架构，房主节点负责在 P2P 失败时提供中转（Relay）。

## 1. 会话建立时序图

本时序图展示了成员加入房间、获取状态，以及与其他成员通过信令交换建立 P2P WebRTC 通道的过程。

```mermaid
sequenceDiagram
    participant C1 as 成员 A (Client)
    participant H as 房主 Runtime (WebSocket: 8080)
    participant C2 as 成员 B (Client)

    %% 成员加入阶段
    C1->>H: ws.connect(url?token=xxx)
    H-->>C1: WS Connected
    C1->>H: {type: "JOIN_ROOM", payload: {uuid, nickname}}
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

### 2.1 客户端 -> 房主 (Client to Host)
- `JOIN_ROOM`: 发送客户端 UUID、昵称、以及用于加入房间的口令。
- `LEAVE_ROOM`: 客户端主动离开。
- `WEBRTC_OFFER` / `WEBRTC_ANSWER` / `ICE_CANDIDATE`: WebRTC 协商相关的透传信令，需包含 `target` (目标成员 UUID)。
- `CHAT_MESSAGE`: 发送轻量级文本消息。

### 2.2 房主 -> 客户端 (Host to Client)
- `ROOM_STATE`: 发送当前房间的完整成员列表与状态（仅在加入成功后下发一次）。
- `MEMBER_JOINED` / `MEMBER_LEFT`: 广播成员变动。
- `HOST_MUTE`: 广播某成员被房主全局闭麦的状态变更。
- `MIGRATE`: 房主迁移指令，要求全体重连至新地址。