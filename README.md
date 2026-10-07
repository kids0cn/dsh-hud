# dsh-hud

给 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/dsh) 输入框下方加一行轻量 HUD，Claude Code 状态栏风格：

```
🤖 agent standard   ⚓ hook ×6   ✦ skill ×1        ⊙ 9 轮 144 步 · 58 tok/s  ⊜ 20.1M tok …
```

- **agent** —— 当前会话的 preset / 模型；点击看 model、preset
- **hook** —— 本会话 hook 触发总数（⛔ 为拦截数）；点击按 handler 分组看明细
- **skill** —— 本会话 skill 工具调用数；点击看调用了哪些 skill（另有 ✗ 失败工具数）

默认只显示图标 + 名字 + 数量，**独立居中一行**在宿主统计条上方，不挤占原有信息；点击胶囊**向上**弹出详情框，`Esc` / 点击空白关闭。

## 安装

DSH 插件管理器安装 GitHub 包：

```text
github:kids0cn/dsh-hud
```

或命令行：

```bash
# 在 DSH 会话里让 agent 执行，或手动操作 plugin_manager
plugin_manager install_bundle  target=github:kids0cn/dsh-hud
```

安装后**刷新页面**即可看到（Host 侧即时生效，无需重启）。

## 机制（为什么它不撒谎）

- **Host 半**（`index.js`）注册一个 session projection（key `agentHud`），从**会话持久日志**折叠：
  `model/selection` → 模型名；会话头 → preset；`tool/call` → 工具计数（`skill` 调用顺带提取
  `arguments.name` 得到 skill 名）；`tool/result` → 失败数；`hook/invoked` → 按 `handlerId` 分组
  （native 方言的 handlerId 就是脚本名）；`hook/result` 的 deny/stop → 拦截数。
- **Client 半**（`client.js`）在 `conversation.composer.dock` 槽位渲染，只通过
  `useProjection('agentHud')` 读**已算好的视图**，客户端不折叠事件。
- 计数**按 session 独立**（投影 cell 逐会话隔离），不是全局累计。
- 详情框显示前会剥掉 handlerId 尾部的 `:序号`（claude-code 旧桥每次触发自增序号，
  native 脚本名不受影响）。

## 兼容性与降级

- HUD 独占一行依赖向 composer dock 注入 `flex-wrap: wrap`，选择器带 UI 模块哈希
  （`[class~="uV2eYG_dock"]`）。DSH 前端升级导致哈希变化时选择器失配 → **优雅降级回单行**，
  不会破坏渲染。
- 投影缺席 / 槽位 props 异常时渲染**诊断胶囊**（`hud no-data` / `hud no-hook`）而不是静默消失，
  出问题一眼可定位在哪一侧。

## 文件

| 文件 | 职责 |
|---|---|
| `index.js` | Host：注册 `agentHud` 会话投影（zod schema，stateVersion 2） |
| `client.js` | Client：三胶囊 + 详情框 + 诊断态，注册进 composer dock 槽位 |
| `cordis.patch.yml` | bundle 插件行 |

## License

MIT
