# Open Claude Code

## 介绍

- 与单纯解包不同，这是全球首个可安装、可运行、可调试、非常干净的源码版 Claude Code
- `@xcanwin/open-claude-code` 是一个可直接安装的 Claude Code 命令行包，安装后可直接使用 `open-claude-code` 命令

## 普通用法

```bash
npm install -g @xcanwin/open-claude-code
open-claude-code --version
open-claude-code --help
```

## 开发者用法

本地调试可以用：

```bash
npm run sync:runtime
npm install -g .
open-claude-code --version
open-claude-code --help
```

## 其他说明

本仓库的发布流程是：

1. 解包 `@anthropic-ai/claude-code`
2. 用 source map 恢复 `src/`
3. 补齐当前缺失的桩模块
4. 从恢复源码重新构建本包自己的 `cli.js`

生成出来的运行时文件不会长期留在仓库根目录，打包后会自动清理到 `./temp/runtime/`。

如果你要单独做 source map 恢复，也运行这个小工具：

```bash
node ./bin/open-claude-code-recover.js -v 2.1.88 -d ./artifacts
```
