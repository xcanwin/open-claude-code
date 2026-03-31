# Open Claude Code

`@xcanwin/open-claude-code` 是一个可直接安装的 Claude Code 命令行包。

安装后可直接使用 `open-claude-code` 命令。

## 普通用法

```bash
npm install -g @xcanwin/open-claude-code
open-claude-code --version
open-claude-code --help
```

## 开发者用法

本仓库的发布流程是：

1. 解包 `@anthropic-ai/claude-code`
2. 用 source map 恢复 `src/`
3. 补齐当前缺失的桩模块
4. 从恢复源码重新构建本包自己的 `cli.js`

生成出来的运行时文件不会长期留在仓库根目录，打包后会自动清理到 `./temp/runtime/`。

本地调试可以用：

```bash
npm run sync:runtime
node ./cli.js --version
node ./cli.js --help
```

如果你要单独做 source map 恢复，也保留了：

```bash
node ./bin/open-claude-code-recover.js -v 2.1.88 -d ./artifacts
```
