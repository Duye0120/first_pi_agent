## 重写 Chela 旧邮箱提交作者

时间：2026-04-26 00:12

改了什么：
- 将当前 `main` 分支上 142 个 `Chela Dev <doye@chela.dev>` 提交重写为 `Duye <superdoye0120@outlook.com>`。
- 保留原 author date 和 committer date，避免贡献图日期集中到重写当天。
- 创建本地备份分支 `codex/backup-author-rewrite-20260426-000319`，保留重写前的 `main` 指向。
- 恢复重写前暂存的工作区改动，保留已有 `docs/changes/2026-04-25/changes.md` 未提交记录。

为什么改：
- GitHub contribution 统计要求提交作者邮箱关联到 GitHub 账号；旧 Chela 邮箱未归属到当前账号，导致已推送提交没有计入贡献图。

涉及文件：
- `.git/refs/heads/main`
- `.git/refs/heads/codex/backup-author-rewrite-20260426-000319`
- `docs/changes/2026-04-26/changes.md`

结果：
- 本地 `main` 已完成作者重写，`git rev-list --count --author="doye@chela.dev" HEAD` 返回 `0`。
- 本地 `main` 与 `origin/main` 形成 `ahead 142, behind 142` 的历史分叉，需要网络恢复后执行 `git push --force-with-lease origin main`。
- 当前机器访问 GitHub 失败：HTTPS 报 `failed to open socket: Unknown error 10106`，SSH 报 `Could not resolve hostname github.com`。
