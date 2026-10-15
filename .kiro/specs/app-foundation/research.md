# Research & Design Decisions

## Summary
- **Feature**: `app-foundation`
- **Discovery Scope**: New Feature（グリーンフィールド、Full discovery）
- **Key Findings**:
  - Next.js 16 では `cookies()` が完全に非同期化され（同期アクセスは削除）、Cookie の書き込みは Server Function / Route Handler に限られる。現在ユーザーの保持は「読み取り＝Server Component から、書き込み＝Server Action から」という非対称な形になる
  - Drizzle ORM の安定版（`latest`）は 0.45 系で、1.0 は RC 段階。better-sqlite3 13 系は Node.js 22 以上を要求し、ローカル環境の Node.js 20.19 では動かない
  - 「単一の取得口」は Next.js の機能ではなく、モジュールの公開面（`src/identity/index.ts`）と ESLint の import 制限で担保する必要がある

## Research Log

### 既存コードベース
- **Context**: 既存パターンの確認
- **Sources Consulted**: リポジトリ全体（`.kiro/`、`README.md`、`CLAUDE.md`）
- **Findings**: アプリケーションコードは存在しない。`.kiro/steering/` には `roadmap.md` のみがあり、`product.md` / `tech.md` / `structure.md` は未作成
- **Implications**: 技術スタックとディレクトリ構成はこの spec の design で決める。決定後に `/kiro-steering` で `tech.md` / `structure.md` へ反映することを推奨する

### Next.js 16（App Router）の Cookie と描画モデル
- **Context**: 現在ユーザーの保持方法（3.7, 3.8）と、全画面でのゲート（3.1）
- **Sources Consulted**:
  - [Next.js `cookies` API reference](https://nextjs.org/docs/app/api-reference/functions/cookies)
  - [Next.js 16 migration: async request APIs](https://ecorpit.com/nextjs-16-migration-async-request-apis-cache-components-2026/)
  - `npm view next dist-tags`（latest = 16.4.0、engines: node >= 20.9.0）
- **Findings**:
  - `cookies()` は `await` 必須。Next.js 16 で同期アクセスは削除された
  - Cookie の `set` / `delete` は Server Function（Server Action）と Route Handler でのみ可能。Server Component の描画中には書き込めない
  - レイアウトはクライアント遷移時に再描画されない場合があるため、レイアウトだけをゲートにすると「ページ側で未選択を受け取る」可能性が残る
- **Implications**:
  - Cookie の読み書きは `identity` モジュール内の 1 ファイルに閉じ込める
  - 未選択のゲートは `(app)` ルートグループのレイアウトで行い、加えて取得口側に「未選択ならユーザー選択画面へ送る」関数を用意して、ページや Server Action がゲートを再実装しなくて済むようにする
  - 3.9（保持されたユーザーが DB に存在しない）は描画中に Cookie を消せないため、「未選択として扱う」だけにし、次の選択で上書きする

### ORM とマイグレーション
- **Context**: データ構造の変更履歴管理（1.3）、データ初期化（1.4, 1.5）
- **Sources Consulted**:
  - [Drizzle: Get started with SQLite](https://orm.drizzle.team/docs/get-started-sqlite)
  - [Drizzle latest releases](https://orm.drizzle.team/docs/latest-releases)、[drizzle-orm 1.0.0-rc.3 (newreleases.io)](https://newreleases.io/project/npm/drizzle-orm/release/1.0.0-rc.3)
  - [Prisma ORM 7.3.0 release](https://www.prisma.io/blog/prisma-orm-7-3-0)、[Prisma SQLite docs](https://www.prisma.io/docs/orm/core-concepts/supported-databases/sqlite)
  - `npm view`：drizzle-orm latest 0.45.4 / rc 1.0.0-rc.4、drizzle-kit latest 0.31.11、@prisma/client latest 7.10.0
- **Findings**:
  - Drizzle は TypeScript でスキーマを定義し、`drizzle-kit generate` が順序付きの SQL マイグレーションファイルを出力する。`drizzle-orm/better-sqlite3/migrator` の `migrate()` でプログラムから適用できる
  - Drizzle 1.0 は RC で、Relational Queries v1 の削除などの破壊的変更を含む
  - Prisma 7 は SQLite でもドライバアダプタ（`@prisma/adapter-better-sqlite3`）が必須。スキーマは独自 DSL で、クライアント生成ステップが必要
- **Implications**: 安定版の Drizzle 0.45 系を採用する（詳細は Design Decisions）。1.0 への移行は後続 spec の再検証トリガーとして記録する

### SQLite ドライバとランタイム
- **Context**: ローカル SQLite への接続（1.2, 1.6）
- **Sources Consulted**: `npm view better-sqlite3@13 engines`（node >= 22）、`node -v`（ローカル: v20.19.4）、Drizzle の node:sqlite ドキュメント
- **Findings**:
  - better-sqlite3 13 系は Node.js 22 以上が必要。Node.js 20 は 2026 年 4 月に EOL 済み
  - `node:sqlite` は Node.js 22.5 以降で利用できるが、Drizzle の対応は 1.0 系（RC）側が中心
  - better-sqlite3 は Next.js の既定の `serverExternalPackages` に含まれており、追加設定なしでサーバー側から利用できる
- **Implications**: 実行環境を Node.js 24 LTS に定め（`engines: >=22`）、ドライバは better-sqlite3 を使う。開発者のローカル Node.js の更新がセットアップの前提条件になる

### テストツール
- **Context**: 受け入れ基準の検証（特に 3.7, 3.8, 5.4 はブラウザでしか確認できない）
- **Sources Consulted**: `npm view`：vitest latest 5.0.4、@playwright/test latest 1.64.0（next の peerDependency は ^1.51.1）
- **Findings**: Vitest でリポジトリとシードを in-memory SQLite に対して検証できる。Playwright のブラウザコンテキストは Cookie を共有しないため、3.8（ブラウザごとの独立）を直接検証できる
- **Implications**: 単体・統合テストは Vitest、E2E は Playwright を使う

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 機能モジュール（深いモジュール）＋ App Router | `src/identity/` に現在ユーザーとユーザー/ロールの知識を閉じ込め、`index.ts` だけを公開する | 公開面が小さく、保持方法の差し替えが内部で完結する。APoSD の「深いモジュール」に合う | 公開面の外を import されると隠蔽が崩れる → ESLint で禁止する | 採用 |
| レイヤード（repositories/ services/ を横断配置） | 全機能で共通の層ディレクトリを持つ | 慣れた構成 | 1 つの関心（現在ユーザー）が複数ディレクトリに散り、変更理由が分散する | 不採用 |
| Hexagonal（ポート＋アダプタ） | 現在ユーザー保持をポート化し、Cookie 実装をアダプタにする | 差し替えが明示的 | 実装が 1 つしかない段階では間接層が過剰 | 不採用（公開関数のシグネチャがそのまま差し替え点になる） |
| proxy.ts（旧 middleware）でゲート | リクエスト単位で Cookie を見てリダイレクト | 全ルートに一律に効く | DB 上の存在確認（3.9）を proxy で行うと DB アクセスが二重になる。Cookie の知識が identity の外に漏れる | 不採用 |

## Design Decisions

### Decision: ORM は Drizzle ORM 0.45 系（安定版）＋ drizzle-kit
- **Context**: 1.3 のマイグレーション履歴と、後続 spec が各自のテーブルを追加できる構成が必要
- **Alternatives Considered**:
  1. Prisma 7 — 成熟した migrate。ただし独自 DSL、クライアント生成、SQLite でもドライバアダプタが必須
  2. Drizzle 1.0 RC — 最新 API だが破壊的変更が続いている
  3. ORM なし（生 SQL＋自前マイグレーション） — 依存は最小だが型安全とマイグレーション生成を自作することになる
- **Selected Approach**: `drizzle-orm@0.45` / `drizzle-kit@0.31`。スキーマは TypeScript、マイグレーションは `drizzle-kit generate` で SQL ファイルを生成してコミットし、`migrate()` で適用する
- **Rationale**: 生成される SQL がそのまま読めて見通しがよい。生成ステップがなく、スキーマが TS の型として直接使える。安定版を選んで土台を揺らさない
- **Trade-offs**: 1.0 への移行が将来必要になる
- **Follow-up**: 1.0 安定版が出たら移行を別タスクとして検討し、後続 spec へ周知する

### Decision: 現在ユーザーは httpOnly Cookie にユーザー ID のみを保持
- **Context**: 3.7（再読み込み後も維持）、3.8（ブラウザごとに独立）、4.6（保持方法を隠す）
- **Alternatives Considered**:
  1. Cookie にユーザー ID — サーバー側で毎リクエスト DB と照合
  2. Cookie に表示名・ロールも含める — DB 照合を省けるが、データが古くなり 3.9 を満たせない
  3. サーバー側セッションテーブル — 本格認証に近いがスコープ外
- **Selected Approach**: 1。Cookie 名 `current_user_id`、`httpOnly`、`sameSite: 'lax'`、`path: '/'`、`maxAge` 30 日、本番のみ `secure`
- **Rationale**: 真実の情報源を DB に一本化でき、3.9 が自然に満たされる
- **Trade-offs**: 毎リクエスト 1 クエリ。React `cache()` でリクエスト内の重複を除く
- **Follow-up**: 本格認証へ差し替えるときは `current-user-store.ts` と `actions.ts` だけを置き換える

### Decision: 取得口は `getCurrentUser` / `requireCurrentUser` / `listUsersByRole` の 3 関数
- **Context**: 4.1〜4.7。後続 spec は「未選択なら選択画面へ」を毎回書くことになる
- **Alternatives Considered**:
  1. `getCurrentUser` のみ公開 — 後続 spec がリダイレクト先（`/select-user`）を知る必要があり、ルーティングの知識が漏れる
  2. `getCurrentUser` ＋ `requireCurrentUser` — 後者は前者の上に作るだけの薄いラッパー
- **Selected Approach**: 2。両者は同じ内部の解決処理を通る。`getCurrentUser` は未選択を判別共用体で明示的に返し（4.2）、`requireCurrentUser` は未選択ならユーザー選択画面へリダイレクトする
- **Rationale**: 未選択時の扱いという複雑さを identity 側に引き下げる（pull complexity downwards）
- **Trade-offs**: 公開関数が 1 つ増える
- **Follow-up**: なし

### Decision: ユーザー ID はシードで固定する文字列
- **Context**: 1.5（初期化を繰り返しても同一ユーザーとして識別）
- **Alternatives Considered**: 自動採番整数 ／ UUID ／ 固定の文字列 ID
- **Selected Approach**: `user-sato` のような固定の文字列 ID を主キーにし、シードは主キーで upsert する
- **Rationale**: 再シードしても Cookie や後続 spec の外部キーが同じユーザーを指し続ける
- **Trade-offs**: ユーザー作成 UI ができたら ID 採番方式を再検討する（現時点ではスコープ外）

### Decision: スタイリングは Tailwind CSS v4
- **Context**: 共通レイアウトと後続 spec のフォーム画面
- **Alternatives Considered**: CSS Modules（追加依存なし） ／ Tailwind CSS v4（create-next-app の既定）
- **Selected Approach**: Tailwind CSS v4
- **Rationale**: 後続 spec でも同じ書き方で画面を足せ、スタイルの判断を毎回しなくて済む
- **Trade-offs**: 依存が 1 つ増える

## Synthesis Outcomes
- **Generalization**: 「ユーザー選択画面の一覧（3.2）」と「ロール別一覧（4.3）」は同じ問い合わせの特殊化。内部では `findUsers(filter?: { role?: Role })` 1 本にし、公開面ではロール別一覧のみを出す。選択画面は identity 内部から全件一覧を使う
- **Build vs. Adopt**:
  - 採用：Drizzle（スキーマ・マイグレーション）、Next.js の `cookies()` / Server Actions（保持と切替）、React `cache()`（リクエスト内の重複除去）、Playwright のブラウザコンテキスト（3.8 の検証）
  - 自作：Cookie の読み書きと DB 照合の組み合わせ。認証ライブラリ（Auth.js 等）はパスワードなし・ユーザー選択という要件に対して過剰で、スコープ外の本格認証を持ち込むため不採用
- **Simplification**:
  - 「現在ユーザー保持」のインターフェース（ポート）は作らない。実装が 1 つしかないため、公開関数の境界がそのまま差し替え点になる
  - ロールは別テーブルのマスタにせず、`user_roles.role` 列の CHECK 制約で 2 値に固定する（2.2）
  - Cookie の値の検証に zod 等は使わない（文字列 ID を DB で照合するだけで十分）
  - グローバルナビゲーションは作らない（要件にない。後続 spec が必要に応じて追加）

## Consulted Skills
- `kiro-spec-design` の rules（design-principles / discovery-full / synthesis / review-gate）を適用
- UI 系スキル（artifact-design 等）は成果物が Web アプリ本体ではないため対象外。アクセシビリティは 5.4 に基づき、ネイティブ要素（`<a>`、`<button>`、`<form>`）を使う方針として設計に反映

## Risks & Mitigations
- ローカル Node.js が 20 系のままだと better-sqlite3 のインストールに失敗する — `.nvmrc` と `engines` で明示し、README のセットアップ手順の先頭に書く
- `src/identity/` の内部ファイルを後続 spec が直接 import して隠蔽が崩れる — ESLint の `no-restricted-imports` で `@/identity/*`（`@/identity/schema` を除く）を禁止する
- レイアウトのゲートがクライアント遷移で再評価されない — ページと Server Action は `requireCurrentUser()` を使う規約にする。切替時は `revalidatePath('/', 'layout')` で再描画させる
- Drizzle 1.0 への移行で API が変わる — 0.45 系に固定し、移行は再検証トリガーとして扱う
- 開発サーバーの HMR で SQLite 接続が増える — 接続を `globalThis` にキャッシュするシングルトンにする

## References
- [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies) — 非同期 API、書き込み可能なコンテキスト
- [Next.js 16 migration guide (ecorpit)](https://ecorpit.com/nextjs-16-migration-async-request-apis-cache-components-2026/) — 同期アクセスの削除、proxy.ts への改名
- [Drizzle: Get started with SQLite](https://orm.drizzle.team/docs/get-started-sqlite) — better-sqlite3 / node:sqlite の接続方法
- [Drizzle latest releases](https://orm.drizzle.team/docs/latest-releases) — 1.0 RC の状況
- [Prisma ORM 7.3.0](https://www.prisma.io/blog/prisma-orm-7-3-0) — SQLite のドライバアダプタ必須化
- [Prisma SQLite docs](https://www.prisma.io/docs/orm/core-concepts/supported-databases/sqlite) — 比較対象
