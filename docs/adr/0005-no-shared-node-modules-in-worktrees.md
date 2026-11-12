# 0005: ワークツリーで `node_modules` を共有しない

- 状態: 採用
- 日付: 2026-11-12

## 背景

Claude Code のワークツリー（`claude -w`、`.claude/worktrees/`）は Git 管理下のファイルだけを取り出すため、`node_modules` がない。

## 決定

ワークツリーごとに `npm ci` を実行する。`.claude/worktrees/` は `.gitignore` に入れる。

## 検討した他の案

- `worktree.symlinkDirectories: ["node_modules"]` で本体と共有する: ワークツリーで依存を変えると本体にも影響すると考えられる（公式ドキュメントに明記はない）。Dependabot の更新を試す用途と相性が悪い

## 結果

- `npm ci` はキャッシュが効いていれば約1秒（2026-11-12 に手元で実測）
- ワークツリー1つあたり約 125MB のディスクを使う
