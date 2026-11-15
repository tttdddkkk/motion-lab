# 0015: Netlify の本番デプロイを、GitHub Actions の手動実行だけにする

- 状態: 採用
- 日付: 2026-11-15

## 背景

- Netlify はクレジット制で、本番デプロイ1回に15クレジットかかる。月300クレジットのうち、短期間で半分を使った
- Netlify の Git 連携による自動ビルドは、push のたびに消費する。デプロイ回数を自分で決められない
- 公開URLは GitHub Pages（ADR 0006 / 0010）。Netlify の本番サイトは、必要なときにだけ更新できればよい

## 決定

- `.github/workflows/deploy-netlify.yml` を追加する。トリガーは `workflow_dispatch` のみで、「確認した」のチェックが無いと失敗する。main 以外のブランチからは実行できない
- ビルドは不要な静的サイトのため、`netlify.toml` の `[build] command` と同じコピー処理で `dist/` を作り、Netlify CLI（版を固定）で `--prod` デプロイする
- 認証情報（`NETLIFY_AUTH_TOKEN` / `NETLIFY_SITE_ID`）は GitHub の Secrets に置く
- マージ後、動作確認ができたら、Netlify 側の Git 連携による自動ビルドを止める（作業者が画面で行う）

## 検討した他の案

- 自動ビルドを続け、ビルドの対象を絞る（Netlify の ignore 設定）: 判定条件の管理が増え、消費の見通しが立ちにくい
- 本番デプロイをやめる: 今回は、必要なときに更新できる手段を残す

## 結果

- 本番デプロイの回数を、自分の実行回数に等しくできる
- 注意: Netlify 側の自動ビルドを止めると、PR の Deploy Preview（ADR 0010 / CLAUDE.md「PR 作成後の流れ」）も発行されなくなる可能性がある。止める範囲（本番ブランチのみ／Deploy Preview も）は、Netlify の画面で選べる範囲に従って作業者が決める。Deploy Preview をやめる場合は、ADR 0010 を置き換える ADR を追加する
- ワークフローの `dist/` 作成処理は `netlify.toml` と二重管理になる。片方を変えたらもう片方も合わせる
