# bingo_mcp 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude（web/desktop）のチャットから MCP Apps ウィジェットとしてビンゴ（抽選機＋5×5カード判定）を遊べるようにする。

**Architecture:** サーバーは平データの GameState チェックポイントのみ保持（抽選しない）。ウィジェット(iframe=ブラウザ)が各 render で `localStorage` を再シードして submodule の `NumberList` を実行し、結果をサーバーへ `sync_state` で同期。RNG はウィジェットの `NumberList` に一本化。

**Tech Stack:** TypeScript / `@modelcontextprotocol/sdk` / `@modelcontextprotocol/ext-apps`(+`/server`) / esbuild(widget単一HTMLバンドル) / vitest(+jsdom) / pnpm / git submodule(`vendor/bingo`)。

**設計書:** `docs/specs/2026-06-02-bingo-mcp-app-design.md`（本計画の根拠）

> **依存インストールの注意:** 本計画の `pnpm add` 系は、実行時に必ずユーザーの明示許可を得てから走らせること（パッケージインストールは無断実行しない）。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `vendor/bingo/` | 既存ビンゴ抽選機（git submodule・無改変）。`NumberList` を再利用 |
| `src/shared/types.ts` | `GameState` / `Card` / `Cell` / `Line` 等の共有型（純粋・依存なし） |
| `src/widget/card.ts` | カード生成・マーク・リーチ/ビンゴ判定（純関数・依存なし） |
| `src/widget/hydrate.ts` | サーバー state ⇄ `localStorage` 再シード（ブラウザAPI依存） |
| `src/widget/draw.ts` | 抽選フロー（`NumberList` 利用・ブラウザAPI依存） |
| `src/widget/main.ts` | ウィジェット起動・描画・App ブリッジ配線 |
| `src/widget/index.html` | 盤面 UI テンプレート（Bootstrap、`<!--BUNDLE-->` 差込点） |
| `src/server/index.ts` | MCP サーバー（`ui://bingo/board` 登録・ツール・stdio/HTTP） |
| `esbuild.mjs` | widget を単一 HTML(`dist/mcp-app.html`)へバンドル（mp3 を data: URL 化） |
| `vitest.config.ts` | テスト設定（alias・環境） |
| `tsconfig.json` / `package.json` | プロジェクト設定 |

---

## Phase 0: フィージビリティ・スパイク（着手前必須）

設計書 §13(B)。ext-apps の不確実な能力を最小実装で検証し、後続タスクが依存する API/挙動を**確定して記録**する。

### Task 0: ext-apps 能力スパイク

**Files:**
- Create: `spike/` 配下に最小サーバー＋hello widget（後で破棄してよい）
- Create: `docs/plans/PHASE0-findings.md`（検証結果の記録）

- [ ] **Step 1: ext-apps の公式サンプルとテストホストを入手**

Run:
```bash
git clone https://github.com/modelcontextprotocol/ext-apps.git /tmp/ext-apps
ls /tmp/ext-apps/examples/   # 実在する例を確認
```
Expected: `examples/basic-server-vanillajs`（最小確認用）と `examples/budget-allocator-server`（structuredContent/outputSchema の実例）等が存在する。

- [ ] **Step 2: hello widget をレンダリングする最小サーバーを作る**

`examples/basic-server-vanillajs` を雛形に、`registerAppResource`/`registerAppTool` で `ui://hello/board` を返す最小サーバーを `spike/` に作成し、付属のテストホスト（または MCP Inspector）で iframe 描画されることを確認。

- [ ] **Step 3: 4つの能力を確認し記録する**

`docs/plans/PHASE0-findings.md` に、以下を**実際のAPI名・型・可否**として記録：
1. `start_bingo` ハンドラの戻りに `structuredContent` を入れると、widget 側の `app.ontoolresult(result)` で `result.structuredContent` として受け取れるか（型・フィールド名）。
2. `registerAppTool` の `inputSchema` の正確な記法（zod raw shape か JSON schema か）。
3. widget → `app.callServerTool({name,arguments})` の戻り型と、それで `sync_state` が呼べるか。
4. widget → モデルへ要約を送る API（`ui/update-model-context` / `ui/message`）の**具体的なメソッド名**（例: `app.updateModelContext(...)` 等）。無ければ「無し」と記録。

- [ ] **Step 4: フォールバック方針を確定**

(3) 不可 → `draw_number` は「開き直して resume＋単発抽選」に変更。(4) 無し → モデルへのナレーションは諦め、ウィジェット表示のみ。findings に明記。

- [ ] **Step 5: Commit**

```bash
git add docs/plans/PHASE0-findings.md
git commit -m "docs: record Phase 0 ext-apps feasibility findings"
```

> **以降のタスクは PHASE0-findings.md の確定事項に従う。** 特に Task 9/10 のツール戻り・通信 API は findings の名称で実装する。

---

## Phase 1: 足場

### Task 1: プロジェクト雛形・submodule・依存

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitmodules`(submodule追加で自動)

- [ ] **Step 1: submodule を追加**

Run:
```bash
git submodule add https://github.com/ROhta/bingo vendor/bingo
git submodule update --init --recursive
cat vendor/bingo/src/ts/numberList.ts | head -5
```
Expected: `export default class NumberList {` が見える。

- [ ] **Step 2: `package.json` を作成**

```json
{
  "name": "bingo-mcp",
  "version": "0.1.0",
  "private": true,
  "license": "GPL-3.0-or-later",
  "type": "module",
  "bin": { "bingo-mcp": "dist/server/index.js" },
  "scripts": {
    "build:widget": "node esbuild.mjs",
    "build:server": "tsc -p tsconfig.server.json",
    "build": "pnpm build:widget && pnpm build:server",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: 依存を追加（要・実行許可）**

Run:
```bash
pnpm add @modelcontextprotocol/sdk @modelcontextprotocol/ext-apps
pnpm add -D typescript esbuild vitest jsdom zod @types/node
```
Expected: `node_modules/@modelcontextprotocol/ext-apps/server` が存在する。

- [ ] **Step 4: tsconfig を2つ作成（型検査用ベース＋サーバー出力用）**

`tsconfig.json`（全体の型検査用。`noEmit:true` のため vendor の .ts を含めても rootDir 制約に当たらない）:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "paths": { "@vendor/bingo/numberList": ["vendor/bingo/src/ts/numberList.ts"] },
    "baseUrl": "."
  },
  "include": ["src/**/*.ts", "vendor/bingo/src/ts/numberList.ts"]
}
```

`tsconfig.server.json`（サーバーのみ出力。vendor を import する widget の .ts を含めないため TS6059 を回避）:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src" },
  "include": ["src/server/**/*.ts", "src/shared/**/*.ts", "src/widget/card.ts"]
}
```

> server が widget から参照するのは vendor 非依存の `card.ts` のみなので include に含める。`draw.ts`/`main.ts`/`hydrate.ts`（vendor/DOM 依存）は esbuild がバンドルし、型検査は `pnpm typecheck`（ベース tsconfig・noEmit）が担う。これで `rootDir:"src"` を保ったまま（＝`dist/server/index.js` の出力位置と実行時 `../../dist/mcp-app.html` パスを壊さず）ビルドできる。

- [ ] **Step 5: Commit**

```bash
git add .gitmodules vendor/bingo package.json tsconfig.json tsconfig.server.json pnpm-lock.yaml
git commit -m "chore: scaffold project with bingo submodule and deps"
```

### Task 2: テスト基盤

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: `vitest.config.ts` を作成（submodule alias を解決）**

```ts
import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@vendor/bingo/numberList": fileURLToPath(
        new URL("./vendor/bingo/src/ts/numberList.ts", import.meta.url),
      ),
    },
  },
  test: { environment: "node" }, // 個別ファイルで jsdom に切替（docblock）
})
```

- [ ] **Step 2: スモークテストで基盤を確認**

Create `src/shared/smoke.test.ts`:
```ts
import { expect, test } from "vitest"
test("test runner works", () => { expect(1 + 1).toBe(2) })
```

- [ ] **Step 3: 実行して通す**

Run: `pnpm test`
Expected: PASS（1 passed）。

- [ ] **Step 4: スモークを削除して Commit**

```bash
rm src/shared/smoke.test.ts
git add vitest.config.ts
git commit -m "test: add vitest config with submodule alias"
```

---

## Phase 2: コアロジック（純関数・TDD）

### Task 3: 共有型

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: 型を定義**

```ts
export type CellValue = number | "FREE"
export interface Cell { value: CellValue; marked: boolean }
/** 列優先: card[column][row]。列は B,I,N,G,O。5列×5行。 */
export type Card = Cell[][]
export type LineKind = "row" | "col" | "diag"
/** row/col は index 0..4。diag は index 0=左上→右下, 1=右上→左下。 */
export interface Line { kind: LineKind; index: number }
export interface Judgement { bingoLines: Line[]; reachLines: Line[] }
/** サーバーが保持する権威状態（平データ） */
export interface GameState { remain: number[]; history: number[]; card: Card }
/** 列ごとの数値レンジ B/I/N/G/O */
export const COLUMN_RANGES: readonly (readonly [number, number])[] = [
  [1, 15], [16, 30], [31, 45], [46, 60], [61, 75],
]
```

- [ ] **Step 2: 型のみのためテスト不要。Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared game types"
```

### Task 4: カード生成 `generateCard`

**Files:**
- Create: `src/widget/card.ts`
- Test: `src/widget/card.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, test } from "vitest"
import { generateCard } from "./card"
import { COLUMN_RANGES } from "../shared/types"

describe("generateCard", () => {
  test("5列×5行で生成される", () => {
    const card = generateCard()
    expect(card).toHaveLength(5)
    for (const col of card) expect(col).toHaveLength(5)
  })
  test("各列が B/I/N/G/O レンジ内の重複なし数値", () => {
    const card = generateCard()
    card.forEach((col, c) => {
      const [min, max] = COLUMN_RANGES[c]
      const values = col.map(cell => cell.value).filter((v): v is number => v !== "FREE")
      values.forEach(v => { expect(v).toBeGreaterThanOrEqual(min); expect(v).toBeLessThanOrEqual(max) })
      expect(new Set(values).size).toBe(values.length)
    })
  })
  test("中央(列2,行2)は FREE かつ marked", () => {
    const card = generateCard()
    expect(card[2][2].value).toBe("FREE")
    expect(card[2][2].marked).toBe(true)
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/widget/card.test.ts`
Expected: FAIL（`generateCard` が無い）。

- [ ] **Step 3: 最小実装**

```ts
import { Card, COLUMN_RANGES } from "../shared/types"

function pickFiveDistinct(min: number, max: number): number[] {
  const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  for (let i = pool.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    const j = Math.floor((buf[0] / 2 ** 32) * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 5)
}

export function generateCard(): Card {
  return COLUMN_RANGES.map(([min, max], col) =>
    pickFiveDistinct(min, max).map((value, row) =>
      col === 2 && row === 2
        ? { value: "FREE" as const, marked: true }
        : { value, marked: false },
    ),
  )
}
```

- [ ] **Step 4: 通す**

Run: `pnpm test src/widget/card.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/widget/card.ts src/widget/card.test.ts
git commit -m "feat: add bingo card generation"
```

### Task 5: マーク `markNumber` と判定 `judge`

**Files:**
- Modify: `src/widget/card.ts`
- Test: `src/widget/card.test.ts`（追記）

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { judge, markNumber } from "./card"
import type { Card } from "../shared/types"

// テスト用: 全マスを既知値で作るヘルパー
function makeCard(values: number[][]): Card {
  return values.map((col, c) =>
    col.map((value, r) =>
      c === 2 && r === 2
        ? { value: "FREE" as const, marked: true }
        : { value, marked: false },
    ),
  )
}
const base = () => makeCard([
  [1, 2, 3, 4, 5], [16, 17, 18, 19, 20], [31, 32, 0, 34, 35],
  [46, 47, 48, 49, 50], [61, 62, 63, 64, 65],
])

describe("markNumber", () => {
  test("該当値をマークし、元のカードは不変", () => {
    const card = base()
    const marked = markNumber(card, 1)
    expect(marked[0][0].marked).toBe(true)
    expect(card[0][0].marked).toBe(false) // 元カードは不変
    expect(marked[0][0]).not.toBe(card[0][0]) // セルオブジェクトも非共有
  })
  test("存在しない値は何も変えない", () => {
    const card = base()
    expect(markNumber(card, 99)[0][0].marked).toBe(false)
  })
})

describe("judge", () => {
  test("行が全マークでビンゴ（FREE含む中央行）", () => {
    let card = base()
    // 行2 = 各列の row=2: card[0][2]=3, card[1][2]=18, FREE, card[3][2]=48, card[4][2]=63
    for (const n of [3, 18, 48, 63]) card = markNumber(card, n)
    expect(judge(card).bingoLines).toContainEqual({ kind: "row", index: 2 })
  })
  test("列が全マークでビンゴ（FREE含む中央列）", () => {
    let card = base()
    // 列2(N) = card[2]: [31,32,FREE,34,35]
    for (const n of [31, 32, 34, 35]) card = markNumber(card, n)
    expect(judge(card).bingoLines).toContainEqual({ kind: "col", index: 2 })
  })
  test("対角0（左上→右下）が全マークでビンゴ", () => {
    let card = base()
    // card[0][0]=1, card[1][1]=17, FREE, card[3][3]=49, card[4][4]=65
    for (const n of [1, 17, 49, 65]) card = markNumber(card, n)
    expect(judge(card).bingoLines).toContainEqual({ kind: "diag", index: 0 })
  })
  test("対角1（右上→左下）が全マークでビンゴ", () => {
    let card = base()
    // card[0][4]=5, card[1][3]=19, FREE, card[3][1]=47, card[4][0]=61
    for (const n of [5, 19, 47, 61]) card = markNumber(card, n)
    expect(judge(card).bingoLines).toContainEqual({ kind: "diag", index: 1 })
  })
  test("複数ライン同時成立を全て返す", () => {
    let card = base()
    for (const n of [3, 18, 48, 63, 31, 32, 34, 35]) card = markNumber(card, n)
    const { bingoLines } = judge(card)
    expect(bingoLines).toContainEqual({ kind: "row", index: 2 })
    expect(bingoLines).toContainEqual({ kind: "col", index: 2 })
  })
  test("あと1つでリーチ", () => {
    let card = base()
    // 行0 = [1,16,31,46,61] のうち列2(31)未マーク → 4マークでリーチ
    for (const n of [1, 16, 46, 61]) card = markNumber(card, n)
    expect(judge(card).reachLines).toContainEqual({ kind: "row", index: 0 })
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/widget/card.test.ts`
Expected: FAIL（`markNumber`/`judge` 未定義）。

- [ ] **Step 3: 実装を追記**

```ts
import { Cell, Judgement, Line } from "../shared/types"

export function markNumber(card: Card, drawnNumber: number): Card {
  return card.map(col =>
    col.map(cell => (cell.value === drawnNumber ? { ...cell, marked: true } : cell)),
  )
}

const ALL_LINES: Line[] = [
  ...[0, 1, 2, 3, 4].map(index => ({ kind: "row" as const, index })),
  ...[0, 1, 2, 3, 4].map(index => ({ kind: "col" as const, index })),
  { kind: "diag", index: 0 }, { kind: "diag", index: 1 },
]

function lineCells(card: Card, line: Line): Cell[] {
  if (line.kind === "row") return card.map(col => col[line.index])
  if (line.kind === "col") return card[line.index]
  return line.index === 0 ? card.map((col, i) => col[i]) : card.map((col, i) => col[4 - i])
}

export function judge(card: Card): Judgement {
  const bingoLines: Line[] = []
  const reachLines: Line[] = []
  for (const line of ALL_LINES) {
    const marked = lineCells(card, line).filter(c => c.marked).length
    if (marked === 5) bingoLines.push(line)
    else if (marked === 4) reachLines.push(line)
  }
  return { bingoLines, reachLines }
}
```

- [ ] **Step 4: 通す**

Run: `pnpm test src/widget/card.test.ts`
Expected: PASS（全テスト）。

- [ ] **Step 5: Commit**

```bash
git add src/widget/card.ts src/widget/card.test.ts
git commit -m "feat: add card marking and bingo/reach judgement"
```

---

## Phase 3: ブラウザ依存ロジック（jsdom・TDD）

### Task 6: 再シード `hydrate.ts`

**Files:**
- Create: `src/widget/hydrate.ts`
- Test: `src/widget/hydrate.test.ts`

- [ ] **Step 1: 失敗するテストを書く（jsdom）**

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest"
import { readDrawState, seedLocalStorage } from "./hydrate"

describe("hydrate", () => {
  beforeEach(() => localStorage.clear())
  test("seed→read で remain/history が往復する", () => {
    seedLocalStorage({ remain: [3, 7, 9], history: [1, 2] })
    expect(readDrawState()).toEqual({ remain: [3, 7, 9], history: [1, 2] })
  })
  test("NumberList が読むキー名で保存される", () => {
    seedLocalStorage({ remain: [5], history: [] })
    expect(JSON.parse(localStorage.getItem("remainNumberList")!)).toEqual([5])
    expect(JSON.parse(localStorage.getItem("historyNumberList")!)).toEqual([])
  })
  test("空のときデフォルト({remain:[],history:[]})を返す", () => {
    localStorage.clear()
    expect(readDrawState()).toEqual({ remain: [], history: [] })
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/widget/hydrate.test.ts`
Expected: FAIL（モジュール無し）。

- [ ] **Step 3: 実装（キー名は `NumberList` の private と一致させる）**

```ts
import type { GameState } from "../shared/types"

const REMAIN_KEY = "remainNumberList"
const HISTORY_KEY = "historyNumberList"
type DrawState = Pick<GameState, "remain" | "history">

export function seedLocalStorage(state: DrawState): void {
  localStorage.setItem(REMAIN_KEY, JSON.stringify(state.remain))
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history))
}

export function readDrawState(): DrawState {
  return {
    remain: JSON.parse(localStorage.getItem(REMAIN_KEY) ?? "[]"),
    history: JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"),
  }
}
```

- [ ] **Step 4: 通す**

Run: `pnpm test src/widget/hydrate.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/widget/hydrate.ts src/widget/hydrate.test.ts
git commit -m "feat: add localStorage hydrate for NumberList resume"
```

### Task 7: 抽選フロー `draw.ts`

**Files:**
- Create: `src/widget/draw.ts`
- Test: `src/widget/draw.test.ts`

- [ ] **Step 1: 失敗するテストを書く（jsdom・NumberList 結合）**

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest"
import { drawNext, startDraw } from "./draw"

describe("draw", () => {
  beforeEach(() => localStorage.clear())
  test("startDraw で remain が 75 件", () => {
    const nl = startDraw()
    expect(nl.remainList).toHaveLength(75)
    expect(nl.historyList).toHaveLength(0)
  })
  test("75回引くと全て一意・76回目は null", () => {
    const nl = startDraw()
    const drawn: number[] = []
    for (let i = 0; i < 75; i++) { const n = drawNext(nl); if (n !== null) drawn.push(n) }
    expect(new Set(drawn).size).toBe(75)
    expect(Math.min(...drawn)).toBe(1)
    expect(Math.max(...drawn)).toBe(75)
    expect(nl.historyList).toHaveLength(75)
    expect(drawNext(nl)).toBeNull()
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm test src/widget/draw.test.ts`
Expected: FAIL（モジュール無し）。

- [ ] **Step 3: 実装（submodule の NumberList を default import）**

```ts
import NumberList from "@vendor/bingo/numberList"

export function startDraw(): NumberList {
  const numberList = new NumberList()
  numberList.resetLists() // remain=[1..75], history=[]
  return numberList
}

export function drawNext(numberList: NumberList): number | null {
  const remain = numberList.remainList
  if (remain.length === 0) return null
  const index = numberList.generateRandomNumber(remain.length)
  const drawnNumber = remain[index]
  numberList.remainList = remain.filter((_, i) => i !== index)
  numberList.historyList = [...numberList.historyList, drawnNumber]
  return drawnNumber
}
```

- [ ] **Step 4: 通す**

Run: `pnpm test src/widget/draw.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/widget/draw.ts src/widget/draw.test.ts
git commit -m "feat: add draw flow on top of vendored NumberList"
```

---

## Phase 4: ウィジェットとサーバー（最小・stdio）

### Task 8: ウィジェット UI とバンドラ

**Files:**
- Create: `src/widget/index.html`, `src/widget/main.ts`, `esbuild.mjs`

- [ ] **Step 1: `index.html` テンプレート**

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5/dist/css/bootstrap.min.css" rel="stylesheet" />
    <title>Bingo</title>
  </head>
  <body class="p-3">
    <div id="board"></div>
    <button id="draw" class="btn btn-primary mt-3">抽選</button>
    <div id="latest" class="display-4 my-2"></div>
    <div id="status" class="text-muted"></div>
    <!--BUNDLE-->
  </body>
</html>
```

> 注: Bootstrap を CDN 参照する場合、CSP `resourceDomains` に `cdn.jsdelivr.net` の宣言が必要（設計書 I-3）。宣言が困難なら CSS もインライン化する。判断は PHASE0-findings の CSP 挙動に従う。

- [ ] **Step 2: `main.ts`（App ブリッジ配線。API は PHASE0-findings に従う）**

```ts
import { App } from "@modelcontextprotocol/ext-apps"
import type { Card, GameState } from "../shared/types"
import { generateCard, judge, markNumber } from "./card"
import { seedLocalStorage } from "./hydrate"
import { drawNext } from "./draw"
import NumberList from "@vendor/bingo/numberList"

let card: Card = generateCard()
let numberList = new NumberList()

function render(): void {
  const { bingoLines, reachLines } = judge(card)
  document.getElementById("status")!.textContent =
    bingoLines.length ? "ビンゴ！" : reachLines.length ? `リーチ ${reachLines.length}` : ""
  // card グリッド描画（innerHTML は使わず textContent で安全に組む）
  const board = document.getElementById("board")!
  board.replaceChildren()
  for (const col of card) {
    const row = document.createElement("div")
    for (const cell of col) {
      const span = document.createElement("span")
      span.className = `badge ${cell.marked ? "bg-success" : "bg-secondary"} m-1`
      span.textContent = String(cell.value)
      row.appendChild(span)
    }
    board.appendChild(row)
  }
}

function currentState(): GameState {
  return { remain: numberList.remainList, history: numberList.historyList, card }
}

const app = new App({ name: "Bingo", version: "0.1.0" })

// start_bingo / sync_state の structuredContent でゲーム状態を受領（フィールド名は findings に従う）
app.ontoolresult = result => {
  const state = result.structuredContent as GameState | undefined
  if (!state) return
  card = state.card
  seedLocalStorage({ remain: state.remain, history: state.history })
  numberList = new NumberList()
  render()
}

document.getElementById("draw")!.addEventListener("click", async () => {
  const n = drawNext(numberList)
  if (n === null) { document.getElementById("status")!.textContent = "全て抽選済み"; return }
  card = markNumber(card, n)
  document.getElementById("latest")!.textContent = String(n)
  render()
  await app.callServerTool({ name: "sync_state", arguments: { state: currentState() } })
})

app.connect()
render()
```

- [ ] **Step 3: `esbuild.mjs`（単一HTML化・mp3 を data: URL）**

```js
import * as esbuild from "esbuild"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const result = await esbuild.build({
  entryPoints: ["src/widget/main.ts"],
  bundle: true, format: "iife", target: "es2022", write: false,
  loader: { ".mp3": "dataurl" },
  // 相対 alias は cwd 依存になるため絶対パス化（vitest.config.ts と同方式）
  alias: {
    "@vendor/bingo/numberList": fileURLToPath(
      new URL("./vendor/bingo/src/ts/numberList.ts", import.meta.url),
    ),
  },
})
const js = result.outputFiles[0].text
const template = await readFile("src/widget/index.html", "utf-8")
await mkdir("dist", { recursive: true })
await writeFile("dist/mcp-app.html", template.replace("<!--BUNDLE-->", `<script>${js}</script>`))
console.log("wrote dist/mcp-app.html")
```

- [ ] **Step 4: バンドル成功を確認**

Run: `pnpm build:widget`
Expected: `wrote dist/mcp-app.html` が出力され、`dist/mcp-app.html` に `<script>` が含まれる。

- [ ] **Step 5: Commit**

```bash
git add src/widget/index.html src/widget/main.ts esbuild.mjs
git commit -m "feat: add widget UI and single-file bundler"
```

### Task 9: MCP サーバー（stdio・start_bingo / sync_state）

**Files:**
- Create: `src/server/index.ts`

- [ ] **Step 1: サーバー実装（`registerAppTool` の schema 記法は findings に従う）**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { generateCard } from "../widget/card.js"
import type { GameState } from "../shared/types.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const RESOURCE_URI = "ui://bingo/board"
let game: GameState | null = null // 単一盤面（設計書 §9 単一盤面ポリシー）

const freshGame = (): GameState => ({
  remain: Array.from({ length: 75 }, (_, i) => i + 1), history: [], card: generateCard(),
})

// GameState の zod スキーマ（raw shape は SDK が z.object() で自動ラップ）
const cellSchema = z.object({
  value: z.union([z.number(), z.literal("FREE")]),
  marked: z.boolean(),
})
const gameStateShape = {
  remain: z.array(z.number()),
  history: z.array(z.number()),
  card: z.array(z.array(cellSchema)),
}

const server = new McpServer({ name: "bingo-mcp", version: "0.1.0" })

registerAppResource(server, RESOURCE_URI, RESOURCE_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => {
  const html = await readFile(path.join(here, "../../dist/mcp-app.html"), "utf-8")
  return { contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }] }
})

registerAppTool(server, "start_bingo", {
  title: "ビンゴを開始",
  description: "ビンゴ盤面を開く。既存があれば再開、無ければ新規。",
  inputSchema: { mode: z.enum(["resume", "fresh"]).optional() },
  outputSchema: gameStateShape,
  _meta: { ui: { resourceUri: RESOURCE_URI } },
}, async ({ mode }) => {
  if (mode === "fresh" || game === null) game = freshGame()
  return { content: [{ type: "text", text: "ビンゴ盤面を開きました。" }], structuredContent: game }
})

registerAppTool(server, "sync_state", {
  title: "状態同期",
  description: "ウィジェットからゲーム状態を保存する。",
  inputSchema: { state: z.object(gameStateShape) },
  outputSchema: gameStateShape,
  _meta: { ui: { resourceUri: RESOURCE_URI } },
}, async ({ state }) => {
  game = state as GameState
  const latest = game.history.at(-1)
  return { content: [{ type: "text", text: latest ? `抽選: ${latest}` : "同期しました。" }], structuredContent: game }
})

await server.connect(new StdioServerTransport())
```

- [ ] **Step 2: ビルド**

Run: `pnpm build`
Expected: `dist/server/index.js` と `dist/mcp-app.html` が生成される。

- [ ] **Step 3: Claude Desktop に登録して描画確認（手動結合テスト）**

Run:
```bash
claude mcp add bingo-mcp -- node /home/ore/codes/bingo_mcp/dist/server/index.js
```
Claude Desktop を再起動し、チャットで「ビンゴやりたい」→ `start_bingo` が呼ばれ盤面ウィジェットが描画、「抽選」ボタンで番号が出てカードがマークされることを確認。

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: add MCP server with start_bingo and sync_state (stdio)"
```

---

## Phase 5: チャット駆動と演出

### Task 10: `draw_number` / `reset_game` / 演出 / ナレーション

**Files:**
- Modify: `src/server/index.ts`, `src/widget/main.ts`

- [ ] **Step 1: `reset_game` と `draw_number` をサーバーに追加**

`reset_game`（`game=freshGame()`、structuredContent 返す）を追加。`draw_number` は PHASE0-findings に従い、(a) tool-input で widget に draw 意図を渡せるなら新 View で抽選、(b) 不可なら「resume＋widget 側自動 1 抽選」フォールバック。findings の確定方式で実装。

- [ ] **Step 2: 演出（mp3 inline）を widget に追加**

`main.ts` で `import drumroll from "@vendor/bingo/materials/drumroll.mp3"` 等を取り込み（esbuild が data: URL 化）、抽選時に `new Audio(drumroll).play()`、ビンゴ時に `cymbals`。alias を esbuild に追加。

- [ ] **Step 3: ナレーション（findings に従う）**

`ui/update-model-context` 等が存在すれば、抽選/ビンゴ時にモデルへ要約を送る。無ければスキップ（findings の決定通り）。

- [ ] **Step 4: ビルド＆Claude Desktop で結合確認**

Run: `pnpm build` → Claude Desktop でチャット「次引いて」での抽選、リセット、演出、（あれば）ナレーションを確認。

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts src/widget/main.ts esbuild.mjs
git commit -m "feat: add chat-driven draw, reset, audio and narration"
```

---

## Phase 6: リモート共有（HTTP Connector）

### Task 11: Streamable HTTP トランスポートとセッション分離

**Files:**
- Modify: `src/server/index.ts`（または `src/server/http.ts` を追加）

- [ ] **Step 1: HTTP トランスポートを追加**

`@modelcontextprotocol/sdk` の `StreamableHTTPServerTransport` で `/mcp` を公開。起動引数 `--http` で stdio と切替（ロジック・ツール・リソースは共通）。**ステートフルモード**（`sessionIdGenerator` を設定し `Mcp-Session-Id` ヘッダでセッション識別、サーバーインスタンスを保持）を採用する — 公式の最小例はステートレス（`sessionIdGenerator: undefined`）で、その形では Step 2 の `Map<sessionId, GameState>` が成立しないため。

- [ ] **Step 2: セッション分離**

単一 `game` を `Map<sessionId, GameState>` に変更し、ツールハンドラで MCP セッションIDをキーに引く（複数利用者が独立した盤面を持つ。設計書 §10）。`sessionId` の取得方法は SDK のセッションAPIに従う。

- [ ] **Step 3: claude.ai(web) で結合確認**

ローカル HTTP を一時公開（trycloudflare 等）し、claude.ai の Connectors に URL 登録 → web 上で盤面描画・抽選・同期を確認（web は sandbox proxy 経由のためレンダリング経路が desktop と異なる。設計書 §11）。

- [ ] **Step 4: Commit**

```bash
git add src/server
git commit -m "feat: add Streamable HTTP transport with per-session state"
```

---

## Self-Review チェック結果

- **Spec coverage**: 抽選機再現(Task7)/カード判定(Task4,5)/忠実な再利用=submodule＋NumberList(Task1,7)/C案状態権威(Task9 server checkpoint＋Task8 hydrate)/mimeType(Task9 `RESOURCE_MIME_TYPE`)/mp3 inline(Task10)/Phase0スパイク(Task0)/両対応(Task9 stdio・Task11 HTTP)/単一盤面(Task9)/枯渇(Task7 `null`) — 設計書の各節に対応タスクあり。
- **型整合**: `GameState{remain,history,card}`（設計書の重複していた `marks` は `Cell.marked` に統合）、`Card=Cell[][]`(列優先)、`judge(card)→{bingoLines,reachLines}`、`drawNext()→number|null`、`markNumber(card,n)` — 全タスクで一貫。
- **不確実API**: ext-apps の `ontoolresult`/`structuredContent` フィールド名・`inputSchema` 記法・モデルコンテキスト送信 API・`draw_number` の host→widget 経路は **Task0(Phase0)で確定**し、Task9/10 はその確定値で実装する旨を明記（推測で固定しない）。

## PR #2 レビュー反映（2エージェント独立レビュー＋SDK一次確認）

- **C-1**: Task5 行ビンゴテストのマーク値を列2値`[31,32,34,35]`→行2値`[3,18,48,63]`に修正。列/対角0/対角1/複数ライン同時のテストを追加（全値検算済み）。
- **C-2**: `tsconfig.json`(noEmit・型検査用)と`tsconfig.server.json`(出力用・widget除外)に分離し TS6059 を回避。`typecheck` スクリプト追加。
- **I-1**: `start_bingo`/`sync_state` に `outputSchema`(GameState zod)を付与、`sync_state` 入力を `z.any()`→`z.object(gameStateShape)` に厳格化。
- **I-2**: Task0 参照例を `basic-server-vanillajs`/`budget-allocator-server`(実在)へ修正。
- **I-3**: Task11 を `StreamableHTTPServerTransport` ステートフル(`sessionIdGenerator`設定・`Mcp-Session-Id`)へ明記。
- **I-4**: esbuild alias を `fileURLToPath` で絶対パス化。
- **I-5**: 設計書 §9b/§9/§4 を本計画のAPI(`markNumber`/`judge(card)`/`GameState`に`marks`なし)へ追従更新。
