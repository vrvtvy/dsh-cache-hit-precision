# Changelog

本文件记录本包的所有重要变更 / All notable changes to this package.

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[Semantic Versioning](https://semver.org/lang/zh-CN/)。
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
package adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- 把 `engines.dsh` 从 `dsh.engines.dsh` 移到 package.json 顶层 `engines`，使该范围真正参与 DSH 的插件兼容性检查；此前 DSH 只读取顶层 `engines.dsh`，原位置不被识别，兼容性实际靠 `peerDependencies`（`^0.2.0-rc.1`）兜底 / Moved `engines.dsh` from `dsh.engines.dsh` to the top-level `engines` in package.json so the range actually takes part in DSH's plugin compatibility check. DSH only reads top-level `engines.dsh`; the old location was ignored and compatibility fell back to `peerDependencies` (`^0.2.0-rc.1`).

### Compatibility

- 核验 DSH `0.2.3-alpha.1`：源码审计确认 `data-composer-stat="usage"`、`data-session-stats-usage`、portaled tooltip、`stats.cacheHit`/`message.turnUsage.cacheHit` 八种语言文案、`useProjection('tokenUsage')`、三个计费桶以及内置格式化器「部分命中不舍入成 100%」的承诺均未变化；插件无需功能性改动。以进程内断言复核了宿主与浏览器两侧的核心读数，尚未在 0.2.3-alpha.1 宿主上做冷启动视觉确认 / Audited DSH `0.2.3-alpha.1`: source review confirms every anchor, locale string, projection, billing bucket and the formatter's no-false-100% promise is unchanged; no functional change needed. Core readings were rechecked with in-process assertions; a cold-boot visual check on 0.2.3-alpha.1 is still outstanding.

## [0.2.5] - 2026-10-28

### Added

- 识别 DSH 0.2.2 新增的六种文案：`ja`、`es`、`fr`、`de`、`ru`、`pt`。0.2.2 把
  `ui-chat` 的 locale 从 zh/en 两种扩到八种，西语、法语、德语、俄语、葡萄牙语的
  模板还在标签后带冒号、法语在数字与 `%` 之间另有空格；插件按各语言模板原样保留
  这些分隔符，只替换数字 / The six locales 0.2.2 added are recognized. 0.2.2 widened
  `ui-chat`'s locale registration from zh/en to eight; the es, fr, de, ru and pt
  templates also carry a colon after the label and French pads the number from the
  percent sign. The plugin keeps each template's own separators verbatim and
  replaces only the digits.
- 精化 0.2.2 新增的「标签被截断时的全文 tooltip」：该气泡由内置 `Tooltip` portal
  到 `document.body`，不在 pill 之内，原先不会被扫到，悬停时仍播报内置整数，与旁边
  已精化的 pill 自相矛盾 / The full-reading tooltip 0.2.2 raises while a label is
  clipped is refined as well. The built-in `Tooltip` portals it onto
  `document.body`, outside the pill, so the row sweep never reached it and hovering
  still announced the built-in integer beside the refined pill.
- 三条回归测试：六种新语言的 pill 读数、八种语言的弹窗行项、以及 portal 气泡的
  精化与「不含该读数的 tooltip 原样保留」 / Three regression tests covering the six
  added pill readings, the eight-locale dialog terms, and the portaled bubble
  together with an unrelated tooltip staying byte-identical.

### Compatibility

- 已核验宿主差异区间 `dsh-v0.2.1-rc.4` → `dsh-v0.2.2-alpha.2`：`ui-slots` 与
  `token-format` 零改动，`data-composer-stat`、`data-session-stats-usage`、
  `conversation.composer.dock`、`ctx.slots.inject`/`register` 与
  `window.__ModuleLoader__.load` 契约全部存活，无需改动宿主侧代码 / The audited
  host corridor kept every anchor and contract this plugin uses, so the fix is
  client-copy only.
- 兼容 `0.2.0-rc.*`、`0.2.1-rc.*` 与 `0.2.2-*`。0.2.1 的两种语言与无 tooltip
  的结构仍由同一套匹配覆盖 / Compatible with `0.2.0-rc.*`, `0.2.1-rc.*` and
  `0.2.2-*`; 0.2.1's two locales and tooltip-free structure stay covered by the same
  matching.
- 在真实宿主上冷启动验证过：`0.2.2-alpha.2`（`zh` 与 `fr` 两种语言各一轮完整会话，
  pill、portal 气泡与用量弹窗三处读数一致）与 `0.2.1-rc.4`（`zh` 一轮，无 tooltip
  结构仍精化）。此前的 `0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.2-alpha.2` 结论来自包与源码
  比对 / Verified by cold-booting real hosts: `0.2.2-alpha.2` (one full turn each in
  `zh` and `fr`; pill, portaled bubble and usage dialog agreed) and `0.2.1-rc.4`
  (one `zh` turn, still refining without a tooltip).

## [0.2.4] - 2026-10-17

### Added

- GitHub Release 发布后经 Trusted Publishing（OIDC）自动发到 npm，由
  `.github/workflows/release.yml` 执行；四道语义门禁见 [RELEASING.md](RELEASING.md) /
  Publishing to npm is triggered by a GitHub Release through Trusted Publishing (OIDC) in
  `.github/workflows/release.yml`; the four semantic gates are documented in
  [RELEASING.md](RELEASING.md).
- 新增 `RELEASING.md`，记录一次性绑定与每次发版步骤 / Added `RELEASING.md` covering the
  one-time binding and the per-release steps.
- README 增加 Awesome DSH Plugin 收录徽章与 `powered by dsh` 徽章 / README badges for
  Awesome DSH Plugin and `powered by dsh`.

## [0.2.3] - 2026-10-17

### Added

- 同时识别 DSH 0.2.0 与 0.2.1 起的两种统计行锚点，两代宿主都能精化 / The reading is
  anchored in both shipped host markups, so either DSH generation refines.
- 三条回归测试：两种锚点各自生效、一次 pass 让 pill 与用量弹窗读数一致、`activity`
  pill 不被当作锚点 / Three regression tests covering both anchors, one-pass equality
  between the pill and the usage dialog, and the `activity` pill staying out of the walk.

### Fixed

- DSH 0.2.1 起 `StatsPills` 把统计行拆成每个 pill 一个 dock entry，锚点从整行容器
  `data-composer-stats` 改为单个 pill 的 `data-composer-stat`；插件原先只认旧容器，
  在新宿主上找不到锚点，底部统计行的缓存命中率回落到内置精度（「Token 用量」弹窗未
  受影响，因为 `data-session-stats-usage` 未变）/ From DSH 0.2.1, `StatsPills`
  registers one dock entry per pill and marks each with `data-composer-stat` instead of
  the former whole-row `data-composer-stats` container. The plugin knew only the old
  container, so on the new host it found no anchor and the composer reading fell back to
  the built-in precision. The token-usage dialog was unaffected because
  `data-session-stats-usage` did not change.

### Compatibility

- 已验证 / Verified on DSH `0.2.0-rc.2` 与 / and `0.2.1-rc.2`.

## [0.2.2] - 2026-10-04

### Added

- 首次发布到 npm，可直接按包名安装 / First release published to npm, installable by
  package name: `dsh plugin --profile web add dsh-cache-hit-precision`.

## [0.2.1] - 2026-10-04

### Added

- 首个以 `dsh-cache-hit-precision` 名义发布的版本 / First release under the
  `dsh-cache-hit-precision` name.
- 缓存命中率原位精化到三位小数，覆盖 composer 统计行、「Token 用量」弹窗与底部状态行 /
  In-place three-decimal cache-hit readout in the composer stats pills, the token-usage
  dialog, and the status line.
- 精确整数半进位舍入，分母与 DSH 计费口径完全一致 / Half-up rounding in exact integer
  arithmetic; denominator identical to DSH's own billing buckets.

### Compatibility

- 适配 / Adapted to DSH `0.2.0-rc.*`.

[Unreleased]: https://github.com/vrvtvy/dsh-cache-hit-precision/compare/v0.2.5...HEAD
[0.2.5]: https://github.com/vrvtvy/dsh-cache-hit-precision/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/vrvtvy/dsh-cache-hit-precision/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/vrvtvy/dsh-cache-hit-precision/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/vrvtvy/dsh-cache-hit-precision/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/vrvtvy/dsh-cache-hit-precision/releases/tag/v0.2.1
