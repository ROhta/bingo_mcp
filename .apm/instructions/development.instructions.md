---
description: 環境構築・ビルド・テスト・lint・MCP サーバーとしての起動
applyTo: "**/{package.json,pnpm-lock.yaml,tsconfig*.json,*.ts}"
---

# 開発環境

## 前提ツール

- [mise](https://mise.jdx.dev)（**node / pnpm / apm を管理**。バージョンは `mise.toml` で固定し `mise.lock` でチェックサム固定。`mise trust && mise install` で取得。tools を PATH に乗せるにはシェルで `mise activate` するか `mise exec -- <cmd>`）
- [uv](https://docs.astral.sh/uv/)（`uvx` 経由で serena / semgrep を起動。mise 管理外）

## 環境構築

```bash
git clone <repo> && cd bingo_mcp
git submodule update --init        # vendor/bingo を取得
mise trust && mise install         # node / pnpm / apm を取得（mise.toml で固定）
pnpm install --frozen-lockfile
```

## ビルド・テスト

```bash
pnpm build       # build:widget(esbuild) → dist/mcp-app.html、build:server(tsc) → dist/server
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
```

## MCP サーバーとしての起動

`bin` の `bingo-mcp`（`dist/server/index.js`）は `StdioServerTransport` で動く stdio MCP サーバー。MCP ホスト（claude.ai web / Claude Desktop）に登録して使う。登録後、チャットで「ビンゴやりたい」と話しかけると widget が描画される。

## Lint / 整形

- eslint と prettier が git commit 時に husky `pre-commit` ＋ lint-staged で発火する。
- prettier 設定と lint-staged 設定は `package.json` に集約（一覧性優先、設定ファイルを増やさない）。
- eslint は独自ルールを最小化し recommend 準拠（`eslint.config.mjs`、flat config）。widget=browser / server=node でディレクトリ別に globals を当てる。
- **eslint / vitest は `.gitignore` を見ない**ため、APM 生成物（`.claude/` `.agents/` `.codex/` `.github/`）と `apm_modules/`・`vendor/` を明示的に探索対象外にすること（eslint は `ignores`、vitest は `include: ["src/**/*.test.ts"]` で自前テストに限定）。これを怠ると `apm install` 後に生成物が lint/test されて大量に失敗する。prettier はデフォルトで `.gitignore` を尊重するため別途 `.prettierignore` で補う。

## tsconfig

- `@tsconfig/strictest` を継承し、さらに最厳フラグ群（`isolatedDeclarations` / `verbatimModuleSyntax` / `erasableSyntaxOnly` / `noUncheckedSideEffectImports` 等）を適用。
- `tsconfig.json`（型チェック用、`noEmit`）と `tsconfig.server.json`（server 出力用）の 2 本。vendored alias は paths で配線。
