// @vitest-environment jsdom
import {beforeEach, describe, expect, test} from "vitest"
import {seedLocalStorage} from "./hydrate"
import NumberList from "@vendor/bingo/numberList"

describe("hydrate", () => {
	beforeEach(() => localStorage.clear())

	test("NumberList が読むキー名で保存される", () => {
		seedLocalStorage({remain: [5], history: []})
		expect(JSON.parse(localStorage.getItem("remainNumberList")!)).toEqual([5])
		expect(JSON.parse(localStorage.getItem("historyNumberList")!)).toEqual([])
	})

	test("範囲外(1..75外)は throw する", () => {
		expect(() => seedLocalStorage({remain: [999], history: []})).toThrow(/invalid remain/)
	})

	test("非配列(スカラ)は素通りせず throw する", () => {
		expect(() => seedLocalStorage({remain: 5 as unknown as number[], history: []})).toThrow(/invalid remain/)
	})

	test("seed 後に NumberList がそのまま resume できる", () => {
		seedLocalStorage({remain: [3, 7, 9], history: [1, 2]})
		const numberList = new NumberList()
		expect(numberList.remainList).toEqual([3, 7, 9])
		expect(numberList.historyList).toEqual([1, 2])
	})
})
