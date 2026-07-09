# 跨平台真实房间互通测试（Plan A）

## 目标

- 验证 Windows 为主力平台时，真实房间控制面与媒体面可用。
- 确认 macOS 与 Windows 之间的建房/加入至少能完成控制面闭环。
- 保持“完全无云”约束，所有验收都不依赖中心化信令/注册服务。

## 核心验收矩阵

| 场景 | 预期 |
| --- | --- |
| Windows Host -> Windows Join | 必须成功 |
| Windows Host -> macOS Join | 必须成功 |
| macOS Host -> Windows Join | 必须成功 |
| Host 端口不可达 | 必须输出明确诊断并回退 |
| P2P 失败 | 必须进入 RelayFallback 或给出明确原因 |

## A1 控制面验收

- Host 创建房间后，Tauri Runtime 返回：
  - 本机监听地址
  - 端口
  - 邀请码
  - 候选入口摘要
  - Runtime 状态 `Ready`
- Join 输入邀请码后，必须真实连接 Host Runtime。
- 确认加入后，成员列表必须来自 Runtime `ROOM_STATE` 回包。
- 另一端加入时，Host 侧必须收到 `MEMBER_JOINED`。

## A2 协商与媒体验收

- Join 端发起 `JOIN_ROOM`
- Host 返回授权成功
- 双端完成至少一轮 Offer / Answer / ICE 交换
- 协商成功时 UI 切到 `P2P直连`
- 协商失败时记录失败码，并尝试 RelayFallback

## A3 日志验收

- Windows 失败场景必须能复制出诊断日志
- 日志最低包含：
  - 本机 IPv4
  - 监听地址与端口
  - 邀请码解析结果
  - 入口探测结果
  - 控制连接结果
  - 是否进入 RelayFallback

## 回归要求

- `cargo test`
- `npx vitest run`
- `npm run build`
- 至少补一组“跨设备控制面成功”集成测试桩
