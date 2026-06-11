# mise による開発ツール管理 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** node / pnpm / apm を [mise](https://mise.jdx.dev)（`mise.toml`）で完全固定し、`mise install` 一発で再現可能にする（corepack 廃止）。

**Architecture:** `mise.toml`（[tools] に node 24.16.0 / pnpm 11.2.2 / `github:microsoft/apm` 0.19.0、[settings] lockfile=true）を SoT とし、`mise.lock`（`mise lock` で生成）でチェックサム固定。corepack 廃止に伴い `.apm/instructions/`（development / apm）と README の手順を mise ベースに更新する。

**Tech Stack:** mise 2026.6.1（github backend / core:node / aqua:pnpm）、pnpm 11.2.2、node 24.16.0、apm 0.19.0。

**設計書:** `docs/specs/2026-06-11-mise-tooling-design.md`（PR #13）

---

## 重要な前提・順序制約

- mise は導入済み（`mise --version` → 2026.6.1）。ブランチ `docs/mise-tooling-design` 上で作業（PR #13、push して継続）。
- **apm は mise registry 未登録**のため `github:microsoft/apm` とフル指定する。**`ubi:` は不可**: apm は PyInstaller バンドル（`_internal/` 配下の共有ライブラリを要する複数ファイル）で、`ubi:` は単一バイナリしか展開せず実行時に壊れる。`github:` は tarball 全体を展開する（mise 2026.6.1 は ubi を deprecated とし github 推奨）。
- **`mise.lock` は `mise lock` を明示実行して生成**する（`[settings] lockfile=true` ＋ `mise install` だけでは自動生成されない）。
- PATH 非依存に検証するため、バージョン確認は `mise exec -- <cmd>` 経由で行う（シェルの mise activate 状態に依存しない）。

---

## ファイル構成（作成・変更一覧）

| パス                                            | 操作             | 責務                                                                          |
| ----------------------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| `mise.toml`                                     | 作成             | node/pnpm/apm のバージョン固定（[tools]）＋ lockfile 有効化（[settings]）     |
| `mise.lock`                                     | 生成（追跡）     | 解決バージョン＋チェックサム固定（再現性）                                    |
| `.gitignore`                                    | 変更（末尾追記） | `mise.local.toml` ＋ `.mise.local.toml`（個人オーバーライド）を追跡対象外に   |
| `.apm/instructions/development.instructions.md` | 変更             | 前提ツール・環境構築を corepack→mise に更新（SoT）                            |
| `.apm/instructions/apm.instructions.md`         | 変更             | apm CLI が mise 管理である旨を追記（SoT）                                     |
| `README.md`                                     | 変更             | 「## 開発」の `corepack enable` を `mise trust && mise install` に置換        |
| `.husky/pre-commit`                             | 変更             | corepack 廃止で pnpm 未解決になるため `mise exec -- pnpm exec lint-staged` に |

---

## Task 0: 前提確認

**Files:** なし（検証のみ）

- [ ] **Step 1: mise とブランチを確認**

Run:

```bash
mise --version                 # Expected: 2026.6.1 以上
git branch --show-current      # Expected: docs/mise-tooling-design
git rev-parse --short main     # base 確認
```

Expected: いずれも成功。ブランチが違う場合は `git checkout docs/mise-tooling-design`。

---

## Task 1: `mise.toml` ＋ `mise install` ＋ `mise.lock` ＋ `.gitignore`

**Files:**

- Create: `mise.toml`
- Create（生成）: `mise.lock`
- Modify: `.gitignore`

- [ ] **Step 1: `mise.toml` を作成**

```toml
[tools]
node = "24.16.0"
pnpm = "11.2.2"
"github:microsoft/apm" = "0.19.0"

[settings]
lockfile = true
```

- [ ] **Step 2: `.gitignore` に mise 個人オーバーライドを追記**

`.gitignore` 末尾に追記する。

```gitignore

# mise の個人オーバーライド（共有しない）
mise.local.toml
.mise.local.toml
```

- [ ] **Step 3: mise を trust して install**

Run:

```bash
mise trust
mise install
```

Expected: node 24.16.0 / pnpm 11.2.2 / apm 0.19.0 が取得される。`unable to find` 等のエラーが出た場合は Step 5 のフォールバックへ。

- [ ] **Step 4: バージョンと apm 展開を検証（PATH 非依存）**

Run:

```bash
mise exec -- node --version      # Expected: v24.16.0
mise exec -- pnpm --version      # Expected: 11.2.2
mise exec -- apm --version       # Expected: ...version 0.19.0...
```

Expected: 3つとも一致。`apm --version` が「command not found」や別バージョンなら Step 5 へ。

- [ ] **Step 5: apm が `github:` backend で動くこと（ubi は不可）**

apm backend は **`github:`** を使う（Step 1 で指定済み）。`ubi:` は使わないこと。理由: apm は PyInstaller バンドルで、実行に `_internal/libpython3.12.so.1.0` 等の同梱共有ライブラリを要する。`ubi:` は tarball の単一トップレベルバイナリしか展開しないため、起動時に `libpython3.12.so.1.0` 欠落で壊れる（この症状が出たら ubi を使っている）。`github:` は tarball 全体（`_internal/` 含む）を展開する。mise 2026.6.1 は `ubi:` を deprecated とし `github:` を推奨する。

Step 4 の `mise exec -- apm --version` が 0.19.0 を返せば OK。

- [ ] **Step 6: `mise.lock` を生成（`mise lock` を明示実行）**

`[settings] lockfile = true` を置いても `mise install` だけでは `mise.lock` は自動生成されない。`mise lock` で明示生成する。

Run:

```bash
mise lock                                   # mise.lock を生成/更新
ls -l mise.lock && echo "lockfile exists"   # 生成確認
```

Expected: `mise.lock` が生成され、node / pnpm / `github:microsoft/apm` の解決バージョンと各プラットフォームの sha256 チェックサムが記録されている（`cat mise.lock` で確認、少なくとも実行環境の linux-x64 エントリがあること）。`mise.toml` の `[settings] lockfile=true` は意図マーカーとして残す。コミット済み `mise.lock` があれば各環境の `mise install` がそれを参照して再現する。

- [ ] **Step 7: コミット**

```bash
git add mise.toml mise.lock .gitignore
git commit -m "feat: mise で node/pnpm/apm を管理（mise.toml + mise.lock、corepack 廃止）"
```

（pre-commit の lint-staged が `mise.toml` を prettier 対象にするか確認: `.prettierignore` 未指定なら `*.toml` は lint-staged のグロブ `*.{ts,mjs,cjs}` / `*.{html,css,json,md}` / `!(pnpm-lock).{yml,yaml}` のいずれにもマッチせず整形対象外。`mise.lock` も同様に対象外。よって整形干渉は無い。）

---

## Task 2: SoT 指示書（development / apm）を mise ベースに更新

**Files:**

- Modify: `.apm/instructions/development.instructions.md`
- Modify: `.apm/instructions/apm.instructions.md`

- [ ] **Step 1: `development.instructions.md` の「前提ツール」を置換**

以下の3行（現状）:

```markdown
- [Node.js](https://nodejs.org/)（`package.json` の `engines` 指定に従う） ＋ pnpm（`corepack enable`）
- [uv](https://docs.astral.sh/uv/)（`uvx` 経由で serena / semgrep を起動）
- [apm CLI](https://github.com/microsoft/apm)（AI エージェント設定の管理。`apm install` / `apm compile`）
```

を以下へ:

```markdown
- [mise](https://mise.jdx.dev)（**node / pnpm / apm を管理**。バージョンは `mise.toml` で固定し `mise.lock` でチェックサム固定。`mise trust && mise install` で取得。tools を PATH に乗せるにはシェルで `mise activate` するか `mise exec -- <cmd>`）
- [uv](https://docs.astral.sh/uv/)（`uvx` 経由で serena / semgrep を起動。mise 管理外）
```

- [ ] **Step 2: `development.instructions.md` の「環境構築」を置換**

以下のコードブロック（現状）:

```bash
git clone <repo> && cd bingo_mcp
git submodule update --init        # vendor/bingo を取得
corepack enable
pnpm install --frozen-lockfile
```

を以下へ:

```bash
git clone <repo> && cd bingo_mcp
git submodule update --init        # vendor/bingo を取得
mise trust && mise install         # node / pnpm / apm を取得（mise.toml で固定）
pnpm install --frozen-lockfile
```

- [ ] **Step 3: `apm.instructions.md` の「ローカルでの作業」末尾に mise 管理の注記を追加**

「`apm.lock.yaml` を除く生成物は `.gitignore` 対象のためコミットには含まれない。」の直後に、以下の段落を追加する。

```markdown
> apm CLI 自体は **mise 管理**（`mise.toml` の `github:microsoft/apm`、バージョン固定）。`mise install` で導入される。
```

- [ ] **Step 4: 生成物を再生成して整合を確認**

Run:

```bash
apm install >/dev/null 2>&1 && apm compile >/dev/null 2>&1 && echo "regenerated"
git status --porcelain | grep -E '(CLAUDE|AGENTS|\.claude/|\.mcp|\.codex|apm_modules|\.agents|\.github/instructions|\.vscode)' && echo "LEAK!" || echo "no leak (OK)"
```

Expected: `regenerated` ＋ `no leak (OK)`（生成物は gitignore 済みで追跡されない）。

- [ ] **Step 5: コミット**

```bash
# SoT 指示書を編集すると apm install で再生成された .claude/rules・.github/instructions の
# 内容ハッシュが変わり apm.lock.yaml の local_deployed_file_hashes も更新されるため、一緒にコミットする。
git add .apm/instructions/development.instructions.md .apm/instructions/apm.instructions.md apm.lock.yaml
git commit -m "docs(apm): 開発前提ツールを corepack から mise に更新（SoT）"
```

---

## Task 3: README の開発節を更新

**Files:**

- Modify: `README.md`

- [ ] **Step 1: `README.md` の「## 開発」コードブロックを置換**

以下（現状）:

```sh
git submodule update --init   # vendor/bingo を取得
corepack enable
pnpm install --frozen-lockfile

pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
pnpm build      # widget(esbuild) → dist/mcp-app.html、server(tsc) → dist/server
```

を以下へ（`corepack enable` → `mise trust && mise install`）:

```sh
git submodule update --init   # vendor/bingo を取得
mise trust && mise install    # node / pnpm / apm を取得（mise.toml で固定）
pnpm install --frozen-lockfile

pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
pnpm build      # widget(esbuild) → dist/mcp-app.html、server(tsc) → dist/server
```

- [ ] **Step 2: コミット**

```bash
git add README.md
git commit -m "docs: README の開発手順を mise ベースに更新"
```

---

## Task 4: 最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: mise がツールを正しく提供する（PATH 非依存）**

Run:

```bash
mise exec -- node --version    # v24.16.0
mise exec -- pnpm --version    # 11.2.2
mise exec -- apm --version     # 0.19.0
```

Expected: 3つとも一致。

- [ ] **Step 2: mise install の冪等性 ＋ mise.lock 安定性**

Run:

```bash
mise install >/dev/null 2>&1
git diff --stat mise.lock mise.toml
```

Expected: 差分ゼロ（再実行しても mise.lock / mise.toml が変わらない）。

- [ ] **Step 3: 既存のビルド/テスト/型/整形が通る（mise-pnpm で完結）**

Run:

```bash
mise exec -- pnpm install --frozen-lockfile >/dev/null 2>&1 && echo "✓ install"
mise exec -- pnpm typecheck >/dev/null 2>&1 && echo "✓ typecheck"
mise exec -- pnpm test 2>&1 | grep -E "Tests +[0-9]+ passed"
mise exec -- pnpm build >/dev/null 2>&1 && echo "✓ build"
mise exec -- pnpm exec eslint . >/dev/null 2>&1 && echo "✓ eslint"
mise exec -- pnpm exec prettier --check . >/dev/null 2>&1 && echo "✓ prettier"
```

Expected: install/typecheck/build/eslint/prettier すべて ✓、test は 32 passed。

- [ ] **Step 4: apm が mise 経由で従来どおり動く**

Run:

```bash
mise exec -- apm install >/dev/null 2>&1 && echo "✓ apm install"
mise exec -- apm compile >/dev/null 2>&1 && echo "✓ apm compile"
git status --porcelain   # 追跡対象に生成物が出ないこと（mise.lock/mise.toml 以外クリーン）
```

Expected: apm install/compile ✓、`git status` は（コミット済みなら）クリーン。

- [ ] **Step 5: 追跡境界の確認**

Run:

```bash
git ls-files | grep -E '^(mise\.toml|mise\.lock)$'                       # 追跡されている
git ls-files | grep -E '^(mise\.local\.toml|\.mise\.local\.toml)$' && echo "!! 個人設定が追跡されている" || echo "個人設定は未追跡 (OK)"
```

Expected: `mise.toml`/`mise.lock` が追跡、個人オーバーライドは未追跡。

- [ ] **Step 6: push して PR #13 を更新**

`finishing-a-development-branch` スキルに従い、コミットを push して PR #13（`docs/mise-tooling-design`）を更新する。

```bash
git push origin docs/mise-tooling-design
```

---

## 自己レビュー結果（spec 突き合わせ）

- **spec §3 mise.toml（node/pnpm/apm + lockfile）** → Task 1 Step 1。
- **spec §3 apm=github（ubi は PyInstaller バンドルを壊すため不可）/ lockfile は `mise lock`** → Task 1 Step 4-6。
- **spec §4 mise.lock 採用** → Task 1 Step 6、Task 4 Step 2（冪等）。
- **spec §5 corepack 廃止・SoT/README 更新** → Task 2（development/apm）、Task 3（README）。
- **spec §6 運用注意（trust/activate/PATH）** → development 指示書（Task 2 Step 1）に明記。
- **spec §7 検証計画** → Task 4。
- **spec §8 成果物一覧** → 全ファイル網羅（mise.toml/mise.lock/.gitignore/development/apm/README）。
- **placeholder 無し**: `<repo>` はコマンド例示。apm backend は `github:`、lockfile は `mise lock` で生成（実装で確定）。
- **非スコープ厳守**: `engines`/`packageManager` 追加せず、uv は mise 管理に含めず、CI は触らない。
