---
description: APM (Agent Package Manager / microsoft/apm) を介した AI エージェント指示・MCP・プラグインの運用ルール
applyTo: "{.apm/**,apm.yml,apm.lock.yaml}"
---

# APM 運用ルール

## Source of Truth

`.apm/instructions/*.instructions.md` と `apm.yml` がすべての AI エージェント向け設定の Source of Truth。ここを編集することで Claude Code / Codex CLI / GitHub Copilot のすべてに同じ指示・MCP・プラグインが届く。

## ファイルの管理方針（追跡境界）

| パス                                                                                                                            | 役割                                                     | 追跡 |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---- |
| `.apm/instructions/*.instructions.md`                                                                                           | 指示の SoT（人間が編集）                                 | ✅   |
| `apm.yml`（`dependencies.mcp` / `dependencies.apm`）                                                                            | MCP・プラグインの SoT（人間が編集）                      | ✅   |
| `apm.lock.yaml`                                                                                                                 | `apm install` 生成。整合性・再現性のため例外的に追跡     | ✅   |
| `.github/copilot-instructions.md`                                                                                               | Copilot Code Review に SoT 所在を伝えるスタブ            | ✅   |
| `CLAUDE.md` / `AGENTS.md`                                                                                                       | `apm compile` 生成                                       | ❌   |
| `.claude/rules/` / `.github/instructions/`                                                                                      | `apm install` 生成（instructions 展開先）                | ❌   |
| `.mcp.json` / `.vscode/mcp.json` / `.codex/`                                                                                    | `apm install` 生成（MCP 設定 ＋ Codex プラグイン hooks） | ❌   |
| `apm_modules/` / `.agents/skills/` / `.claude/{skills,commands,hooks,settings.json,apm-hooks.json}` / `.github/{prompts,hooks}` | プラグイン展開先                                         | ❌   |

## ローカルでの作業

`.apm/instructions/` または `apm.yml` を編集後、生成物を更新する:

```bash
pnpm apm-install   # apm install（lockfile・MCP 設定・instructions・プラグインを再デプロイ）
apm compile        # CLAUDE.md / AGENTS.md を更新
```

`apm.lock.yaml` を除く生成物は `.gitignore` 対象のためコミットに含まれない。

> apm CLI 自体は **mise 管理**（`mise.toml` の `github:microsoft/apm`、バージョン固定）。`mise install` で導入される。

## 依存パッケージ（`dependencies.apm`）

扱える形態は 2 種類:

- **プラグイン bundle**: Skills / commands / hooks 等をまとめたもの（例: `obra/superpowers`）
- **単一プリミティブ (virtual file)**: 既存リポジトリ内の特定ファイルを 1 ファイル単位で取り込む（例: `github/awesome-copilot/instructions/code-review-generic.instructions.md`）

| 依存                                                            | 種別               | 用途                                           |
| --------------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| `code-review-generic.instructions.md`（github/awesome-copilot） | 単一プリミティブ   | 汎用コードレビュー指示（ベンダー・言語非依存） |
| `superpowers`（obra/superpowers）                               | marketplace plugin | TDD・デバッグ・計画立案等の汎用スキル群        |

**vendor-neutral 方針**: 特定 AI ベンダー組織配下のリポジトリを直接指定せず、コミュニティ curated（`github/awesome-copilot`）や中立 OSS（`obra/superpowers`）を経由する。

**SHA ピン必須**: `dependencies.apm` の各エントリは `#<sha>` でピンする（ピンしないと `apm install` 毎に上流 main を引きドリフトする）。

## MCP サーバー（`dependencies.mcp`）

| 名前       | 起動コマンド                                                                    | 用途                                 | 前提   |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------ | ------ |
| `semgrep`  | `uvx semgrep-mcp`                                                               | 静的解析（SAST）                     | `uv`   |
| `context7` | `npx -y @upstash/context7-mcp`                                                  | ライブラリ公式ドキュメント最新版取得 | `node` |
| `serena`   | `uvx --from git+https://github.com/oraios/serena@<sha> serena start-mcp-server` | LSP ベースのシンボル指向コード探索   | `uv`   |

- **ピン方針**: git ソース（serena）は `@<sha>` でピン。npm/uvx の `semgrep` / `context7` は API 安定のため固定省略（解決状態は `apm.lock.yaml` に記録、将来必要なら `<pkg>@<semver>` で固定）。
- `npx` は非対話起動のため `-y` を必ず付ける。
- **APM レジストリ（`apm mcp search` / `apm mcp install <registry-name>`）は使わない**。解決不正の既知問題があるため、すべて self-defined（`-- <command> [args...]`）で登録する。

## GitHub Copilot Code Review への指示伝達

Copilot Code Review エージェントは `AGENTS.md` を読まず `.github/copilot-instructions.md` または `.github/instructions/*.instructions.md` のみを読む。本リポジトリは `.github/copilot-instructions.md` をスタブとして配置し、SoT である `.apm/instructions/workflow.instructions.md`（PR レビュー方針）を参照させる。

参考: <https://docs.github.com/copilot/how-tos/configure-custom-instructions/add-repository-instructions>
