# dsh-skill-manager

DeepSeek Harness (DSH) 的「技能管理」插件：在 Web 设置里列出所有已安装技能并提供删除按钮，同时在输入框工具行加一个「技能」按钮用于快速引用技能。

## 功能

- **设置 → 「技能」分区**：列出 `~/.dsh/skills` 与 `~/.agents/skills` 下所有已安装技能，显示中文说明；用户安装的技能可一键删除（目录型删整个 `<name>/`，平铺型删 `<name>.md`），内置/运行时技能只读。
- **输入框工具行「技能」按钮**：点击弹出当前会话可用的技能列表，鼠标悬停显示与设置一致的技能介绍，点选后向草稿插入 `/技能名 `，复用 DSH 的斜杠管线加载该技能。

## 安装

1. 把本目录放到 `~/dsh-plugins/dsh-skill-manager`。
2. 在 web profile（`~/.dsh/profiles/web/package.json`）的 `dependencies` 里加入：

   ```json
   "dsh-skill-manager": "file:C:/Users/<you>/dsh-plugins/dsh-skill-manager"
   ```

3. 在 `dsh.profile.bundles` 里加入 `"dsh-skill-manager"`。
4. 在该目录执行 `pnpm install`，然后重启 `dsh web`。

## 结构

- `lib/index.js` — 宿主端：直接扫描技能根目录，暴露 `/api/skill-admin/list` 与 `/api/skill-admin/remove`（均仅限 loopback）。
- `lib/client.js` — 客户端：注册 `settings.section`（技能列表）与 `conversation.input.left`（技能按钮）。
- `cordis.patch.yml` — 插件挂载补丁（`- insert`）。
- `package.json` — 声明 `dsh.client`（`platform: web`）与 `exports["./client"]`，使客户端 bundle 能被 `/plugins/<id>/client.js` 动态加载。

## 说明

- 删除是物理删除文件/目录，仅作用于 `~/.dsh/skills` 与 `~/.agents/skills` 两个用户根；项目级（git 仓库内 `.dsh/skills`）与内置（bundled）技能不在删除范围内。
- 技能中文说明来自插件内置映射表；未收录的新技能回退显示其 `SKILL.md` frontmatter 里的 `description`。
- 插件不依赖 `@deepseek-ai/dsh-skill` 注册表（其 provider 按 agent 预设作用域分层，宿主平面读不到全局列表），而是直接扫描文件系统，因此列表稳定可靠。

## License

MIT
