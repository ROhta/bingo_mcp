import js from "@eslint/js"
import tseslint from "typescript-eslint"
import prettierConfig from "eslint-config-prettier/flat"
import globals from "globals"

export default tseslint.config(
	{
		// APM 生成物（apm install 展開先）と vendored/ビルド成果物は探索対象外。
		// eslint は .gitignore を見ないため明示除外が必要（これらは .gitignore 済みだが lint されてしまう）。
		ignores: ["node_modules/**", "dist/**", "vendor/**", "apm_modules/**", ".remember/**", ".claude/**", ".agents/**", ".codex/**", ".github/**"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettierConfig,
	{
		files: ["src/widget/**/*.ts"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {...globals.browser},
		},
	},
	{
		files: ["src/server/**/*.ts", "src/shared/**/*.ts"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {...globals.node},
		},
	},
	{
		files: ["*.mjs", "*.ts", "scripts/**/*.mjs"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {...globals.node},
		},
	},
)
