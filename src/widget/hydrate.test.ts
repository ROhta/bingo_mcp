// @vitest-environment jsdom
import {beforeEach, describe, expect, test} from "vitest"
import {readDrawState, seedLocalStorage} from "./hydrate"
import NumberList from "@vendor/bingo/numberList"

describe("hydrate", () => {
	beforeEach(() => localStorage.clear())

	test("seed→read で remain/history が往復する", () => {
		seedLocalStorage({remain: [3, 7, 9], history: [1, 2]})
		expect(readDrawState()).toEqual({remain: [3, 7, 9], history: [1, 2]})
	})

	test("NumberList が読むキー名で保存される", () => {
		seedLocalStorage({remain: [5], history: []})
		expect(JSON.parse(localStorage.getItem("remainNumberList")!)).toEqual([5])
		expect(JSON.parse(localStorage.getItem("historyNumberList")!)).toEqual([])
	})

	test("空のときデフォルト({remain:[],history:[]})を返す", () => {
		localStorage.clear()
		expect(readDrawState()).toEqual({remain: [], history: []})
	})

	test("壊れたJSONは throw する", () => {
		localStorage.setItem("remainNumberList", "{bad")
		expect(() => readDrawState()).toThrow()
	})

	test("非配列(スカラ)は素通りせず throw する", () => {
		localStorage.setItem("remainNumberList", "5")
		localStorage.setItem("historyNumberList", "[]")
		expect(() => readDrawState()).toThrow(/invalid remain/)
	})

	test("範囲外の値(1..75外)は seed 時に throw する", () => {
		expect(() => seedLocalStorage({remain: [999], history: []})).toThrow(/invalid remain/)
	})

	test("seed 後に NumberList がそのまま resume できる", () => {
		seedLocalStorage({remain: [3, 7, 9], history: [1, 2]})
		const nl = new NumberList()
		expect(nl.remainList).toEqual([3, 7, 9])
		expect(nl.historyList).toEqual([1, 2])
	})
})
