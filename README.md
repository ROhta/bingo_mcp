# bingo_mcp

bingo を MCP Apps で呼ぶ。チャットで「ビンゴやりたい」と言うと、抽選機＋5×5 ビンゴカードのインタラクティブ widget が描画される。

抽選ロジック（`NumberList`）と演出音は [ROhta/bingo](https://github.com/ROhta/bingo) を submodule (`vendor/bingo`) として忠実に再利用している。

## ドキュメント

プロジェクトに関する指示・設計（アーキテクチャ・乱数の公平性・状態検証境界・運用ルール）は AI エージェント向け指示と共通化し、[`.apm/instructions/`](.apm/instructions/) 配下に集約している。これらは [microsoft/apm](https://github.com/microsoft/apm)（Agent Package Manager）で管理され、`apm compile` で Claude Code / Codex / GitHub Copilot 向けファイル（`CLAUDE.md` / `AGENTS.md` / `.claude/rules/` / `.github/instructions/`）に展開される。

| ファイル                                                         | 内容                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`apm`](.apm/instructions/apm.instructions.md)                   | APM 運用ルール（SoT・追跡境界・MCP 依存・プラグイン）                     |
| [`architecture`](.apm/instructions/architecture.instructions.md) | 責務分担・vendored 依存・乱数と公平性・状態検証境界・MCP ツール・状態権威 |
| [`widget`](.apm/instructions/widget.instructions.md)             | widget の UI/ビルド（CSS・CSP・mp3 インライン・esbuild）                  |
| [`development`](.apm/instructions/development.instructions.md)   | 環境構築・ビルド・lint・起動                                              |
| [`workflow`](.apm/instructions/workflow.instructions.md)         | 開発フロー・AI ワークフロー・PR レビュー・GitHub 運用                     |

## 開発

```sh
git submodule update --init   # vendor/bingo を取得
corepack enable
pnpm install --frozen-lockfile

pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
pnpm build      # widget(esbuild) → dist/mcp-app.html、server(tsc) → dist/server
```

詳細は [`.apm/instructions/development.instructions.md`](.apm/instructions/development.instructions.md) を参照。
