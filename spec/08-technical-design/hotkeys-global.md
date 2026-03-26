# 全局快捷键技术设计（Global Hotkeys）

## 1. 目标范围（Phase 5.5）

- 支持系统级全局快捷键绑定：
  - PTT（按下说话）
  - 全局静音切换
- 允许在设置页修改快捷键并持久化当前绑定配置。

## 2. Runtime 侧实现骨架

- 使用 `tauri-plugin-global-shortcut` 承载系统级注册能力。
- 暴露三类 Tauri Command：
  - `bind_global_hotkeys(ptt, mute)`
  - `unbind_global_hotkeys()`
  - `get_global_hotkeys()`
- 运行时状态使用 `HotkeyState` 内存存储当前绑定配置。

## 3. 绑定策略

- 绑定前先执行参数合法性校验（`Shortcut::from_str`）。
- 每次重绑前先 `unregister_all()`，避免旧快捷键残留冲突。
- 当 PTT 与静音快捷键相同，仅注册一次，避免重复注册错误。

## 4. 安全与稳定性

- 非法快捷键格式直接返回错误，不进入系统注册流程。
- 手动解绑调用 `unregister_all()` 并清空 `HotkeyState`。
- 本阶段仅实现绑定与状态管理骨架，快捷键触发后的业务动作（真正的麦克风开关）在后续阶段接入。
