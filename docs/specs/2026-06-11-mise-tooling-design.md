# 設計書: mise による開発ツール（apm / node / pnpm）管理

- 日付: 2026-06-11
- ステータス: ドラフト（実装着手前のレビュー待ち）
- 対象リポジトリ: `ROhta/bingo_mcp`（本リポジトリ）
- 前提: APM（microsoft/apm）導入済み（PR #12）。本件はその開発ツールチェーンを [mise](https://mise.jdx.dev) で一元管理する。

## 1. 目的

開発に必要なツール（**node / pnpm / apm**）のバージョンを [mise](https://mise.jdx.dev)（`mise.toml`）で宣言的・再現的に管理する。現状は node 直インストール＋ pnpm を corepack 経由で運用しており、バージョンの固定・共有が暗黙的。これを mise に一本化し、 `mise install` 一発で全員が同一バージョンを得られる状態にする。

## 2. スコープ（確定した意思決定）

| 論点           | 決定                                                               |
| -------------- | ------------------------------------------------------------------ |
| 管理対象       | **node / pnpm / apm の3ツール**を mise で管理                      |
| pnpm 機構      | **mise が pnpm を直接管理**（corepack は廃止）                     |
| バージョン固定 | **完全固定**：node `24.16.0` / pnpm `11.2.2` / apm `0.19.0`        |
| 再現性         | **`mise.lock` を採用**（解決バージョン＋チェックサムを固定・追跡） |
| 設定ファイル   | `mise.toml`（リポジトリ追跡）                                      |

### 非スコープ（YAGNI）

- CI（bingo_mcp に未導入）への mise 組込み。
- uv（serena/semgrep MCP 用）の mise 管理 — 本件はユーザー指定の apm/node/pnpm に限定（将来 `mise use uv` で取り込み可）。
- `package.json` の `engines` / `packageManager` フィールド追加（mise.toml と二重管理になるため不採用）。
- mise のタスクランナー化（`[tasks]`）。

## 3. `mise.toml` 仕様

```toml
[tools]
node = "24.16.0"
pnpm = "11.2.2"
"github:microsoft/apm" = "0.19.0"

[settings]
lockfile = true
```

### バックエンドの根拠（調査結果）

- **node** → mise コアプラグイン（`mise registry` で `core:node`）。
- **pnpm** → mise registry に登録あり（`aqua:pnpm/pnpm` / `npm:pnpm`）。corepack 不使用。
- **apm** → **`github:` backend**。apm は mise registry に未登録（名称衝突回避）のためフルに `github:microsoft/apm` と指定する。microsoft/apm のリリースアセットは `apm-linux-x86_64.tar.gz` 等の標準命名（tag は `v0.19.0`）。**`ubi:` は使わない**: apm は PyInstaller バンドル（実行に `_internal/libpython3.12.so.1.0` 等を要する複数ファイル構成）で、`ubi:` は tarball の単一トップレベルバイナリしか展開しないため実行時に共有ライブラリ欠落で壊れる。`github:` は tarball 全体（`_internal/` 含む）を展開する。加えて mise 2026.6.1 は `ubi:` を deprecated とし `github:` を推奨する（実装時に実証）。

### 実装で確定した点（当初 ubi 想定からの訂正）

- **apm backend は `github:`**（`ubi:` は PyInstaller バンドルを壊すため不可。上記参照）。`exe` / `extract_all` オプションは不要。
- **`mise.lock` の生成は `mise lock` を明示実行**する。`[settings] lockfile = true` を置き `mise install` しても自動生成されないため、`mise lock` で生成・更新する（`mise.toml` の設定は意図マーカーとして残す）。コミット済み `mise.lock` があれば、各環境の `mise install` はそれを参照して再現する。

## 4. `mise.lock`（チェックサムロック）

- `mise.lock` を**追跡**し、解決バージョン＋チェックサムを固定する（`apm.yml` の SHA ピン方針と同じ再現性思想）。
- コミット済み `mise.lock` を参照して各環境の `mise install` がチェックサム検証付きで再現する（バージョン自体は `mise.toml` の exact 指定でも保証される）。
- 生成・更新は **`mise lock` を明示実行**する（`mise install` だけでは自動生成されない。§3 の訂正参照）。

## 5. corepack 廃止と既存ドキュメントの更新

mise 採用に伴い、以下の Source of Truth（`.apm/instructions/`）と README を更新する。更新後 `apm install` / `apm compile` で生成物（`.claude/rules/` 等、gitignore 対象）を再生成する。

### `development.instructions.md`（SoT）

- **前提ツール**: 「Node.js ＋ pnpm（corepack）」を「**mise（node/pnpm/apm を管理）** ＋ uv（MCP サーバー用、別途）」に変更。apm CLI は mise 管理になるので「手動導入」の記述を削除。
- **環境構築**: 手順を以下へ。

  ```bash
  git clone <repo> && cd bingo_mcp
  git submodule update --init        # vendor/bingo を取得
  mise trust && mise install         # node / pnpm / apm を取得（バージョンは mise.toml 固定）
  pnpm install --frozen-lockfile
  ```

- **Lint/整形・tsconfig 節**は変更なし。

### `apm.instructions.md`（SoT）

- 「前提ツール」に近い記述で apm を「**mise 管理（`github:microsoft/apm`、`mise.toml` で固定）**」と明記。`apm install` / `apm compile` の運用自体は不変。

### `README.md`

- 「## 開発」節の `corepack enable` を `mise trust && mise install` に置換。

## 6. 運用上の注意（設計に明記）

- **`mise trust`**: `mise.toml` はセキュリティ上、初回に `mise trust` が必要（未 trust だと mise は設定を読まない）。setup 手順に含める。
- **PATH 反映**: ツールを PATH に乗せるにはシェルで mise を activate（`mise activate <shell>`）するか、`mise exec -- <cmd>` 経由で実行する。
- **husky pre-commit との関係**: `.husky/pre-commit` は `pnpm exec lint-staged` を実行する。これはシェルで mise が activate 済みであることを前提とする。mise 非 activate 環境（一部 GUI git クライアント等）では `pnpm` が解決されずフックが失敗し得る点に注意（必要なら将来 `mise exec -- pnpm ...` 化を検討。本件では既存どおりとし注記に留める）。
- **既存の手動 apm（`/usr/local/bin/apm`）**: mise activate 時は mise の shim が PATH 優先になるため共存して問題ない。手動版の撤去は任意（本スコープ外）。

## 7. 検証計画（実装フェーズ）

1. `mise trust && mise install` が3ツールを取得し、`mise.lock` が生成される。
2. バージョン一致: `node -v`=v24.16.0 / `pnpm -v`=11.2.2 / `apm --version`=0.19.0。
3. `github:microsoft/apm` が `apm`（PyInstaller バンドル）を完全展開し、`apm install` / `apm compile` が従来どおり動作する。
4. `pnpm install --frozen-lockfile` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm exec eslint .` / `pnpm exec prettier --check .` が全て通る。
5. corepack 無効環境でも上記が成立する（mise-managed pnpm のみで完結）。
6. `.gitignore` に `mise.local.toml`（および dot-prefix 版 `.mise.local.toml`）を追加し、追跡されないこと。mise は両形式を local override として認識する。

## 8. 成果物一覧（新規追跡・変更）

- `mise.toml`（新規）
- `mise.lock`（新規・生成物だが再現性のため追跡）
- `.gitignore`（`mise.local.toml` ＋ `.mise.local.toml` を追記）
- `.apm/instructions/development.instructions.md`（SoT 更新）
- `.apm/instructions/apm.instructions.md`（SoT 更新）
- `README.md`（開発節の更新）
