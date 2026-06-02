import type {GameState} from "../shared/types"

// NumberList が読み書きする localStorage キーと一致させる
const REMAIN_KEY = "remainNumberList"
const HISTORY_KEY = "historyNumberList"

type DrawState = Pick<GameState, "remain" | "history">

/** サーバーから受け取った state で localStorage を再シードする（NumberList が resume できる状態に）。 */
export function seedLocalStorage(state: DrawState): void {
	localStorage.setItem(REMAIN_KEY, JSON.stringify(state.remain))
	localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history))
}

/** 現在の localStorage から remain/history を読み出す。 */
export function readDrawState(): DrawState {
	return {
		remain: JSON.parse(localStorage.getItem(REMAIN_KEY) ?? "[]"),
		history: JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"),
	}
}
