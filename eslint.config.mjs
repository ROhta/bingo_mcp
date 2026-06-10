import js from "@eslint/js"
import tseslint from "typescript-eslint"
import prettierConfig from "eslint-config-prettier/flat"
import globals from "globals"

export default tseslint.config(
	{
		ignores: ["node_modules/**", "dist/**", "vendor/**", "apm_modules/**", ".remember/**"],
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
