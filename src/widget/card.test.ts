import {describe, expect, test} from "vitest"
import {generateCard, isValidCard, judge, lineCells, markNumber, randomIndex} from "./card"
import {COLUMN_RANGES, type Card} from "../shared/types"

describe("randomIndex", () => {
	test("maxExclusive=1 は常に 0（floor で上端 maxExclusive に達しない契約）", () => {
		// Math.round/ceil への退行を確定的に検出（round なら ~40% で 1 を返し落ちる）
		for (let i = 0; i < 100; i++) expect(randomIndex(1)).toBe(0)
	})
})

describe("generateCard", () => {
	test("5列×5行で生成される", () => {
		const card = generateCard()
		expect(card).toHaveLength(5)
		for (const col of card) expect(col).toHaveLength(5)
	})
	test("各列が B/I/N/G/O レンジ内の重複なし数値", () => {
		const card = generateCard()
		card.forEach((col, c) => {
			const [min, max] = COLUMN_RANGES[c]!
			const values = col.map(cell => cell.value).filter((v): v is number => v !== "FREE")
			values.forEach(v => {
				expect(v).toBeGreaterThanOrEqual(min)
				expect(v).toBeLessThanOrEqual(max)
			})
			expect(new Set(values).size).toBe(values.length)
		})
	})
	test("中央(列2,行2)は FREE かつ marked", () => {
		const card = generateCard()
		expect(card[2]![2]!.value).toBe("FREE")
		expect(card[2]![2]!.marked).toBe(true)
	})
	test("生成直後のマークは中央FREEの1個だけ", () => {
		expect(generateCard().flat().filter(c => c.marked)).toHaveLength(1)
	})
})

function makeCard(values: number[][]): Card {
	return values.map((col, c) =>
		col.map((value, r) => (c === 2 && r === 2 ? {value: "FREE" as const, marked: true} : {value, marked: false})),
	)
}
const base = (): Card =>
	makeCard([
		[1, 2, 3, 4, 5],
		[16, 17, 18, 19, 20],
		[31, 32, 0, 34, 35],
		[46, 47, 48, 49, 50],
		[61, 62, 63, 64, 65],
	])

describe("markNumber", () => {
	test("該当値をマークし、元のカードは不変", () => {
		const card = base()
		const marked = markNumber(card, 1)
		expect(marked[0]![0]!.marked).toBe(true)
		expect(card[0]![0]!.marked).toBe(false)
		expect(marked[0]![0]).not.toBe(card[0]![0])
	})
	test("存在しない値は何も変えない", () => {
		const card = base()
		expect(markNumber(card, 99)[0]![0]!.marked).toBe(false)
	})
})

describe("judge", () => {
	test("行が全マークでビンゴ（FREE含む中央行）", () => {
		let card = base()
		// 行2 = 各列の row=2: 3,18,FREE,48,63
		for (const n of [3, 18, 48, 63]) card = markNumber(card, n)
		expect(judge(card).bingoLines).toContainEqual({kind: "row", index: 2})
	})
	test("列が全マークでビンゴ（FREE含む中央列）", () => {
		let card = base()
		// 列2(N) = card[2]: 31,32,FREE,34,35
		for (const n of [31, 32, 34, 35]) card = markNumber(card, n)
		expect(judge(card).bingoLines).toContainEqual({kind: "col", index: 2})
	})
	test("対角0（左上→右下）が全マークでビンゴ", () => {
		let card = base()
		// card[0][0]=1, card[1][1]=17, FREE, card[3][3]=49, card[4][4]=65
		for (const n of [1, 17, 49, 65]) card = markNumber(card, n)
		expect(judge(card).bingoLines).toContainEqual({kind: "diag", index: 0})
	})
	test("対角1（右上→左下）が全マークでビンゴ", () => {
		let card = base()
		// card[0][4]=5, card[1][3]=19, FREE, card[3][1]=47, card[4][0]=61
		for (const n of [5, 19, 47, 61]) card = markNumber(card, n)
		expect(judge(card).bingoLines).toContainEqual({kind: "diag", index: 1})
	})
	test("複数ライン同時成立を全て返す", () => {
		let card = base()
		for (const n of [3, 18, 48, 63, 31, 32, 34, 35]) card = markNumber(card, n)
		const {bingoLines} = judge(card)
		expect(bingoLines).toContainEqual({kind: "row", index: 2})
		expect(bingoLines).toContainEqual({kind: "col", index: 2})
	})
	test("あと1つでリーチ", () => {
		let card = base()
		// 行0 = [1,16,31,46,61] のうち列2(31)未マーク → 4マークでリーチ
		for (const n of [1, 16, 46, 61]) card = markNumber(card, n)
		expect(judge(card).reachLines).toContainEqual({kind: "row", index: 0})
	})
	test("新規カード(FREEのみ)はビンゴもリーチも無い", () => {
		const {bingoLines, reachLines} = judge(base())
		expect(bingoLines).toEqual([])
		expect(reachLines).toEqual([])
	})
	test("3マークはリーチでもビンゴでもない", () => {
		let card = base()
		for (const n of [1, 16, 31]) card = markNumber(card, n) // 行0を3/5
		const {bingoLines, reachLines} = judge(card)
		expect(reachLines).not.toContainEqual({kind: "row", index: 0})
		expect(bingoLines).toEqual([])
	})
	test("ビンゴ成立ラインは reachLines に含まれない（else if で排他）", () => {
		let card = base()
		for (const n of [3, 18, 48, 63]) card = markNumber(card, n) // 行2ビンゴ
		const {bingoLines, reachLines} = judge(card)
		expect(bingoLines).toContainEqual({kind: "row", index: 2})
		expect(reachLines).not.toContainEqual({kind: "row", index: 2})
	})
})

describe("lineCells", () => {
	test("diag1 は card[i][4-i] を返す", () => {
		expect(lineCells(base(), {kind: "diag", index: 1}).map(c => c.value)).toEqual([5, 19, "FREE", 47, 61])
	})
})

describe("isValidCard", () => {
	test("正しい5×5カードを受理する", () => {
		expect(isValidCard(generateCard())).toBe(true)
		expect(isValidCard(base())).toBe(true)
	})
	test("形状不正を拒否する", () => {
		expect(isValidCard(null)).toBe(false)
		expect(isValidCard("x")).toBe(false)
		expect(isValidCard([])).toBe(false)
		expect(isValidCard(generateCard().slice(0, 4))).toBe(false) // 4列
		expect(isValidCard([[{value: 1, marked: false}]])).toBe(false) // 列が短い
		expect(isValidCard([[{value: 1}]])).toBe(false) // marked 欠落
	})
})
