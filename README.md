# dsh-cache-hit-precision

中文 | [English](README.en.md)

[![CI](https://github.com/vrvtvy/dsh-cache-hit-precision/actions/workflows/ci.yml/badge.svg)](https://github.com/vrvtvy/dsh-cache-hit-precision/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

一个 [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/)（DSH）Web 插件：把底部
composer 统计行里的缓存命中率**原位精化到三位小数**（`缓存命中 98%` →
`缓存命中 98.460%`），并同步「Token 用量」弹窗与状态行中的同一读数。

不新增任何可见内容：插件在 composer dock 里占一个不可见的席位，读取与内置
统计 pill 相同的 `tokenUsage` 投影，只改写缓存命中率这一个读数——轮次、步数、
速度、总量，以及弹窗里的其余桶位（未缓存输入、缓存读取、缓存写入、输出）都
保持原样，也不改动任何布局尺寸。

## 效果

![「Token 用量」弹窗与底部状态行中的缓存命中率被精化为 99.186%](docs/assets/token-usage-dialog.png)

弹窗中的「缓存命中」行与底部状态行（`80.9M tok · 缓存命中 99.186%`）都被
原位替换为三位小数读数，界面其余部分与内置渲染完全一致。

## 为什么需要三位小数

DSH 内置的格式化器有一条好规则：不把部分命中向上舍入成 `100%`——整数读数
会失真时，它会自动加宽小数位，直到那一份未命中可见。本插件把同样的承诺
建立在**三位小数**的起点上，而不是整数起点，让命中率的变化在日常使用中就
能被看见：

| 缓存读取 / 计费输入 | 内置显示   | 本插件显示   |
| ------------------- | ---------- | ------------ |
| 123 / 1123          | `11%`      | `10.953%`    |
| 9995 / 10000        | `99.95%`   | `99.950%`    |
| 999999 / 1000000    | `99.9999%` | `99.9999%`   |
| 9995 / 9995         | `100%`     | `100.000%`   |

分母与 DSH 完全一致，即三个互不重叠的输入侧计费桶之和：
`uncachedInputTokens + cacheReadTokens + cacheWriteTokens`。因此两者只可能在
**精度**上不同，不会在**口径**上不同。舍入采用精确整数运算的半进位，百分比
不会带上浮点误差。

## 工作原理

精化是即时的：内置弹窗首帧以整数精度渲染，因此每当锚点新挂载或 React 原位
改写读数时，插件都在 mutation observer 自己的微任务里重新精化——在 React
提交之后、浏览器绘制之前完成，低精度首帧不会被看到；其余变更仍按 burst
结束后的一次去抖重扫处理。

插件锚定统计行的 `data-composer-stats` 容器、会话用量弹窗行列表的
`data-session-stats-usage` 属性，以及内置的两种语言文案，因此能跨次要的
主题与布局调整继续工作。

## 安装

**按包名安装（推荐）** —— 包已发布到 npm。桌面端打开「设置 → 插件」，点
「添加插件」，直接填包名 `dsh-cache-hit-precision` 再点「安装」；命令行等价于：

```sh
dsh plugin --profile web add dsh-cache-hit-precision
```

刚发布的版本在 npmmirror 镜像上可能有几分钟延迟；安装对话框和 CLI 都会在
官方源与镜像之间自动回退，CLI 也可以用 `--registry` 显式指定源。

**按目录安装** —— 也可以从源码目录安装。先把仓库克隆到本地：

```sh
git clone https://github.com/vrvtvy/dsh-cache-hit-precision.git
```

桌面端「设置 → 插件 → 添加插件」填克隆目录的**绝对路径**；命令行：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-cache-hit-precision
```

路径必须是绝对路径；正斜杠在各平台都可用（Windows 用 `D:/…`，其它平台用
`/home/you/…`）。安装完成后重启 DSH。

桌面端独占管理自己的 profile，因此命令行会拒绝 `--profile desktop`；那种情况
请改用「设置 → 插件」。

## 兼容性

面向 DSH `0.2.0-rc.*`（已在 `0.2.0-rc.2` 上验证）。该版本的统计行由
`@deepseek-ai/dsh-client-ui-chat` 的 `StatsPills` 渲染。若上游重做了相关
结构或文案，可能需要更新本插件。

每轮用量面板（`data-turn-usage-details`）被**有意**排除在外：它的缓存命中率是
另一个口径——单轮而非整个会话——改写成 pill 的数字反而会误报。

DSH `0.1.x` 的统计行实现不同，本版本不支持。

## 说明

- 不请求网络，不上传任何数据。
- 只注册一个 slot 条目，不注入样式；卸载后不留残留。

## 测试

```sh
npm test
```

## 致谢与许可

基于 [Cheng-cheng9669](https://github.com/Cheng-cheng9669) 的
[dsh-cache-precision](https://github.com/Cheng-cheng9669/dsh-cache-precision)
延续维护，适配 DSH 0.2。以 [MIT](LICENSE) 许可证发布。
