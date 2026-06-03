// @vitest-environment jsdom
import {beforeEach, describe, expect, test} from "vitest"
import {drawNext} from "./draw"
import NumberList from "@vendor/bingo/numberList"

// 新規の 75 件リスト。resetLists で remain=[1..75]/history=[] に初期化（事前状態に依らない）
const freshList = (): NumberList => {
	const numberList = new NumberList()
	numberList.resetLists()
	return numberList
}

describe("draw", () => {
	beforeEach(() => localStorage.clear())

	test("75回引くと全て一意（1..75）・76回目は null", () => {
		const numberList = freshList()
		const drawn: number[] = []
		for (let i = 0; i < 75; i++) {
			const n = drawNext(numberList)
			if (n !== null) drawn.push(n)
		}
		expect(new Set(drawn).size).toBe(75)
		expect(Math.min(...drawn)).toBe(1)
		expect(Math.max(...drawn)).toBe(75)
		expect(numberList.historyList).toHaveLength(75)
		expect(drawNext(numberList)).toBeNull()
	})

	test("1回引くと remain から消え history に入る", () => {
		const numberList = freshList()
		const n = drawNext(numberList)!
		expect(numberList.remainList).toHaveLength(74)
		expect(numberList.historyList).toEqual([n])
		expect(numberList.remainList).not.toContain(n)
	})
})
