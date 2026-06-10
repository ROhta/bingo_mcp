# APM (microsoft/apm) 導入 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ROhta/bingo` と同等の APM（[microsoft/apm](https://github.com/microsoft/apm) = Agent Package Manager）運用を bingo_mcp に導入し、AI エージェント向け指示・MCP 依存・プラグインを `apm.yml` ＋ `.apm/instructions/` で一元管理する。

**Architecture:** `.apm/instructions/*.instructions.md` と `apm.yml` を Source of Truth とし、`apm install` / `apm compile` が `CLAUDE.md` / `AGENTS.md` / `.claude/rules/` / `.github/instructions/` / 各 MCP 設定を再生成する。生成物は `.gitignore` 対象、SoT と `apm.lock.yaml` のみ追跡。あわせて eslint + prettier + husky + lint-staged を新規導入する。

**Tech Stack:** apm CLI v0.19.0、pnpm、TypeScript（@tsconfig/strictest）、esbuild、vitest、eslint v10 / typescript-eslint v8 / prettier v3 / husky v9 / lint-staged v17。

**設計書:** `docs/specs/2026-06-10-apm-integration-design.md`（本プランの根拠。PR #12）

---

## 重要な前提・順序制約

- **`.gitignore` の APM ブロックは `apm install` より前に入れる**（生成物の誤コミット防止）。→ Task 1 を Task 4 より必ず先に。
- **apm CLI は v0.19.0**（bingo の lockfile 生成時は 0.14.1）。`scripts/dedupe-apm-lock.mjs` は v0.14.1 の lockfile 重複バグ回避策。**0.19.0 で重複が出るか実測し、出た時だけ導入**（Task 4）。
- 生成物（`CLAUDE.md` / `AGENTS.md` / `.claude/rules/` / `.github/instructions/` / `.mcp.json` / `.vscode/mcp.json` / `.codex/`）は追跡しない。追跡するのは `apm.yml` / `apm.lock.yaml` / `.apm/` / `.github/copilot-instructions.md` / lint 設定 / 薄化 README。

---

## ファイル構成（作成・変更一覧）

| パス                                             | 操作             | 責務                                                                               |
| ------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------- |
| `.gitignore`                                     | 変更（末尾追記） | APM 生成物を追跡対象から除外                                                       |
| `package.json`                                   | 変更             | devDeps・scripts（`prepare`/`apm-install`）・`prettier`・`lint-staged` 追記        |
| `eslint.config.mjs`                              | 作成             | flat config（recommend 準拠、widget=browser / server=node）                        |
| `.prettierignore`                                | 作成             | `prettier --write/--check .` 全ツリー実行時に vendor/dist/生成物を整形対象外にする |
| `.husky/pre-commit`                              | 作成             | `pnpm exec lint-staged`                                                            |
| `apm.yml`                                        | 作成             | MCP 依存・APM パッケージ・targets の SoT                                           |
| `.apm/instructions/apm.instructions.md`          | 作成             | APM 運用・依存・MCP の SoT 指示                                                    |
| `.apm/instructions/architecture.instructions.md` | 作成             | 責務分担・乱数・検証境界・MCP ツール・状態権威                                     |
| `.apm/instructions/widget.instructions.md`       | 作成             | widget UI/ビルド（CSS・CSP・mp3・esbuild）                                         |
| `.apm/instructions/development.instructions.md`  | 作成             | 環境構築・ビルド・lint・起動                                                       |
| `.apm/instructions/workflow.instructions.md`     | 作成             | 開発フロー・AIワークフロー・PRレビュー・GitHub運用                                 |
| `.github/copilot-instructions.md`                | 作成             | Copilot Code Review に SoT 所在を伝えるスタブ                                      |
| `apm.lock.yaml`                                  | 生成（追跡）     | `apm install` 生成。整合性・再現性のため例外的に追跡                               |
| `scripts/dedupe-apm-lock.mjs`                    | 作成（条件付き） | lockfile 重複除去（0.19.0 で重複が出た場合のみ）                                   |
| `README.md`                                      | 変更（薄化）     | 概要＋ `.apm/instructions/` 索引                                                   |

---

## Task 0: 前提ツールの確認とブランチ作成

**Files:** なし（検証のみ）

- [ ] **Step 1: 前提ツールのバージョン確認**

Run:

```bash
apm --version          # Expected: 0.19.0 (fa8a0ca) 以上
node --version         # Expected: v24.16.0 以上（package.json engines）
corepack enable && pnpm --version   # pnpm を有効化
uvx --version          # serena/semgrep の起動に必要
git submodule status   # vendor/bingo がチェックアウト済みであること
```

Expected: いずれも成功。`apm` が無い場合は microsoft/apm の README に従い導入してから続行。

- [ ] **Step 2: 実装ブランチを作成**

Run:

```bash
git checkout main && git pull
git checkout -b feat/apm-integration
```

Expected: `feat/apm-integration` ブランチに移動。

---

## Task 1: `.gitignore` に APM 生成物ブロックを追記（install より前に必須）

**Files:**

- Modify: `.gitignore`（末尾に追記）

- [ ] **Step 1: APM ブロックを `.gitignore` 末尾へ追記**

`.gitignore` の最終行の後に、以下を追記する。

```gitignore

# APM (microsoft/apm) 生成物 — `apm install`/`apm compile` で再生成されるため追跡しない
# instructions / メモリの生成先
CLAUDE.md
AGENTS.md
.claude/rules/
.github/instructions/
# MCP 設定生成物 ＋ Codex プラグイン hooks（.codex/ はディレクトリ丸ごと: config.toml と hooks/ の両方）
.mcp.json
.vscode/mcp.json
.codex/
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

- [ ] **Step 2: 既存追跡物と衝突しないことを確認**

Run:

```bash
git check-ignore -v CLAUDE.md AGENTS.md .claude/rules/ .github/instructions/ .mcp.json .codex/ apm_modules/
```

Expected: 各パスが `.gitignore` の該当行にマッチして出力される（= ignore 済み）。

Run:

```bash
git ls-files | grep -E '^(CLAUDE\.md|AGENTS\.md|\.claude/|\.github/instructions/|\.mcp\.json|\.codex/)' || echo "no tracked generated files (OK)"
```

Expected: `no tracked generated files (OK)`（既に追跡された生成物が無い）。

- [ ] **Step 3: コミット**

```bash
git add .gitignore
git commit -m "chore: APM 生成物を .gitignore に追加（apm install 前の安全配線）"
```

---

## Task 2: Lint/整形ツール（eslint + prettier + husky + lint-staged）を導入

**Files:**

- Modify: `package.json`
- Create: `eslint.config.mjs`
- Create: `.prettierignore`
- Create: `.husky/pre-commit`

- [ ] **Step 1: devDependencies と scripts・prettier・lint-staged を `package.json` に追記**

`package.json` を以下のように変更する（既存キーは保持し、`scripts` にエントリ追加、`devDependencies` に追加、トップレベルに `prettier` と `lint-staged` を追加）。

`scripts` に追加するエントリ:

```json
"prepare": "husky",
"lint": "eslint .",
"format": "prettier --write ."
```

`devDependencies` に追加するエントリ:

```json
"@eslint/js": "^10.0.1",
"eslint": "^10.4.0",
"eslint-config-prettier": "^10.1.8",
"globals": "^17.6.0",
"husky": "^9.1.7",
"lint-staged": "^17.0.5",
"prettier": "^3.8.3",
"typescript-eslint": "^8.59.4"
```

トップレベルに追加する `prettier` 設定（bingo と統一。既存コードは tabs/double quote/semi なしで一致済み）:

```json
"prettier": {
	"printWidth": 1000,
	"tabWidth": 2,
	"useTabs": true,
	"semi": false,
	"singleQuote": false,
	"quoteProps": "as-needed",
	"trailingComma": "all",
	"bracketSpacing": false,
	"bracketSameLine": false,
	"arrowParens": "avoid",
	"proseWrap": "always",
	"endOfLine": "lf"
}
```

トップレベルに追加する `lint-staged` 設定:

```json
"lint-staged": {
	"*.{ts,mjs,cjs}": ["eslint --fix", "prettier --write"],
	"*.{html,css,json,md}": ["prettier --write"],
	"!(pnpm-lock).{yml,yaml}": ["prettier --write"]
}
```

- [ ] **Step 2: `eslint.config.mjs` を作成**

bingo_mcp は widget=browser / server=node の2環境混在のため、ディレクトリ別に globals を当てる。

```js
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import prettierConfig from "eslint-config-prettier/flat"
import globals from "globals"

export default tseslint.config(
	{
		// APM 生成物（.claude/.agents/.codex/.github）と vendored/ビルド成果物は探索対象外。
		// eslint は .gitignore を見ないため明示除外が必要（apm install 後に生成物が lint されるのを防ぐ）。
		ignores: ["node_modules/**", "dist/**", "vendor/**", "apm_modules/**", ".remember/**", ".claude/**", ".agents/**", ".codex/**", ".github/**"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettierConfig,
	{
		// widget はブラウザ実行（DOM / localStorage / crypto / HTMLElement 等）
		files: ["src/widget/**/*.ts"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {...globals.browser},
		},
	},
	{
		// server / shared は Node 実行
		files: ["src/server/**/*.ts", "src/shared/**/*.ts"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {...globals.node},
		},
	},
	{
		// ビルド/設定/スクリプトは Node
		files: ["*.mjs", "*.ts", "scripts/**/*.mjs"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {...globals.node},
		},
	},
)
```

- [ ] **Step 2b: `.prettierignore` を作成**

`prettier --write .` / `--check .` を全ツリーに走らせるため、整形不要・整形してはいけない領域を除外する。

```gitignore
node_modules
dist
vendor
apm_modules
.remember
pnpm-lock.yaml
# apm.lock.yaml は apm が書式の権威。prettier 整形すると apm install の出力と毎回衝突し非冪等になるため除外（apm.yml は人間編集 SoT なので整形対象のまま）。
apm.lock.yaml
```

- [ ] **Step 2c: `vitest.config.ts` のテスト探索を自前テストに限定**

vitest は `.gitignore` を見ないため、`apm install` 後に APM 生成物（`apm_modules/` 同梱の `*.test.*` 等）を拾って失敗する。`test.include` を `src` 配下に絞る。

```ts
// test: {environment: "node"} を以下に変更
test: {environment: "node", include: ["src/**/*.test.ts"]},
```

> 注（統合上の注意）: eslint の `ignores` にも APM 生成物（`.claude/.agents/.codex/.github`）を加える（Step 2 のコメント参照）。prettier はデフォルトで `.gitignore` を尊重するため `.prettierignore` のみで足りるが、eslint / vitest は `.gitignore` 非尊重なので個別に除外が必要。この除外を怠ると Task 4（`apm install`）以降で lint/test が大量失敗する。

- [ ] **Step 3: 依存をインストール**

Run:

```bash
pnpm install
```

Expected: lockfile 更新、eslint/prettier/husky/lint-staged 等が node_modules に入る。`husky` の `prepare` スクリプトが走り `.husky/` が初期化される。

- [ ] **Step 4: `.husky/pre-commit` を作成**

`.husky/pre-commit` を以下の内容で作成し、実行権限を付ける。

```sh
pnpm exec lint-staged
```

Run:

```bash
chmod +x .husky/pre-commit
```

- [ ] **Step 5: eslint と prettier が既存コードを壊さないことを確認**

Run:

```bash
pnpm exec prettier --check . 2>&1 | tail -20
```

Expected: 既存 `src/**/*.ts` は概ね整形済みのはず。差分が出るファイルがあれば `pnpm exec prettier --write .` で整形（既存コードのスタイル統一として許容）。

Run:

```bash
pnpm exec eslint .
```

Expected: エラー無しで終了（既存コードは strict スタイル準拠）。もし `@typescript-eslint/no-non-null-assertion` 等で軽微な指摘が出た場合は、該当箇所のみ最小限に対応（例: `draw_number` の `current.history.at(-1)!` は既存仕様。ルールが厳しすぎる場合は eslint.config.mjs の recommended に従い、必要時だけ行コメントで明示無効化）。

- [ ] **Step 6: 既存のビルド・テスト・型チェックが通ることを確認**

Run:

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: すべて成功（lint 導入が既存挙動を壊していない）。

- [ ] **Step 7: コミット**

```bash
git add package.json pnpm-lock.yaml eslint.config.mjs .husky/pre-commit
# prettier --write で整形した既存ソースがあればそれも add
git add -A
git commit -m "chore: eslint + prettier + husky + lint-staged を導入"
```

---

## Task 3: `.apm/instructions/` 5本 ＋ `apm.yml` ＋ Copilot スタブを作成

**Files:**

- Create: `.apm/instructions/apm.instructions.md`
- Create: `.apm/instructions/architecture.instructions.md`
- Create: `.apm/instructions/widget.instructions.md`
- Create: `.apm/instructions/development.instructions.md`
- Create: `.apm/instructions/workflow.instructions.md`
- Create: `apm.yml`
- Create: `.github/copilot-instructions.md`

- [ ] **Step 1: `.apm/instructions/apm.instructions.md` を作成**

````markdown
---
description: APM (Agent Package Manager / microsoft/apm) を介した AI エージェント指示・MCP・プラグインの運用ルール
applyTo: "{.apm/**,apm.yml,apm.lock.yaml}"
---

# APM 運用ルール

## Source of Truth

`.apm/instructions/*.instructions.md` と `apm.yml` がすべての AI エージェント向け設定の Source of Truth。ここを編集することで Claude Code / Codex CLI / GitHub Copilot のすべてに同じ指示・MCP・プラグインが届く。

## ファイルの管理方針（追跡境界）

| パス                                                                                                                            | 役割                                                     | 追跡 |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---- |
| `.apm/instructions/*.instructions.md`                                                                                           | 指示の SoT（人間が編集）                                 | ✅   |
| `apm.yml`（`dependencies.mcp` / `dependencies.apm`）                                                                            | MCP・プラグインの SoT（人間が編集）                      | ✅   |
| `apm.lock.yaml`                                                                                                                 | `apm install` 生成。整合性・再現性のため例外的に追跡     | ✅   |
| `.github/copilot-instructions.md`                                                                                               | Copilot Code Review に SoT 所在を伝えるスタブ            | ✅   |
| `CLAUDE.md` / `AGENTS.md`                                                                                                       | `apm compile` 生成                                       | ❌   |
| `.claude/rules/` / `.github/instructions/`                                                                                      | `apm install` 生成（instructions 展開先）                | ❌   |
| `.mcp.json` / `.vscode/mcp.json` / `.codex/`                                                                                    | `apm install` 生成（MCP 設定 ＋ Codex プラグイン hooks） | ❌   |
| `apm_modules/` / `.agents/skills/` / `.claude/{skills,commands,hooks,settings.json,apm-hooks.json}` / `.github/{prompts,hooks}` | プラグイン展開先                                         | ❌   |

## ローカルでの作業

`.apm/instructions/` または `apm.yml` を編集後、生成物を更新する:

```bash
pnpm apm-install   # apm install（lockfile・MCP 設定・instructions・プラグインを再デプロイ）
apm compile        # CLAUDE.md / AGENTS.md を更新
```

`apm.lock.yaml` を除く生成物は `.gitignore` 対象のためコミットに含まれない。

## 依存パッケージ（`dependencies.apm`）

扱える形態は 2 種類:

- **プラグイン bundle**: Skills / commands / hooks 等をまとめたもの（例: `obra/superpowers`）
- **単一プリミティブ (virtual file)**: 既存リポジトリ内の特定ファイルを 1 ファイル単位で取り込む（例: `github/awesome-copilot/instructions/code-review-generic.instructions.md`）

| 依存                                                            | 種別               | 用途                                           |
| --------------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| `code-review-generic.instructions.md`（github/awesome-copilot） | 単一プリミティブ   | 汎用コードレビュー指示（ベンダー・言語非依存） |
| `superpowers`（obra/superpowers）                               | marketplace plugin | TDD・デバッグ・計画立案等の汎用スキル群        |

**vendor-neutral 方針**: 特定 AI ベンダー組織配下のリポジトリを直接指定せず、コミュニティ curated（`github/awesome-copilot`）や中立 OSS（`obra/superpowers`）を経由する。

**SHA ピン必須**: `dependencies.apm` の各エントリは `#<sha>` でピンする（ピンしないと `apm install` 毎に上流 main を引きドリフトする）。

## MCP サーバー（`dependencies.mcp`）

| 名前       | 起動コマンド                                                                    | 用途                                 | 前提   |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------ | ------ |
| `semgrep`  | `uvx semgrep-mcp`                                                               | 静的解析（SAST）                     | `uv`   |
| `context7` | `npx -y @upstash/context7-mcp`                                                  | ライブラリ公式ドキュメント最新版取得 | `node` |
| `serena`   | `uvx --from git+https://github.com/oraios/serena@<sha> serena start-mcp-server` | LSP ベースのシンボル指向コード探索   | `uv`   |

- **ピン方針**: git ソース（serena）は `@<sha>` でピン。npm/uvx の `semgrep` / `context7` は API 安定のため固定省略（解決状態は `apm.lock.yaml` に記録、将来必要なら `<pkg>@<semver>` で固定）。
- `npx` は非対話起動のため `-y` を必ず付ける。
- **APM レジストリ（`apm mcp search` / `apm mcp install <registry-name>`）は使わない**。解決不正の既知問題があるため、すべて self-defined（`-- <command> [args...]`）で登録する。

## GitHub Copilot Code Review への指示伝達

Copilot Code Review エージェントは `AGENTS.md` を読まず `.github/copilot-instructions.md` または `.github/instructions/*.instructions.md` のみを読む。本リポジトリは `.github/copilot-instructions.md` をスタブとして配置し、SoT である `.apm/instructions/workflow.instructions.md`（PR レビュー方針）を参照させる。

参考: <https://docs.github.com/copilot/how-tos/configure-custom-instructions/add-repository-instructions>
````

- [ ] **Step 2: `.apm/instructions/architecture.instructions.md` を作成**

```markdown
---
description: bingo_mcp のアーキテクチャ（責務分担・vendored 依存・乱数・状態検証境界・MCP ツール・状態権威）
applyTo: "src/**"
---

# アーキテクチャと実装方針

## 概要

Claude のグラフィカルクライアント（claude.ai web / Claude Desktop）のチャット内で「ビンゴやりたい」と言うと、MCP Apps のウィジェットとしてビンゴ盤面（抽選機 ＋ 5×5 カード）が描画される。既存の `ROhta/bingo` のソースを**改変せず**再利用する。

## 3 層の責務分担

- `src/server`: MCP サーバー（stdio）。`GameState` の権威を持つ。submodule に**一切触れない**。
- `src/widget`: ブラウザ描画＋抽選実行。vendored `NumberList` を**実行する**。
- `src/shared`: `GameState` 等の型定義。

## vendored `NumberList` の非対称依存

依存しているのは `ROhta/bingo` 全体ではなく **`numberList.ts` 1 ファイルと mp3 2 つだけ**。

- **widget 側だけ**が `@vendor/bingo/numberList` を import して実行し、本家の抽選挙動を忠実に再現する。
- **server 側**は `NumberList` を import せず、`src/widget/card.ts` の `randomIndex` を使って抽選する（`drawFromState`）。`randomIndex` は本家 `NumberList.generateRandomNumber` の式を「import せず再現」したもの。
- これにより server は submodule のチェックアウト無しでもビルド・抽選できる。
- alias 配線は **3 箇所**: `tsconfig.json`（paths＋include）/ `esbuild.mjs`（alias）/ `vitest.config.ts`（resolve.alias）。いずれも絶対パス化する（cwd 依存回避）。

## 乱数と公平性（`randomIndex` の契約）

エントロピー源は `crypto.getRandomValues` を使い、`Math.random()` は使わない。

- `Math.random()` は実装依存 PRNG で予測可能。抽選機としては「操作できない」ことに意味がある。本家も `crypto` を使うため分布を一致させる。
- 切り出しは剰余 `%` ではなく `Math.floor((value / 2 ** 32) * maxExclusive)`（floor-normalize）。`%` は低インデックスに偏る剰余バイアスがあるが、floor-normalize は偏りを範囲全体に分散し、`n ≤ 75` では誤差 ~10⁻⁸ と無視できる。本家 `generateRandomNumber` と同方式。
- 返り値は常に `[0, maxExclusive)` に収まる（u32 最大でも `(2³²-1)/2³² < 1` のため `floor` で `maxExclusive` 未満）。配列範囲外アクセスを踏まない。
- 避けているのは `Math.random()`（エントロピー源）であって `Math.floor`（切り捨て）は問題なく使う。

## 状態の検証境界（書き込み厳格・読み取り寛容）

`remain`/`history` の localStorage 出入りは非対称に検証する。

| 方向                       | 経路                                                                 | 検証                                              |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| 書き込み（resume seed）    | `seedLocalStorage` → `assertBingoNumbers`（`src/widget/hydrate.ts`） | **厳格**: 非配列・非整数・`[1,75]` 範囲外を throw |
| 読み取り（resume restore） | `new NumberList()` の getter（vendored）                             | **寛容**: 非配列は黙って `[]` に縮退              |

untrusted な入力はサーバー由来の `state`（MCP `structuredContent`）で、widget が localStorage に書き込む瞬間に `seedLocalStorage` が検証する（信頼境界＝入口）。widget が `new NumberList()` を作るのは常に seed 成功直後なので、寛容な読み取りが見るのは検証済みの自前データだけ。将来読み取り側にも厳格さが要るなら `assertBingoNumbers` 相当を読み取り口にも設けること。

## MCP ツール（`src/server/index.ts`）

| ツール        | 入力                         | 挙動                                                                          |
| ------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `start_bingo` | `mode?: "resume" \| "fresh"` | 盤面を開く。`fresh` または未開始なら新規、既存があれば再開                    |
| `sync_state`  | `state: GameState`           | widget から状態を保存（抽選/マークの度に呼ばれる）                            |
| `draw_number` | なし                         | 次の1つを抽選（チャットからの「次引いて」用）。枯渇時は「全て抽選済み」を返す |
| `reset_game`  | なし                         | ゲーム初期化                                                                  |

出力はすべて `gameStateShape`（`remain` / `history` / `card`）の `structuredContent`。

## 状態権威（C案）と単一盤面

MCP Apps の View はターンごとに破棄・再生成され（`ui/resource-teardown`）、状態永続化 API は未定義。そのため **サーバーが平データのチェックポイント（`GameState`）を保持**し、widget が各 render で再シードして `NumberList` を実行、結果をサーバーへ同期する（C案）。現状は単一盤面ポリシー（`index.ts` の `let game`）。stateful HTTP 化（複数セッション分離）は将来課題。
```

- [ ] **Step 3: `.apm/instructions/widget.instructions.md` を作成**

```markdown
---
description: widget の UI / ビルド方針（自前 CSS・CSP・mp3 インライン・esbuild）
applyTo: "{src/widget/**,esbuild.mjs}"
---

# Widget の UI とビルド

## スタイリング

- Bootstrap には依存しない。スタイルは `src/widget/index.html` の `style` と `src/widget/draw.ts` に自前で持つ。
- 色やテーマは CSS カスタムプロパティに集約する。

## CSP とアセット

- UI リソースの `mimeType` は **`text/html;profile=mcp-app`**（MUST）。
- 静的リソースは CSP `resourceDomains` 宣言が必要で、未宣言オリジンはブロックされる（MUST）。
- 演出音（drumroll / cymbals の mp3）は **data: URL でインライン化**して `resourceDomains` を回避する（esbuild の `loader: {".mp3": "dataurl"}`）。

## esbuild バンドル

- `src/widget/main.ts` を起点に iife 形式で単一 HTML（`dist/mcp-app.html`）へバンドルし、`ui://` リソースとして配信する。
- バンドル JS 内に `</script>` が現れると HTML パーサが script を早期終了するため、`</script>` → `<\/script>` にエスケープする。
- テンプレート（`src/widget/index.html`）の `<!--BUNDLE-->` を **置換は関数で**渡して差し込む（文字列置換だと replacement 内の `$&`/`$\`` 等が特殊パターンと解釈され、バンドル中の正規表現エスケープが破損する）。
- vendored モジュール alias（`@vendor/bingo/numberList` ＝ `NumberList` の TS ソース）は cwd 依存回避のため絶対パス化する（`esbuild.mjs` / `vitest.config.ts` 同方式）。mp3 は alias ではなく上記 `loader: {".mp3": "dataurl"}` で取り込む点に注意。
```

- [ ] **Step 4: `.apm/instructions/development.instructions.md` を作成**

````markdown
---
description: 環境構築・ビルド・テスト・lint・MCP サーバーとしての起動
applyTo: "**/{package.json,pnpm-lock.yaml,tsconfig*.json,*.ts}"
---

# 開発環境

## 前提ツール

- [Node.js](https://nodejs.org/)（`package.json` の `engines` 指定に従う） ＋ pnpm（`corepack enable`）
- [uv](https://docs.astral.sh/uv/)（`uvx` 経由で serena / semgrep を起動）
- [apm CLI](https://github.com/microsoft/apm)（AI エージェント設定の管理。`apm install` / `apm compile`）

## 環境構築

```bash
git clone <repo> && cd bingo_mcp
git submodule update --init        # vendor/bingo を取得
corepack enable
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

## tsconfig

- `@tsconfig/strictest` を継承し、さらに最厳フラグ群（`isolatedDeclarations` / `verbatimModuleSyntax` / `erasableSyntaxOnly` / `noUncheckedSideEffectImports` 等）を適用。
- `tsconfig.json`（型チェック用、`noEmit`）と `tsconfig.server.json`（server 出力用）の 2 本。vendored alias は paths で配線。
````

- [ ] **Step 5: `.apm/instructions/workflow.instructions.md` を作成**

````markdown
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

- いかなる場合でも日本語で記述する。
- 指摘は GitHub の Suggestion 機能で修正コードを示す。
- 何が課題かを文頭に書いてから詳細を説明する。

## GitHub 運用

- コードオーナー: すべて @ROhta
- セキュリティ: GitHub Security Policy を参照
- （GitHub Actions / Pages / 外形監視は現状未導入）
````

- [ ] **Step 6: `apm.yml` を作成**

```yaml
name: bingo-mcp
version: 0.1.0
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
        - git+https://github.com/oraios/serena@c3a8d5a9c54622c8ce771a54e5feffd6efda8749
        - serena
        - start-mcp-server
  apm:
    - github/awesome-copilot/instructions/code-review-generic.instructions.md#5b049e4e196c10aab8ddfd9e492323d08cf985b0
    - obra/superpowers#f2cbfbefebbfef77321e4c9abc9e949826bea9d7
```

> 注: 上記 SHA は bingo の既知良好値を初期ピンとして使用。Task 4 の `apm install` 後、`apm.lock.yaml` の `resolved_commit` を見て、実際に解決された SHA に合わせて再ピンする（unpinned 警告が出たら必ずピン）。

- [ ] **Step 7: `.github/copilot-instructions.md`（スタブ）を作成**

```markdown
# Copilot 向け指示（スタブ）

このリポジトリの AI エージェント向け指示の Source of Truth は [`.apm/instructions/`](../.apm/instructions/) 配下にあります。

PR レビュー方針は [`.apm/instructions/workflow.instructions.md`](../.apm/instructions/workflow.instructions.md) を参照してください。

> このファイルは APM の管理対象外スタブです（Copilot Code Review が `AGENTS.md` を読まないための入口）。指示本体は `.apm/instructions/` を編集し `apm install` で再生成します。
```

- [ ] **Step 8: コミット**

```bash
git add .apm/instructions/ apm.yml .github/copilot-instructions.md
git commit -m "feat: APM 指示書5本・apm.yml・Copilot スタブを追加（SoT）"
```

---

## Task 4: `apm install` 実行・dedupe 要否判定・`apm.lock.yaml` 追跡

**Files:**

- 生成（追跡）: `apm.lock.yaml`
- Create（条件付き）: `scripts/dedupe-apm-lock.mjs`
- Modify（条件付き）: `package.json`（`apm-install` script）

- [ ] **Step 1: `apm install` を実行**

Run:

```bash
apm install
```

Expected: `apm_modules/` にダウンロード、`.claude/rules/` / `.github/instructions/` / `.mcp.json` / `.vscode/mcp.json` / `.codex/` / skills 等が生成、`apm.lock.yaml` が生成される。`unpinned` 警告が出たら `apm.yml` の該当依存を `apm.lock.yaml` の `resolved_commit` で `#<sha>` ピンして再実行。

- [ ] **Step 2: lockfile の重複バグ（v0.14.1 の既知問題）が 0.19.0 で再現するか確認**

Run:

```bash
grep -nE '^([ \t]*-[ \t]+.+)$' apm.lock.yaml | awk '{print $0}' | sort | uniq -d | head
# より厳密に「隣接行の重複」を検出
awk 'prev==$0 && $0 ~ /^[ \t]*-[ \t]+/ {print NR": "$0} {prev=$0}' apm.lock.yaml
```

Expected:

- **重複が無い**（出力なし）→ dedupe スクリプトは**不要**。Step 3a へ。
- **重複がある** → Step 3b へ（dedupe スクリプト導入）。

- [ ] **Step 3a:（重複が無い場合）`apm-install` script を素の apm install で追加**

`package.json` の `scripts` に追加:

```json
"apm-install": "apm install"
```

- [ ] **Step 3b:（重複がある場合のみ）dedupe スクリプトを導入**

`scripts/dedupe-apm-lock.mjs` を作成:

```js
#!/usr/bin/env node
// APM CLI が apm.lock.yaml の `deployed_files:` 配列に同一パスを 2 回出力する不具合への
// post-process。隣接した同一の `- <value>` 行を 1 行に畳む（YAML パーサ非依存）。
import {readFileSync, writeFileSync} from "node:fs"

const PATH = "apm.lock.yaml"
const original = readFileSync(PATH, "utf-8")

let deduped = original
let prev
do {
	prev = deduped
	deduped = deduped.replace(/^([ \t]*-[ \t]+.+)$\n\1$/gm, "$1")
} while (deduped !== prev)

if (deduped === original) {
	console.log(`${PATH}: no adjacent duplicate array entries found.`)
	process.exit(0)
}

writeFileSync(PATH, deduped)
const removed = original.split("\n").length - deduped.split("\n").length
console.log(`${PATH}: removed ${removed} duplicate line(s).`)
```

`package.json` の `scripts` に追加:

```json
"apm-install": "apm install && node scripts/dedupe-apm-lock.mjs"
```

Run（dedupe を一度かける）:

```bash
node scripts/dedupe-apm-lock.mjs
```

Expected: 重複行が除去される。`apm.instructions.md` の「ローカルでの作業」節と整合（必要なら注記を追記）。

- [ ] **Step 4: 生成物が追跡されないことを確認**

Run:

```bash
git status --porcelain | grep -E '(^|\s)(CLAUDE\.md|AGENTS\.md|\.claude/|\.github/instructions/|\.mcp\.json|\.vscode/mcp\.json|\.codex/|apm_modules/)' && echo "!! 生成物が見えている（gitignore 漏れ）" || echo "生成物は追跡対象外 (OK)"
```

Expected: `生成物は追跡対象外 (OK)`。

- [ ] **Step 5: コミット**

```bash
git add apm.lock.yaml package.json
# Step 3b を実施した場合のみ:
git add scripts/dedupe-apm-lock.mjs
git commit -m "chore: apm install で apm.lock.yaml を生成・追跡（apm-install script 追加）"
```

---

## Task 5: `apm compile` 検証（生成物が SoT を正しく反映するか）

**Files:** なし（検証のみ。生成物は追跡しない）

- [ ] **Step 1: `apm compile` を実行**

Run:

```bash
apm compile
```

Expected: `CLAUDE.md` / `AGENTS.md` が生成される。

- [ ] **Step 2: 生成物に 5 本の指示内容が反映されていることを確認**

Run:

```bash
for kw in "APM 運用ルール" "アーキテクチャと実装方針" "Widget の UI" "開発環境" "ワークフロー"; do
  grep -q "$kw" CLAUDE.md AGENTS.md && echo "OK: $kw" || echo "MISSING: $kw"
done
```

Expected: すべて `OK`。

- [ ] **Step 3: MCP 設定が 3 サーバーを含むことを確認**

Run:

```bash
for s in semgrep context7 serena; do grep -q "$s" .mcp.json && echo "OK: $s" || echo "MISSING: $s"; done
grep -q chrome-devtools .mcp.json && echo "!! chrome-devtools が混入" || echo "chrome-devtools 不在 (OK)"
```

Expected: 3 サーバーすべて `OK`、chrome-devtools 不在。

- [ ] **Step 4: 生成物が git status に現れないことを再確認**

Run:

```bash
git status --short
```

Expected: 追跡対象（次の Task で触る README 等）以外は何も出ない。`CLAUDE.md` / `AGENTS.md` / `.mcp.json` / `.codex/` 等が `??` で出ないこと。

---

## Task 6: README を薄化（濃い設計内容は指示書へ移設済み）

**Files:**

- Modify: `README.md`（全面置換）

- [ ] **Step 1: `README.md` を以下の内容で置き換える**

````markdown
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
````

> 注: 旧 README にあった「乱数と公平性」「状態の検証境界」「submodule 依存の分類」の詳細は `architecture` / `widget` 指示書へ移設済み（情報は失っていない）。

- [ ] **Step 2: コミット**

```bash
git add README.md
git commit -m "docs: README を薄化し .apm/instructions/ への索引に再構成"
```

---

## Task 7: 最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: ビルド・テスト・型チェック・lint がすべて通る**

Run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm build && pnpm exec eslint .
```

Expected: すべて成功。

- [ ] **Step 2: 追跡対象が想定どおりであることを確認**

Run:

```bash
git status --short
git ls-files | grep -E '^(apm\.yml|apm\.lock\.yaml|\.apm/|\.github/copilot-instructions\.md|eslint\.config\.mjs|\.husky/pre-commit)'
```

Expected: 作業ツリーはクリーン。SoT・lock・lint 設定が追跡されている。生成物（`CLAUDE.md` / `.claude/rules/` / `.mcp.json` / `.codex/` 等）は出ない。

- [ ] **Step 3: `pnpm apm-install` の冪等性確認**

Run:

```bash
pnpm apm-install
git status --short
```

Expected: 再実行しても `apm.lock.yaml` に差分が出ない（dedupe 導入時も安定）。差分が出るなら lockfile 安定性を調査。

- [ ] **Step 4: PR 作成**

`finishing-a-development-branch` スキルに従って PR を作成する。PR 本文に「実装は設計書 `docs/specs/2026-06-10-apm-integration-design.md`（PR #12）に基づく」と明記。

---

## 自己レビュー結果（spec 突き合わせ）

- **spec §3 追跡境界 / .gitignore** → Task 1（install 前順序を明示）。
- **spec §4 apm.yml（3 MCP・2 APM・SHA ピン）** → Task 3 Step 6。
- **spec §5 dedupe（検証して条件付き）** → Task 4（0.19.0 で実測 → 条件分岐）。
- **spec §6 指示書 5 本** → Task 3 Step 1-5（全文を記載、placeholder 無し）。
- **spec §7 lint ツール** → Task 2（devDeps・eslint.config.mjs・prettier/lint-staged・husky）。
- **spec §8 README 薄化** → Task 6。
- **spec §9 apm CLI 前提** → Task 0 ＋ `development` 指示書。
- **spec §10 検証計画** → Task 5・Task 7。
- **型/名称整合**: `gameStateShape` / `randomIndex` / `seedLocalStorage` / `assertBingoNumbers` / `drawFromState` は既存コードの名称と一致。
- **placeholder 無し**: 各ファイルは全文記載。SHA は「初期ピン＋install 後に再ピン」と手順化（TBD ではない）。
