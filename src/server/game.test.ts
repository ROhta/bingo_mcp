import {describe, expect, test} from "vitest"
import {freshGame} from "./game"
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
