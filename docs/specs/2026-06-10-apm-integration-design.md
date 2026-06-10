# 設計書: bingo_mcp への APM（microsoft/apm）導入

- 日付: 2026-06-10
- ステータス: ドラフト（実装着手前のレビュー待ち）
- 対象リポジトリ: `ROhta/bingo_mcp`（本リポジトリ）
- 参照実装: `ROhta/bingo`（`vendor/bingo` submodule にチェックアウト済み）

## 0. 用語の確定（重要）

本設計の "APM" は **Application Performance Monitoring（Datadog 等）ではない**。
[microsoft/apm](https://github.com/microsoft/apm)（**Agent Package Manager**）を指す。
AI コーディングエージェント（Claude Code / Codex CLI / GitHub Copilot）向けの
「指示書（instructions）・MCP サーバー依存・APM パッケージ（Skills/commands 等）」を
`apm.yml` で一元管理し、`apm install` / `apm compile` で各エージェント向け成果物
（`CLAUDE.md` / `AGENTS.md` / `.claude/rules/` / `.github/instructions/` / 各 MCP 設定）を
**再生成**する CLI ツールである。

`vendor/bingo` の一次資料（`apm.yml` / `apm.lock.yaml`（`apm_version: 0.14.1`）/ README の
「[microsoft/apm](https://github.com/microsoft/apm) によって管理」記述）で確定済み。bingo 全体の
grep で Datadog / dd-trace / OpenTelemetry は一切出現しないことも確認済み。

## 1. 目的

`ROhta/bingo` と同等の APM 運用を bingo_mcp にも導入する。狙いは
**AI エージェント向け指示と人間向けドキュメントを `.apm/instructions/` に一本化（Source of Truth 化）**し、
Claude Code / Codex / Copilot の 3 ターゲットへ同一の指示を配信すること、および
MCP サーバー依存・汎用スキル（superpowers）・汎用コードレビュー指示を宣言的に管理することである。

## 2. スコープ（確定した意思決定）

| 論点 | 決定 |
|---|---|
| スコープ | **機構＋指示書の全面移行**（現 README の濃い設計内容を `.apm/instructions/` へ再構成し、README は薄いポインタ化） |
| Lint ツール | **eslint + prettier + husky + lint-staged を新規導入**（bingo 同等） |
| MCP 依存 | **semgrep / context7 / serena** の 3 種（chrome-devtools は除外） |
| APM パッケージ | **awesome-copilot の `code-review-generic` ＋ `obra/superpowers`**（bingo 同等、SHA ピン） |
| CI / リリースノート | **現状のみ反映（捏造しない）**。bingo_mcp に `.github` / release.yml が無いため、タグ運用・リリースノート手順・CI 記述は指示書に書かない |
| 指示書粒度 | **5 本に統合・再編成**（`apm` / `architecture` / `widget` / `development` / `workflow`） |
| ターゲット | `claude` / `codex` / `copilot` |

### 非スコープ（YAGNI）

- GitHub Actions（CI/CodeQL/外形監視）の新規構築 — 別タスク。
- タグ付け・リリースノート自動生成の運用 — bingo_mcp には未導入のため書かない。
- chrome-devtools MCP の導入。
- Datadog 等の性能監視（本件とは無関係）。

## 3. アーキテクチャ：追跡境界（tracked / generated）

APM の根幹は「ソース（人間が編集）＝追跡」「生成物（`apm install`/`compile` 出力）＝追跡しない」の分離。
bingo と同じ境界を敷く。

| パス | 役割 | git 追跡 |
|---|---|---|
| `.apm/instructions/*.instructions.md` | 指示書の SoT（人間が編集） | ✅ 追跡する |
| `apm.yml` | MCP 依存・APM パッケージ・targets の SoT | ✅ 追跡する |
| `apm.lock.yaml` | 整合性検証・再現性のため例外的に追跡 | ✅ 追跡する |
| `scripts/dedupe-apm-lock.mjs` | lockfile 重複除去（§5 の条件付き） | ✅ 追跡する（条件付き） |
| `.github/copilot-instructions.md` | Copilot Code Review に SoT 所在を伝えるスタブ | ✅ 追跡する |
| `CLAUDE.md` / `AGENTS.md`（各所） | `apm compile` 生成物 | ❌ 追跡しない |
| `.claude/rules/*.md` | `apm install` 生成物（Claude 補助） | ❌ 追跡しない |
| `.github/instructions/*.instructions.md` | `apm install` 生成物（Copilot 新形式） | ❌ 追跡しない |
| `.mcp.json` | `apm install` 生成物（Claude Code MCP 設定） | ❌ 追跡しない |
| `.vscode/mcp.json` | `apm install` 生成物（Copilot in VS Code MCP 設定） | ❌ 追跡しない |
| `.codex/`（`config.toml` ＋ `hooks/`） | `apm install` 生成物（Codex CLI MCP 設定 ＋ プラグイン由来のフック。例: superpowers の `.codex/hooks/superpowers/hooks/run-hook.cmd`） | ❌ 追跡しない |
| `apm_modules/`, `.agents/skills/`, `.claude/skills/`, `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json`, `.claude/apm-hooks.json`, `.codex/hooks/`, `.github/prompts/`, `.github/hooks/` | APM プラグイン展開先 | ❌ 追跡しない |

### `.gitignore` への追記

現 `.gitignore` は標準 Node 用で APM 系の記述は皆無（`dist` は ignore 済み）。
末尾に APM ブロックを追記する（bingo の `.gitignore` 構成に準拠）:

```gitignore
# APM (microsoft/apm) 生成物
# instructions の生成先
CLAUDE.md
AGENTS.md
.claude/rules/
.github/instructions/
# MCP 設定生成物 ＋ Codex プラグイン hooks
.mcp.json
.vscode/mcp.json
.codex/                  # config.toml(MCP 設定) と hooks/(プラグイン由来) の両方を包含
# APM プラグイン展開先
apm_modules/
.agents/skills/
.claude/skills/
.claude/commands/
.claude/hooks/
.claude/apm-hooks.json
.claude/settings.json
.github/prompts/
.github/hooks/
```

衝突確認: bingo_mcp ルートに既存 `CLAUDE.md` / `AGENTS.md` / `.claude` / `.github` は**無い**（確認済み）。
誤コミット防止のため、上記 ignore を **`apm install` 実行前に**入れること。

## 4. `apm.yml` 仕様

```yaml
name: bingo-mcp
version: 0.1.0            # package.json と一致
description: AI agent instructions for the bingo_mcp project
author: ROhta
license: GPL-3.0-or-later
type: instructions
targets:
  - claude
  - codex
  - copilot
includes: auto
dependencies:
  mcp:
    - name: semgrep
      registry: false
      transport: stdio
      command: uvx
      args:
        - semgrep-mcp
    - name: context7
      registry: false
      transport: stdio
      command: npx
      args:
        - -y
        - "@upstash/context7-mcp"
    - name: serena
      registry: false
      transport: stdio
      command: uvx
      args:
        - --from
        - git+https://github.com/oraios/serena@<SHA>   # 実装時に解決
        - serena
        - start-mcp-server
  apm:
    - github/awesome-copilot/instructions/code-review-generic.instructions.md#<SHA>
    - obra/superpowers#<SHA>
```

- chrome-devtools は除外。
- **ピン方針**（ドリフト防止）:
  - **APM パッケージ（`dependencies.apm`）は SHA ピン必須**。`<SHA>` は実装時に `apm install` の
    解決結果（`apm.lock.yaml` の `resolved_commit`）で確定する。bingo の現行 SHA を初期値の参考にしてよい。
  - **MCP（`dependencies.mcp`）は git ソースの serena のみ SHA ピン**（`git+URL@<SHA>`）。
    npm/uvx パッケージの `semgrep`・`context7` は API が安定しているため**固定省略**し、
    解決状態は `apm.lock.yaml` に記録される（将来必要になれば `<pkg>@<semver>` で固定）。bingo の方針を踏襲。
- APM 公式レジストリ（`apm mcp search` / `apm mcp install <registry-name>`）は解決不正の既知問題が
  あるため使わず、**すべて self-defined（`-- <command> [args...]`）**で登録する（bingo の方針を踏襲）。

## 5. `apm.lock.yaml` と dedupe ラッパー（推測せず検証）

- `apm.lock.yaml` は `apm install` が生成するが、整合性検証・再現性のため**例外的に追跡**する。
- bingo の `scripts/dedupe-apm-lock.mjs` は **APM CLI v0.14.1 の既知バグ**
  （`apm.lock.yaml` の `deployed_files:` 配列に同一パスが 2 回記録される）への後処理である。
- **実装時の検証手順**:
  1. apm CLI を導入し `apm --version` を記録。
  2. `apm install` を実行し、`apm.lock.yaml` の `deployed_files:` に重複が出るか確認。
  3. **重複が出る場合のみ** `scripts/dedupe-apm-lock.mjs` を移植し、`apm-install` npm script を
     `apm install && node scripts/dedupe-apm-lock.mjs` とする。
  4. **重複が出ない（upstream で修正済み）場合**は dedupe スクリプトを移植せず、
     `apm-install` を素の `apm install` にする（または npm script 自体を省略）。
- upstream で fix 済みかは [microsoft/apm](https://github.com/microsoft/apm) のリリースで確認する。

## 6. 指示書 5 本の構成

`.apm/instructions/` に以下 5 本を配置する。各ファイルは frontmatter（`description` / `applyTo`）を持つ。
bingo の 12 本を関心ごとに統合・再編成したもの（**情報は落とさない**）。

### 6.1 `apm.instructions.md`

- **applyTo**: `{.apm/**,apm.yml,apm.lock.yaml}`
- **統合元**: bingo の apm-workflow ＋ apm-plugins ＋ mcp-servers
- **内容**:
  - Source of Truth の定義（`.apm/instructions/` ＋ `apm.yml`）
  - §3 のファイル追跡境界表
  - ローカル作業手順（`pnpm apm-install` / `apm compile`、§5 の dedupe 方針）
  - GitHub Copilot Code Review への指示伝達（`.github/copilot-instructions.md` スタブの役割）
  - 依存パッケージ（`dependencies.apm`）: awesome-copilot `code-review-generic` ＋ `obra/superpowers`、
    vendor-neutral 方針、SHA ピン、追加/削除手順、生成物の場所
  - MCP サーバー（`dependencies.mcp`）: semgrep / context7 / serena の用途・前提（`uv`/`node`）・
    バージョン固定方針・`npx -y` の非対話起動・self-defined 登録（レジストリ非使用）・生成物の場所

### 6.2 `architecture.instructions.md`

- **applyTo**: `src/**`
- **統合元**: bingo の typescript ＋ feature-spec（中身は bingo_mcp 向けに全面 REWRITE）
- **内容の出所**: 現 README ＋ `docs/specs/2026-06-02-bingo-mcp-app-design.md` ＋ `src/`
  - **責務分担**: `src/server`（MCP サーバー・GameState 権威）/ `src/widget`（描画・抽選実行）/
    `src/shared`（型）の 3 層
  - **vendored `NumberList` の非対称依存**: widget だけが `@vendor/bingo/numberList` を実行し、
    server は submodule に一切触れない。`randomIndex` は本家 `generateRandomNumber` の式を
    「import せず再現」したもの。alias 配線は tsconfig / esbuild.mjs / vitest.config.ts の 3 箇所。
  - **乱数の公平性と `randomIndex` 契約**: `crypto.getRandomValues` 採用理由（`Math.random()` 不採用）、
    剰余 `%` ではなく floor-normalize 採用理由、返り値が常に `[0, maxExclusive)` に収まる契約。
  - **状態の検証境界（書込厳格・読取寛容）**: `seedLocalStorage` → `assertBingoNumbers`（書込厳格）と
    vendored `NumberList` getter（読取寛容）の非対称、信頼境界が「入口（書き込み）」にある理由。
  - **MCP ツール仕様**: `start_bingo`（resume/fresh）/ `sync_state` / `draw_number` / `reset_game` の
    入出力スキーマ（`gameStateShape`）と挙動。
  - **GameState サーバー権威（C案）**: View はターンごとに破棄・状態永続化 API 無し → サーバーが
    平データのチェックポイントを保持、widget が各 render で再シードして `NumberList` を実行。
  - **単一盤面ポリシー**（`index.ts` の `let game` / stateful HTTP 化は将来）。

### 6.3 `widget.instructions.md`

- **applyTo**: `{src/widget/**,esbuild.mjs}`
- **統合元**: bingo の styling を改題・全面 REWRITE（Bootstrap5 は不採用のため）
- **内容**:
  - 自前 CSS（`src/widget/index.html` の `style` / `draw.ts`）。Bootstrap には依存しない。
  - **CSP**: 静的リソースは `resourceDomains` 宣言が必要。mp3 は **data: URL でインライン化**して
    `resourceDomains` を回避（esbuild の `loader: {".mp3": "dataurl"}`）。
  - **esbuild バンドル**: iife 単一 HTML（`dist/mcp-app.html`）を `ui://` リソースとして配信。
    バンドル JS 中の `</script>` をエスケープする理由（HTML パーサの早期終了回避）。
  - `mimeType` は `text/html;profile=mcp-app`（MUST）。

### 6.4 `development.instructions.md`

- **applyTo**: `**/{package.json,pnpm-lock.yaml,tsconfig*.json,*.ts}`
- **統合元**: bingo の setup ＋ lint
- **内容**:
  - **環境構築**: `git clone` → submodule 取得（`git submodule update --init`）→
    node/pnpm をバージョン指定どおりに → `pnpm i --frozen-lockfile`。
  - **ビルド/テスト**: `pnpm build`（= `build:widget`(esbuild) → `dist/mcp-app.html`、
    `build:server`(tsc) → `dist/server`）/ `pnpm typecheck` / `pnpm test`（vitest）。
  - **MCP サーバーとしての起動**: `bingo-mcp`（`dist/server/index.js`、`StdioServerTransport`）を
    MCP ホスト（claude.ai web / Claude Desktop）に登録する手順。
  - **Lint/整形**: eslint + prettier が husky `pre-commit` ＋ lint-staged で発火。
    eslint は `eslint.config.mjs`（flat config、recommend 準拠、独自ルール最小）、
    prettier 設定は `package.json` に集約（一覧性優先）。
  - **tsconfig**: `@tsconfig/strictest` 継承＋最厳フラグ群（既存方針、`tsconfig.json` 参照）。

### 6.5 `workflow.instructions.md`

- **applyTo**: `**`
- **統合元**: bingo の dev-workflow ＋ local-dev-workflow ＋ pr-review ＋ github-ops
- **内容**:
  - **開発フロー**: branch 作成 → 開発 → PR 作成 → レビュー → マージ。
    （タグ/リリースノート手順は **書かない** — bingo_mcp に未導入）
  - **ローカル AI ワークフロー（superpowers ベース）**: 実装完了 →
    `verification-before-completion` → `requesting-code-review` → `receiving-code-review` →
    `finishing-a-development-branch`。PR レビュー応答ループ（`gh api graphql` で未 resolve
    スレッド列挙 → 妥当性判断 → 対応/返信/resolve）。superpowers 不在時は中断して案内。
  - **PR レビュー作法**: 日本語、GitHub Suggestion で修正コード提示、結論（課題）を文頭に。
  - **GitHub 運用**: CodeOwners = @ROhta、Security Policy。
    （GitHub Actions / Pages / 外形監視は **現状無し** のため書かない）

## 7. Lint ツール導入の詳細（bingo 同等）

- **追加 devDependencies**: `eslint` `@eslint/js` `typescript-eslint` `eslint-config-prettier`
  `globals` `prettier` `husky` `lint-staged`
- **`eslint.config.mjs`**: flat config。`@eslint/js` recommended ＋ `typescript-eslint` ＋
  `eslint-config-prettier`（整形は prettier に委譲）。bingo の `eslint.config.mjs` を参考に最小構成。
- **prettier 設定（`package.json` の `prettier` キー）**: bingo に準拠
  （tabs / `semi:false` / `singleQuote:false` / `bracketSpacing:false` / `printWidth` 等）。
  bingo_mcp 既存コード（`src/server/index.ts` 等）は既にこのスタイルなので**差分は最小**の見込み。
- **husky / lint-staged**: `package.json` に
  - `"prepare": "husky"`
  - `lint-staged`: `*.{ts,mjs}` → `eslint --fix` ＋ `prettier --write`、
    `*.{json,md,yml,yaml,html,css}` → `prettier --write`
  - `.husky/pre-commit` → `lint-staged`
- **`apm-install` script**（§5 の条件付き）。
- **検証**: 導入後に `pnpm test` / `pnpm typecheck` / `pnpm build` が通ること、
  prettier/eslint が既存コードを壊さない（差分が意図どおり）ことを確認。

## 8. README の薄化

現 README の濃い設計（submodule 依存の分類 / 乱数と公平性 / 状態の検証境界）は
`architecture` / `widget` 指示書へ移設する。README は bingo 同様、
**プロジェクト概要 ＋ `.apm/instructions/` への索引表**に薄化する。

- 情報は**失わない**（指示書へ移すだけ）。SoT を `.apm/instructions/` に一本化するのが目的。
- 索引表は bingo の README 形式（ファイル名 → 内容、`.apm/instructions/` への相対リンク）に倣う。
- 「開発」節（`pnpm test` / `typecheck` / `build`）は README にも簡潔に残してよい。

## 9. apm CLI の前提

- apm CLI は**開発者の前提ツール**（グローバル導入）。`development` / `apm` 指示書に導入方法を明記。
  bingo も素の `apm install` を前提（npm devDep ではない）。
- 採用バージョンを実装時に確定し（§5）、`apm.lock.yaml` の `apm_version` に反映される。

## 10. 検証計画（実装フェーズ）

1. `apm install` が想定どおりの生成物（`.claude/rules/` / `.github/instructions/` / `.mcp.json` /
   `.vscode/mcp.json` / `.codex/config.toml` / 5 本の instructions 展開）を出す。
2. `apm compile` が `CLAUDE.md` / `AGENTS.md` を生成し、5 本の指示内容が含まれる。
3. 生成物がすべて `.gitignore` 済みで、`git status` に現れない（`apm.lock.yaml` と SoT のみ追跡）。
4. `apm.lock.yaml` の `deployed_files:` 重複有無を確認（§5 の dedupe 要否を決定）。
5. MCP サーバー 3 種が各 IDE 設定に展開され、起動コマンドが正しい。
6. APM パッケージ（code-review-generic / superpowers）が展開される。
7. 既存の `pnpm build` / `pnpm test` / `pnpm typecheck` が引き続き通る。
8. eslint / prettier が既存コードに対し意図どおり動く（pre-commit でフォーマット暴走しない）。

## 11. 成果物一覧（このタスクで新規追跡されるファイル）

- `apm.yml`
- `apm.lock.yaml`
- `.apm/instructions/apm.instructions.md`
- `.apm/instructions/architecture.instructions.md`
- `.apm/instructions/widget.instructions.md`
- `.apm/instructions/development.instructions.md`
- `.apm/instructions/workflow.instructions.md`
- `.github/copilot-instructions.md`（スタブ）
- `scripts/dedupe-apm-lock.mjs`（§5 で必要と判明した場合のみ）
- `eslint.config.mjs`
- `.husky/pre-commit`
- `.gitignore`（APM ブロック追記）
- `package.json`（devDeps / scripts / prettier / lint-staged 追記）
- `README.md`（薄化）
