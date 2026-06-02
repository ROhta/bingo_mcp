import type {GameState} from "../shared/types"

// NumberList が読み書きする localStorage キーと一致させる
const REMAIN_KEY = "remainNumberList"
const HISTORY_KEY = "historyNumberList"

type DrawState = Pick<GameState, "remain" | "history">

/**
 * 信頼境界の検証: 1..75 の整数配列であることを保証する。
 * サーバー由来 state や localStorage 由来の値が不正なら、黙って壊さず明確に throw する。
 *
 * 注:
 * - vendored NumberList の #isBingoNumber より厳格（Number.isInteger を追加し [1.5]/[NaN] も弾く）。
 * - 範囲のみ検証し、重複や remain∩history=∅ は見ない（単一盤面スコープでは許容。
 *   厳密整合が要るなら Task 8 で判断）。
 * - この throw の捕捉は呼び出し側（Task 8 の ontoolresult 配線）の責務。未捕捉だと render を中断する。
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

/**
 * 現在の localStorage から remain/history を読み出す（不正値・非配列は throw）= 厳格な読み取り口。
 * 注(Task 8): 実運用の resume 読み取りを本関数経由にするか、vendored NumberList の getter
 *   （非配列で黙って [] に縮退する緩い読み手）に委ねるかを明示的に決めること。現状ホットパスは後者。
 */
export function readDrawState(): DrawState {
	return {
		remain: assertBingoNumbers("remain", JSON.parse(localStorage.getItem(REMAIN_KEY) ?? "[]")),
		history: assertBingoNumbers("history", JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]")),
	}
}
