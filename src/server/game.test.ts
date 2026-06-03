import {describe, expect, test} from "vitest"
import {describeDraw, drawFromState, freshGame} from "./game"
import {isValidCard} from "../widget/card"
import type {Card} from "../shared/types"

// テスト用カード: 列 B/I/N/G/O、中央 FREE。markedValues に含む値だけ marked。
function cardWith(markedValues: number[]): Card {
	const base = [
		[1, 2, 3, 4, 5],
		[16, 17, 18, 19, 20],
		[31, 32, 0, 34, 35],
		[46, 47, 48, 49, 50],
		[61, 62, 63, 64, 65],
	]
	return base.map((col, c) =>
		col.map((value, r) =>
			c === 2 && r === 2 ? {value: "FREE" as const, marked: true} : {value, marked: markedValues.includes(value)},
		),
	)
}

describe("freshGame", () => {
	test("remain=1..75 / history=空 / 有効な5×5カード", () => {
		const game = freshGame()
		expect(game.remain).toHaveLength(75)
		expect(game.remain[0]).toBe(1)
		expect(game.remain.at(-1)).toBe(75)
		expect(new Set(game.remain).size).toBe(75)
		expect(game.history).toEqual([])
		expect(isValidCard(game.card)).toBe(true)
	})

	test("毎回新しいカード（カードは共有参照でない）", () => {
		expect(freshGame().card).not.toBe(freshGame().card)
	})
})

describe("drawFromState", () => {
	test("1つ引くと remain-1 / history+1 / 元は不変", () => {
		const before = freshGame()
		const after = drawFromState(before)
		expect(after.remain).toHaveLength(74)
		expect(after.history).toHaveLength(1)
		const drawn = after.history[0]!
		expect(before.remain).toContain(drawn)
		expect(after.remain).not.toContain(drawn)
		expect(before.remain).toHaveLength(75) // 不変
	})

	test("75回で引き切り、一意、それ以上は同一参照を返す", () => {
		let game = freshGame()
		for (let i = 0; i < 75; i++) game = drawFromState(game)
		expect(game.remain).toHaveLength(0)
		expect(new Set(game.history).size).toBe(75)
		expect(drawFromState(game)).toBe(game) // 残り0はそのまま
	})
})

describe("describeDraw", () => {
	test("カードにある番号はヒット＋自動マーク済みと伝える", () => {
		const text = describeDraw(cardWith([]), 1) // 1 は B 列にある
		expect(text).toContain("1 を抽選")
		expect(text).toContain("カードにあった")
		expect(text).not.toContain("タップ")
	})
	test("カードに無い番号はミスと伝える", () => {
		expect(describeDraw(cardWith([]), 99)).toBe("99 を抽選。カードにはありませんでした。")
	})
	test("ビンゴ成立ラインを含む場合は告知する", () => {
		// 行0 = [1,16,31,46,61] を全マーク
		const text = describeDraw(cardWith([1, 16, 31, 46, 61]), 1)
		expect(text).toContain("ビンゴ")
	})
})
