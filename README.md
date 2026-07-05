# bingo_mcp

bingo を MCP Apps で呼ぶ。チャットで「ビンゴやりたい」と言うと、抽選機＋5×5 ビンゴカードのインタラクティブ widget が描画される。

抽選ロジック（`NumberList`）と演出音は [ROhta/bingo](https://github.com/ROhta/bingo) を submodule (`vendor/bingo`) として忠実に再利用している。

## ドキュメント

このリポジトリ固有の指示・設計（アーキテクチャ・乱数の公平性・状態検証境界・widget ビルド）は AI エージェント向け指示と共通化し、[`.apm/instructions/`](.apm/instructions/) 配下に集約している。これらは [microsoft/apm](https://github.com/microsoft/apm)（Agent Package Manager）で管理され、`apm compile` で Claude Code / Codex / GitHub Copilot 向けファイル（`CLAUDE.md` / `AGENTS.md` / `.claude/rules/` / `.github/instructions/`）に展開される。

| ファイル                                                         | 内容                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`architecture`](.apm/instructions/architecture.instructions.md) | 責務分担・vendored 依存・乱数と公平性・状態検証境界・MCP ツール・状態権威 |
| [`widget`](.apm/instructions/widget.instructions.md)             | widget の UI/ビルド（CSS・CSP・mp3 インライン・esbuild）                  |
| [`development`](.apm/instructions/development.instructions.md)   | 環境構築・ビルド・lint・起動                                              |

他リポジトリ共通の指示（言語ルール・PR レビュー観点・開発 / ローカル AI ワークフロー・APM 運用ルール）は共通パッケージ [`ROhta/apm-config`](https://github.com/ROhta/apm-config) から `apm install` で配信され、ローカルの `.apm/instructions/` には保持しない。共通指示を変更したい場合は apm-config を編集する。共通 MCP サーバー（context7 / serena / deepwiki / chrome-devtools）も apm-config/mcp-toolkit から配信される。うち chrome-devtools は transitive なプラグイン参照のため、導入時は `apm install --trust-transitive-mcp` が必要（初回は解決のみで、2 回目の実行で設定が完了することがある）。

## 開発

```sh
git submodule update --init   # vendor/bingo を取得
mise trust && mise install    # node / pnpm / apm を取得（mise.toml で固定）
pnpm install --frozen-lockfile

pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
pnpm build      # widget(esbuild) → dist/mcp-app.html、server(tsc) → dist/server
```

詳細は [`.apm/instructions/development.instructions.md`](.apm/instructions/development.instructions.md) を参照。
