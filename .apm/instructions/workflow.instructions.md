---
description: 開発フロー・ローカル AI ワークフロー・PR レビュー方針・GitHub 運用
applyTo: "**"
---

# ワークフロー

## 開発の流れ

1. ブランチ作成
2. 開発
3. PR 作成
4. PR レビュー
5. PR マージ

（タグ運用・リリースノート自動生成は本リポジトリでは未導入のため対象外）

## ローカル開発ワークフロー（AI エージェント向け、superpowers ベース）

[superpowers](https://github.com/obra/superpowers) 系スキル（`verification-before-completion` / `requesting-code-review` / `receiving-code-review` / `finishing-a-development-branch`）が利用可能であることを前提とする。利用できない場合はユーザーに案内し、本ワークフローを中断する。

実装完了と判断した時点で、以下を順に実行する（前ステップ完了まで次に進まない）:

1. `verification-before-completion`（lint / typecheck / 実機動作の検証を完遂）
2. `requesting-code-review`
3. `receiving-code-review`（フィードバック対応）
4. `finishing-a-development-branch`（選択肢「2」で PR 作成）

### PR レビュー応答ループ（git push 毎）

`gh api graphql` で未 resolve なレビュースレッドを列挙する（`gh pr view --json reviews,comments` は `isResolved` を返さないので使わない）。 `isResolved: false` かつ author が bot（例: `copilot-pull-request-reviewer[bot]`）のスレッドを対象に:

- **妥当な指摘**: 修正 → コミット → 該当インラインコメントに返信（本文に対応コミット SHA を**前後半角空白付き**で記載しリンク化）→ スレッドを resolve。
- **不当と判断**: コードは変更せず、理由を日本語で具体的に記載 → resolve。

全スレッドが resolve されるまでループ。次の push でも再実行する。

```bash
# 返信
gh api repos/<owner>/<repo>/pulls/<pr>/comments/<comment_database_id>/replies -f body='対応しました abc1234 '
# resolve
gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -F id=<thread_node_id>
```

`<comment_database_id>` は GraphQL の `databaseId`（数値）。GraphQL Node ID（`PRRC_...`）は REST では受け付けない。

## PR レビュー時のコミュニケーション

レビューコメントの文章ルール（日本語・GitHub Suggestion 機能・課題を文頭に記述など）は共通パッケージ `ROhta/apm-config/base`（`pr-review.instructions.md`）に集約。生成物は `.github/instructions/pr-review.instructions.md` / `.claude/rules/pr-review.md`。

## GitHub 運用

- コードオーナー: すべて @ROhta
- セキュリティ: GitHub Security Policy を参照
- （GitHub Actions / Pages / 外形監視は現状未導入）
