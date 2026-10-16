# Project Structure

## Organization Philosophy

機能ごとにまとめる（feature-first）。機能は `src/<feature>/` に置き、外へは入口ファイル（`index.ts`）で公開するものだけを見せる。内部の作りは import 境界で隠し、使う側が知る必要のあることを減らす。

依存は一方向にする：`routes` → 機能モジュール（例：`identity`）→ `db`。`db` は機能を知らず、機能どうしは公開面だけを通して使う。

## Directory Patterns

### 機能モジュール
**Location**: `src/<feature>/`
**Purpose**: ひとつの機能の型、テーブル定義、サーバー側ロジック、Server Function、公開面
**Example**: `src/identity/` は `index.ts` で `getCurrentUser` / `requireCurrentUser` / `listUsersByRole` と型を公開し、Cookie の扱いやリポジトリは内部に隠す

### テーブル定義
**Location**: `src/<feature>/schema.ts`
**Purpose**: その機能が持つテーブル。`drizzle.config.ts` のグロブが拾うので、既存ファイルを変更せずに追加できる
**Example**: ユーザーを参照する外部キー列は `text(...).references(() => users.id).$type<UserId>()`（`users` は `@/identity/schema` から import する）

### DB 基盤
**Location**: `src/db/`
**Purpose**: 接続（`getDb()`）、マイグレーション、テスト用 DB。機能のテーブル定義には依存しない

### 画面（ルート）
**Location**: `src/routes/`（ファイルベースルーティング）
**Purpose**: 機能画面は `src/routes/_app/` 配下に置く。共通レイアウトと、現在ユーザー未選択なら `/select-user` へ送るゲートが自動で適用される
**Example**: ルートが共有する部品は `src/routes/-components/` に置く（`-` 始まりはルート生成の対象外）

## Naming Conventions

- **Files**: kebab-case（`current-user-indicator.tsx`）
- **サーバー専用**：`*.server.ts`。クライアントから import するとビルドエラーになる
- **Server Function の定義**：`*.functions.ts`
- **入力検証**：`validation.ts` に `parseXxxInput`
- **テスト**：対象と同じディレクトリに `*.test.ts`（コンポーネントは `*.test.tsx`）
- **Components**: PascalCase の名前付き export

## Import Organization

```typescript
import { requireCurrentUser, type User } from '@/identity' // 機能の公開面
import { users } from '@/identity/schema'                // 外部キー参照のときだけ
import { getDb } from '@/db/client.server'                // DB 接続
import { parseReceiptInput } from './validation'          // 同じディレクトリ内は相対
```

**Path Aliases**:
- `@/`：`src/` に対応する。ディレクトリをまたぐ import は必ずこれで書く（`../` は Lint で禁止）

**境界のルール**（`eslint.config.js` が強制する。正確な定義はそちらを参照）:
- `@/identity` の内部ファイルは import しない。使ってよいのは `@/identity` と `@/identity/schema`
- `@/identity/ui` はアプリシェル（`__root.tsx`、`select-user.tsx`）専用
- `@/db` は `client.server` だけを使う
- `@/db/test-utils.server` と `@/identity/seed.server` はテストファイルからだけ使える

## Code Organization Principles

- **Server Function は薄くする**：`*.functions.ts` のハンドラが `getDb()` と `requireCurrentUser()` を呼び、`db: AppDatabase` と `user: User` を `*.server.ts` の普通の関数に渡す。問い合わせ・検証・権限の判断はその関数に置き、Vitest から in-memory DB と任意のユーザーでテストする
- **データは Server Function で守る**：データを返す・変更する Server Function は、ハンドラの先頭で `await requireCurrentUser()` を呼ぶ。`_app` のゲートは画面の保護であって、データの保護ではない
- **画面では現在ユーザーをコンテキストから取る**：`_app` 配下では `Route.useRouteContext()` やローダーの `context.user` を使い、取得し直さない
- **エラー表示は共通のものに任せる**：ローダーやコンポーネントのエラーは、ルーターの既定のエラー表示が共通レイアウトの中に出す。画面固有の表示が必要なときだけ `errorComponent` を置く。データがないときは `throw notFound()`
- **テストのデータ準備**：`createTestDatabase()` で DB を作り、`seedUsers(db)` でユーザーを入れてから `SEED_USERS` の ID を外部キーに使う

---
_ファイルツリーではなくパターンを書く。パターンに沿った新しいファイルなら、ここを更新する必要はない_
