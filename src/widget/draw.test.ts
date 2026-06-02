// @vitest-environment jsdom
import {beforeEach, describe, expect, test} from "vitest"
import {drawNext, startDraw} from "./draw"

describe("draw", () => {
	beforeEach(() => localStorage.clear())

	test("startDraw で remain が 75 件・history は空", () => {
		const nl = startDraw()
		expect(nl.remainList).toHaveLength(75)
		expect(nl.historyList).toHaveLength(0)
	})

	test("75回引くと全て一意（1..75）・76回目は null", () => {
		const nl = startDraw()
		const drawn: number[] = []
		for (let i = 0; i < 75; i++) {
			const n = drawNext(nl)
			if (n !== null) drawn.push(n)
		}
		expect(new Set(drawn).size).toBe(75)
		expect(Math.min(...drawn)).toBe(1)
		expect(Math.max(...drawn)).toBe(75)
		expect(nl.historyList).toHaveLength(75)
		expect(drawNext(nl)).toBeNull()
	})
})
