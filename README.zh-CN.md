# Gitmous

**可在终端通过鼠标、按钮和菜单完成日常 Git 操作的客户端。** Gitmous 把图形化源码管理面板的工作流带进终端：指向、点击、查看、确认即可完成日常 Git 操作，无需记忆 Git 命令。

![Gitmous 终端界面](./show.png)

[English](./README.md) | 简体中文

## 在终端中操作 Git

Gitmous 让你在终端中通过鼠标、按钮、菜单和对话框完成日常 Git 操作。分组标题、文件按钮、差异视图和冲突工具均可点击；提交消息、分支名、远程地址等文本内容在程序输入框中填写，无需手动输入 Git 或 Shell 命令。

`Ctrl+C` 可退出程序。

## 可点击完成的功能

| 区域 | 可在终端中执行的操作 |
| --- | --- |
| 仓库 | 发现当前目录下的仓库、添加本地仓库、初始化仓库或从远程地址克隆。 |
| 更改 | 点击文件暂存或取消暂存；查看工作区差异；一键暂存全部、取消全部暂存，或确认后丢弃单个/全部更改。 |
| 提交 | 创建提交；查看提交详情；浏览提交中的文件；复制哈希或提交内容；还原到指定提交。 |
| 分支 | 新建、切换、发布、合并、删除本地或远程分支。 |
| 远程协作 | 抓取、拉取、推送、发布当前分支；添加或删除远程仓库；查看远程仓库详情。 |
| 储藏和标签 | 新建、应用、弹出、查看或删除储藏；新建和删除标签。 |
| 冲突处理 | 接受当前版本、接受传入版本、中止合并，或在手动编辑后标记文件为已解决。 |
| 外观 | 在设置菜单中切换英文或简体中文，并设置主题强调色。 |

会丢弃本地工作或改写历史的操作均需二次确认，确认后才会执行 Git。

## 支持的平台与环境

只要能运行 Node.js 与 Git，Gitmous 就可以使用。

- **macOS：** 支持。可通过 Homebrew 安装 Node.js 和 Git：`brew install node git`，之后使用 Terminal 或 iTerm2 运行。
- **Windows：** 建议使用 Windows Terminal。安装 Node.js 与 Git，并确保 `git` 已加入 `PATH`。
- **Linux：** 使用发行版的包管理器安装 Node.js 18+ 与 Git。

需要使用支持鼠标报告的终端，支持 Node.js 18 及更高版本。

## 通过 npm 安装

包发布后，安装一次即可在任意 Git 仓库中调用：

```sh
npm install --global gitmous
gitmous /path/to/your-repository
```

macOS 示例：

```sh
gitmous ~/Code/your-repository
```

Windows PowerShell 示例：

```powershell
gitmous D:\github\your-repository
```

也可以不进行全局安装，直接运行：

```sh
npx gitmous /path/to/your-repository
```

未传入目录时，Gitmous 会使用当前目录，并向下扫描两层以发现 Git 仓库。

## 首次使用

1. 在 Git 仓库或其父目录启动程序。
2. 在“存储库”区域点击选择目标仓库。
3. 在“更改”区域点击文件即可暂存，或点击“查看”检查差异。
4. 填写提交消息后点击“提交”。
5. 通过顶部“操作”菜单完成远程、分支、合并、储藏、标签和历史相关操作。

点击分组标题可折叠或展开面板；标题右侧的 `...` 会打开与该区域相关的操作菜单。

## 本地开发

```sh
git clone https://github.com/JackyWongX/gitmous.git
cd gitmous
npm install
npm start -- /path/to/your-repository
npm run check
```

## 配置

设置会保存语言、强调色和差异面板偏好。Windows 下文件位于 `%APPDATA%\gitmous\settings.json`；macOS 和 Linux 下位于 `~/.config/gitmous/settings.json`。

## 安全与隐私

Gitmous 只在本机执行 Git 命令，不会向第三方服务上传仓库内容。确认破坏性操作前，请仔细核对对话框中显示的仓库、文件、分支和命令详情。

## 发布到 npm

本项目通过 `package.json` 的 `bin` 字段提供公开 npm 命令行工具。首次发布前，登录 npm 后执行：

```sh
npm login
npm publish --access public
```

后续发布前使用 `npm version patch`、`npm version minor` 或 `npm version major` 递增版本号，然后再执行发布命令。
