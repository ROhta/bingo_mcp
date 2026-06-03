import {describe, expect, test} from "vitest"
import {drawFromState, freshGame} from "./game"
import {isValidCard} from "../widget/card"

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
