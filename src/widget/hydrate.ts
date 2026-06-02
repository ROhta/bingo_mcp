import type {GameState} from "../shared/types"

// NumberList が読み書きする localStorage キーと一致させる
const REMAIN_KEY = "remainNumberList"
const HISTORY_KEY = "historyNumberList"

type DrawState = Pick<GameState, "remain" | "history">

/**
 * 信頼境界の検証: 1..75 の整数配列であることを保証する。
 * サーバー由来 state や localStorage 由来の値が不正なら、黙って壊さず明確に throw。
 * （vendored NumberList の #isBingoNumber と同じ基準に揃える）
 */
function assertBingoNumbers(name: string, value: unknown): number[] {
	const ok = Array.isArray(value) && value.every(n => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 75)
	if (!ok) throw new Error(`hydrate: invalid ${name} — expected integer[] in [1,75], got ${JSON.stringify(value)}`)
	return value as number[]
}

/** サーバーから受け取った state で localStorage を再シードする（NumberList が resume できる状態に）。 */
export function seedLocalStorage(state: DrawState): void {
	localStorage.setItem(REMAIN_KEY, JSON.stringify(assertBingoNumbers("remain", state.remain)))
	localStorage.setItem(HISTORY_KEY, JSON.stringify(assertBingoNumbers("history", state.history)))
}

/** 現在の localStorage から remain/history を読み出す（不正値・非配列は throw）。 */
export function readDrawState(): DrawState {
	return {
		remain: assertBingoNumbers("remain", JSON.parse(localStorage.getItem(REMAIN_KEY) ?? "[]")),
		history: assertBingoNumbers("history", JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]")),
	}
}
