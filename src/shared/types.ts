export type CellValue = number | "FREE"

export interface Cell {
	value: CellValue
	marked: boolean
}

/** 列優先 card[column][row]。列は B,I,N,G,O。5列×5行。 */
export type Card = Cell[][]

export type LineKind = "row" | "col" | "diag"
export type RowColIndex = 0 | 1 | 2 | 3 | 4
export type DiagIndex = 0 | 1

/** row/col は index 0..4。diag は 0=左上→右下, 1=右上→左下。範囲を型で縛る。 */
export type Line =
	| {kind: "row"; index: RowColIndex}
	| {kind: "col"; index: RowColIndex}
	| {kind: "diag"; index: DiagIndex}

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

/** 列ごとの数値レンジ B/I/N/G/O（長さ5を型で固定） */
export const COLUMN_RANGES = [
	[1, 15],
	[16, 30],
	[31, 45],
	[46, 60],
	[61, 75],
] as const satisfies readonly (readonly [number, number])[]
