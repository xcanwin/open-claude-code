# Open Claude Code

## 介绍

- 与其他单纯解包的项目不同
- `Open Claude Code` 是全球首个可安装、可运行、可调试、很干净的 `claude`
- `@xcanwin/open-claude-code` 是可安装、可运行的命令行工具，安装后可直接使用 `open-claude-code` 命令，效果等于 `claude` 命令

## 使用方法

```bash
npm install -g @xcanwin/open-claude-code
open-claude-code -v
open-claude-code -h
open-claude-code -p "which model are you?"
open-claude-code
```

## 开发者

### 开发调试方法

```bash
npm run sync:runtime
node ./cli.js -v
node ./cli.js -h
```

排查报错堆栈时可以加：

```bash
node --enable-source-maps ./cli.js ...
```

例如：

```bash
node --enable-source-maps ./cli.js --max-budget-usd -1
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

本仓库的研究历程是：

1. 解包 `@anthropic-ai/claude-code`
2. 用 source map 恢复 `src/`
3. 补齐当前缺失的桩模块
4. 从恢复源码重新构建本包自己的 `cli.js`

若要单独尝试 source map 恢复，可运行这个小工具：

```bash
node ./bin/open-claude-code-recover.js -v 2.1.88 -d ./artifacts
```
