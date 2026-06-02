// @vitest-environment jsdom
import {beforeEach, describe, expect, test} from "vitest"
import {readDrawState, seedLocalStorage} from "./hydrate"

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
})
