import {generateCard} from "../widget/card.js"
import type {GameState} from "../shared/types.js"

/** 新規ゲームの初期状態（remain=1..75, history=空, 新しい5×5カード）。 */
export function freshGame(): GameState {
	return {
		remain: Array.from({length: 75}, (_, index) => index + 1),
		history: [],
		card: generateCard(),
	}
}
