# Changelog

本文件记录本包的所有重要变更 / All notable changes to this package.

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[Semantic Versioning](https://semver.org/lang/zh-CN/)。
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
package adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/vrvtvy/dsh-cache-hit-precision/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/vrvtvy/dsh-cache-hit-precision/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/vrvtvy/dsh-cache-hit-precision/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/vrvtvy/dsh-cache-hit-precision/releases/tag/v0.2.1
