# 发布流程 / Releasing

本仓库用 **GitHub Release 触发**自动发布到 npm，走 **Trusted Publishing（OIDC）**：
workflow 不保存任何 npm token，靠 GitHub Actions 的短期身份证明向 npm 换取一次发布凭证。

This repository publishes to npm from a **GitHub Release** through **Trusted Publishing (OIDC)**:
the workflow stores no npm token and exchanges GitHub Actions' short-lived identity for a
one-time publish credential.

## 一次性配置 / One-time setup

在 npm 上给包绑定本仓库的 workflow（**只做一次**，之后无需再动）：

1. 打开 <https://www.npmjs.com/package/dsh-cache-hit-precision/access>
2. 在 **Trusted Publisher** 处选择 **GitHub Actions**
3. 填写：

   | 字段 | 值 |
   | --- | --- |
   | Organization or user | `vrvtvy` |
   | Repository | `dsh-cache-hit-precision` |
   | Workflow filename | `release.yml` |
   | Environment name | 留空 / leave empty |

4. 勾选 **Allow publish**，保存

也可以用 CLI（需要浏览器完成一次性验证）：

```sh
npm trust github dsh-cache-hit-precision \
  --repo vrvtvy/dsh-cache-hit-precision \
  --file release.yml --allow-publish \
  --registry=https://registry.npmjs.org/
```

配置好之后，`npm view dsh-cache-hit-precision trustedPublisher` 不再是 `null`。

## 每次发版 / Every release

```sh
# 1. 提升版本号（唯一需要手改的地方）
npm version patch --no-git-tag-version   # 或 minor / major

# 2. 更新 CHANGELOG.md

# 3. 提交并推送
git add -A && git commit -m "chore: release vX.Y.Z" && git push

# 4. 打标签并推送
git tag -a vX.Y.Z -m "dsh-cache-hit-precision X.Y.Z" && git push origin vX.Y.Z

# 5. 建 GitHub Release（发布即触发 workflow）
gh release create vX.Y.Z --title "vX.Y.Z — 标题" --notes-file notes.md
```

`release.yml` 随后自动完成：跑测试 → 四道语义门禁 → `npm publish` → 回查 registry 确认可安装。

## 语义门禁 / What the workflow refuses

发布前逐条检查，任一条不满足即失败：

1. **标签匹配**：GitHub Release 的 tag 必须等于 `v${package.json.version}`
2. **预发布状态一致**：版本含 `-` 后缀（如 `0.3.0-beta.1`）时，Release 必须勾选 prerelease；反之亦然
3. **dist-tag 路由**：预发布只发到 `next`，稳定版才发到 `latest`
4. **latest 不回退**：稳定版发布前比对现有 `latest`，小于或等于它的一律拒绝

## 预发布 / Prereleases

版本带后缀时（`0.3.0-beta.1`），`gh release create` 要加 `--prerelease`，包会发到 `next` 标签：

```sh
gh release create v0.3.0-beta.1 --prerelease --title "v0.3.0-beta.1" --notes-file notes.md
npm install dsh-cache-hit-precision@next
```

## 失败恢复 / Recovery

- **门禁失败**：修正后删掉 Release 重建，或 `gh workflow run release.yml -f tag=vX.Y.Z` 手动补发
- **npm 上已存在该版本**：不能覆盖。撤回 Release、修版本号、发布新补丁版
- **workflow 根本没跑**：确认 Release 是 **published** 状态（draft 不触发），再手动 `gh workflow run`

## 为什么不用 npm token / Why not a token

npm 已禁用 classic token 创建，granular token 的写权限默认强制 2FA，
且绕过 2FA 的选项正在被逐步收紧。Trusted Publishing 用每次构建临时签发的 OIDC 凭证替代长期密钥，
泄漏面更小，并自动附带 **provenance** 证明包确实由这个仓库的这次 commit 构建。
