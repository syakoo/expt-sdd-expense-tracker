# Technology Stack

## Architecture

TanStack Start による単一リポジトリのフルスタック構成。画面は SSR し、データの取得と変更は Server Function（`createServerFn`）を通す。永続化はローカルの SQLite ファイル。ローカル開発（`vite dev`）だけを前提とし、本番サーバーやデプロイ構成は持たない。

認証は持たない。「現在ユーザー」は Cookie で保持し、その方法は `identity` モジュールの内部に閉じている。機能側は `@/identity` の関数から現在ユーザーを受け取るだけで、Cookie を直接扱わない。

## Core Technologies

- **Language**: TypeScript 6.0（`strict: true`）
- **Framework**: TanStack Start 1.169 / TanStack Router 1.170、React 19
- **Build**: Vite 8
- **Runtime**: Node.js 24（`.node-version`。mise が読み取る）
- **Data**: SQLite（better-sqlite3）+ Drizzle ORM 0.45 / drizzle-kit 0.31
- **Styling**: Tailwind CSS 4（`@tailwindcss/vite`）

## Development Standards

### Type Safety

- `strict: true`。ID のような意味のある文字列はブランド型にする（例：`UserId`）
- Server Function の入力は `.validator(...)` で検証する。検証関数（`parseXxxInput`）は普通の関数として `validation.ts` に書き、単体テストする

### Code Quality

- ESLint（flat config）+ typescript-eslint + react-hooks + TanStack Router プラグイン
- モジュールの境界は `eslint.config.js` の `no-restricted-imports` で機械的に守る。規則の中身は `structure.md` を参照
- 整形は Prettier（+ tailwindcss プラグイン）に任せる。ESLint の整形系ルールは無効化済み
- `vite build` はサーバー専用モジュールがクライアントに混ざるとエラーにする。境界の検証としても使う

### Testing

- **Vitest**：テストは対象と同じディレクトリに `*.test.ts(x)` として置く。DB を使うテストは in-memory SQLite にマイグレーションを適用して使う（`createTestDatabase()`）。テストごとに独立した DB になる
- **Playwright**：ユーザーから見える流れ（選択・切替・画面遷移・アクセシビリティ）を E2E で確かめる。E2E 専用の DB ファイルを使い、開発用の DB は汚さない
- ロジックは `db` と `user` を引数で受け取る関数に寄せ、Server Function を通さずにテストできるようにする

## Development Environment

### Common Commands

```bash
npm run db:setup      # DB 作成 + マイグレーション適用 + シード投入（冪等）
npm run dev           # 開発サーバー（http://localhost:3000/）
npm run typecheck && npm run lint && npm run format:check
npm test              # Vitest
npm run test:e2e      # Playwright
npm run build         # ビルド（境界違反の検出を兼ねる）
npm run db:generate   # スキーマ変更からマイグレーションを生成
```

## Key Technical Decisions

- **マイグレーションはコミットする**：`drizzle-kit generate` で生成した SQL を `drizzle/` にコミットし、`db:setup` で順に適用する。履歴が残らない `drizzle-kit push` は使わない
- **未適用のマイグレーションがあれば起動時に止める**：DB が使えない状態では、原因と対処（`npm run db:setup`）を示すエラー画面を出す
- **Drizzle ORM は 0.45 系に固定**：1.0 は RC のため。メジャー更新時は app-foundation の再検証トリガーに当たる
- **TypeScript は 6.0 系**：typescript-eslint が 7 系に未対応のため
- **ルーターはプリロードとキャッシュを無効化**（`defaultPreload: false`、`defaultGcTime: 0`）：ユーザー切替の直後に、前のユーザーのデータが見えないようにするため
- **個人ごとのデータを含む応答はキャッシュさせない**（`Cache-Control: private, no-store`）

---
_依存の一覧ではなく、開発の仕方を左右する標準と判断を書く_
