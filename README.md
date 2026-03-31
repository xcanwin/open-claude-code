# Open Claude Code

## 介绍

- 与其他单纯解包的项目不同
- `Open Claude Code` 是全球首个基于 `Claude Code` 源代码的可安装、可运行、可调试、很干净的 Agent
- `@xcanwin/open-claude-code` 是可安装、可运行的命令行工具，安装后可直接使用 `open-claude-code` 命令，效果等于 `claude` 命令
- 本项目是在 AI Agent 安全沙箱 [manyoyo](https://github.com/xcanwin/manyoyo) 中完成

## 快速使用方法

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
4. 从恢复源码重新构建本包自己的 `runtime/cli.js`

### 源码恢复

若要单独尝试 source map 恢复，可运行这个小工具：

```bash
node ./bin/open-claude-code-recover.js -v 2.1.88 -d ./artifacts
```

### AI Agent 安全沙箱

- 首选 [manyoyo](https://github.com/xcanwin/manyoyo)
- 或者在 `docker run --rm -it node:22-slim bash` 内执行上述 `使用方法`
