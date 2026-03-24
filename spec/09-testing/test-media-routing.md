# 客户端媒体流与音频控制测试用例 (TDD)

## 1. Web Audio API 路由与增益控制

### [TC-MEDIA-01] 本地独立音量调节验证
- **描述**：调整特定成员的音量滑块，应正确映射到对应的 `GainNode` 而不影响其他成员。
- **前置条件**：客户端收到 A 和 B 两路 `MediaStream`，已接入 `AudioContext`。
- **测试步骤**：
  1. 获取 A 对应的 `GainNode_A` 和 B 对应的 `GainNode_B`。
  2. UI 操作：将 A 的音量滑块拖动至 50%。
- **预期结果**：
  - `GainNode_A.gain.value` 等于 `0.5`。
  - `GainNode_B.gain.value` 保持默认（如 `1.0`）。

### [TC-MEDIA-02] 本地屏蔽 (Local Mute) 验证
- **描述**：点击某成员的屏蔽按钮，应将其 GainNode 的值强置为 0。
- **前置条件**：同上。
- **测试步骤**：点击 A 的 🔇（屏蔽）按钮。
- **预期结果**：
  - `GainNode_A.gain.value` 等于 `0.0`。
  - 再次点击解除屏蔽时，`GainNode_A.gain.value` 恢复至屏蔽前的滑块值。

### [TC-MEDIA-03] 全局静音/闭麦验证
- **描述**：点击底部控制栏的全局扬声器/麦克风开关。
- **测试步骤**：
  1. 点击全局麦克风关闭。
  2. 点击全局扬声器关闭。
- **预期结果**：
  - 本地 `MediaStreamTrack` (Audio) 的 `enabled` 属性变为 `false`。
  - `AudioContext` 的 `Master GainNode` 的值变为 `0.0`。

---

## 2. 响应服务端信令状态

### [TC-MEDIA-04] 响应房主全局闭麦 (Host Mute)
- **描述**：当收到房主的强制闭麦信令时，客户端必须从源头切断麦克风。
- **测试步骤**：
  1. 客户端通过 WebSocket 收到 `{type: "HOST_MUTE", target: "my-uuid", state: true}`。
- **预期结果**：
  - 本地 `localAudioTrack.enabled` 被强制设为 `false`。
  - UI 上的麦克风按钮变为 disabled 状态，用户无法手动点开。

---

## 3. 设备管理与输入模式

### [TC-MEDIA-05] 热插拔麦克风设备切换
- **描述**：插入新 USB 麦克风时，下拉列表应自动更新并支持切换。
- **测试步骤**：
  1. 触发 `navigator.mediaDevices.ondevicechange` 事件。
  2. 在设置中选择新麦克风。
- **预期结果**：
  - `RTCRtpSender.replaceTrack()` 被调用，平滑替换底层音频流。
  - P2P 连接不断开。

### [TC-MEDIA-06] PTT 按键说话模式验证
- **描述**：在 PTT 模式下，仅当按下指定快捷键时才有音频输出。
- **前置条件**：设置输入模式为 PTT，绑定快捷键为 `Space`。
- **测试步骤**：
  1. 不按任何键对着麦克风说话。
  2. 按住 `Space` 键说话。
  3. 松开 `Space` 键。
- **预期结果**：
  - 步骤 1：`localAudioTrack.enabled === false`，UI 指示灯不亮。
  - 步骤 2：`localAudioTrack.enabled === true`，UI 指示灯亮起。
  - 步骤 3：`localAudioTrack.enabled === false`，UI 指示灯熄灭。

### [TC-MEDIA-07] 中置控制条麦克风滑杆与闭麦联动
- **描述**：主区中置控制条中的麦克风开关与麦克风音量滑杆应正确反映输入控制状态。
- **测试步骤**：
  1. 在频道主页拖动麦克风音量滑杆至 35%。
  2. 点击麦克风开关执行闭麦。
  3. 再次点击麦克风开关恢复开麦。
- **预期结果**：
  - 步骤 1：UI 显示 `35%`，输入增益状态同步为目标值。
  - 步骤 2：本地输入轨道状态变为闭麦，麦克风按钮变为闭麦态样式。
  - 步骤 3：本地输入轨道恢复开麦，滑杆值保持 35% 不丢失。
