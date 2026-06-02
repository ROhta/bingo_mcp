export type CellValue = number | "FREE"

export interface Cell {
	value: CellValue
	marked: boolean
}

/** 列優先 card[column][row]。列は B,I,N,G,O。5列×5行。 */
export type Card = Cell[][]

export type LineKind = "row" | "col" | "diag"

/** row/col は index 0..4。diag は 0=左上→右下, 1=右上→左下。 */
export interface Line {
	kind: LineKind
	index: number
}

export interface Judgement {
	bingoLines: Line[]
	reachLines: Line[]
}

/** サーバーが保持する権威状態（平データ）。マークは Cell.marked が保持。 */
export interface GameState {
	remain: number[]
	history: number[]
	card: Card
}

/** 列ごとの数値レンジ B/I/N/G/O */
export const COLUMN_RANGES: readonly (readonly [number, number])[] = [
	[1, 15],
	[16, 30],
	[31, 45],
	[46, 60],
	[61, 75],
]
