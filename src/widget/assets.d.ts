// esbuild の dataurl ローダーで mp3 を import すると data: URL 文字列になる
declare module "*.mp3" {
	const dataUrl: string
	export default dataUrl
}
