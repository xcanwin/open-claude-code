# Open Claude Code

## 介绍

- 与其他单纯解包的项目不同
- `Open Claude Code` 是全球首个基于 `Claude Code` 源代码的可安装、可运行、可调试、很干净的 Agent
- `@xcanwin/open-claude-code` 是可安装、可运行的命令行工具，安装后可直接使用 `open-claude-code` 命令，效果等于 `claude` 命令
- 本项目是在 AI Agent 安全沙箱 [manyoyo](https://github.com/xcanwin/manyoyo) 中完成

## 快速使用方法

要求 `Node.js >= 20.19.0`。

```bash
npm install -g @xcanwin/open-claude-code
open-claude-code -v
open-claude-code -h
open-claude-code -p "which model are you?"
open-claude-code
```

## Agent开发者

### 开发调试方法

```bash
npm install
npm run sync:runtime
node ./bin/open-claude-code.js -v
node ./bin/open-claude-code.js -h
node ./bin/open-claude-code.js -p "which model are you?"
node ./bin/open-claude-code.js
```

已实现 `bin/open-claude-code.js` 自动透传 `--enable-source-maps`，可通过以下方法验证可调试性：
```bash
node ./bin/open-claude-code.js --max-budget-usd -1
```

### 发布前的测试方法

```bash
npm install
npm run sync:runtime
npm install -g .
open-claude-code -v
open-claude-code -h
open-claude-code -p "which model are you?"
open-claude-code
```

## 其他说明

### 研究历程

1. 解包 `@anthropic-ai/claude-code`
2. 用 source map 恢复 `src/`
3. 补齐当前缺失的桩模块
4. 在 `temp/source-build/` 中按固定依赖版本重建本包自己的 `runtime/cli.js`

### 源码恢复

若要单独尝试 source map 恢复，可运行这个小工具。`-v` 默认读取 `package.json` 中的 `claudeCodeVersion`：

```bash
node ./bin/open-claude-code-recover.js -d ./artifacts
```

### 同步说明

- `npm run sync:runtime` 会输出 `packing`、`extracting`、`recovering`、`copying runtime assets`、`installing source-build dependencies`、`building runtime CLI` 等阶段日志
- `npm run clean:runtime` 会清理 `runtime/` 和 `temp/source-build/`
- 当前构建链路不再依赖系统 `cp -R` 或 `tar`

### AI Agent 安全沙箱

- 首选 [manyoyo](https://github.com/xcanwin/manyoyo)
- 或者在 `docker run --rm -it node:22-slim bash` 内执行上述 `使用方法`
