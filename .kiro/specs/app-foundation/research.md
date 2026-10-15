# Research & Design Decisions

## Summary
- **Feature**: `app-foundation`
- **Discovery Scope**: New Feature（グリーンフィールド、Full discovery）
- **Key Findings**:
  - フレームワークを Next.js から TanStack Start（`@tanstack/react-start` 1.169、Vite 8）に変更した。Next.js の Server Action に当たるのは `createServerFn` で作る Server Function で、Cookie の読み書き（`getCookie` / `setCookie`）、`redirect()` の送出、`FormData` の受け取りが可能。要件 3・4 の実現に必要な機能はすべてそろっている
  - Next.js との最大の違いは、ルートの `beforeLoad` / `loader` が「同形（isomorphic）」であること。初回はサーバーで、以降のクライアント遷移ではブラウザで動く。そのため現在ユーザーの取得口は「サーバーで直接呼んでも、クライアントから RPC として呼んでも同じ関数」になる Server Function で提供する
  - Drizzle ORM の安定版（`latest`）は 0.45 系で、1.0 は RC 段階。better-sqlite3 13 系と TanStack Start はどちらも Node.js 22 以上を要求し、ローカル環境の Node.js 20.19 では動かない

## Research Log

### 既存コードベース
- **Context**: 既存パターンの確認
- **Sources Consulted**: リポジトリ全体（`.kiro/`、`README.md`、`CLAUDE.md`）
- **Findings**: アプリケーションコードは存在しない。`.kiro/steering/` には `roadmap.md` のみがあり、`product.md` / `tech.md` / `structure.md` は未作成
- **Implications**: 技術スタックとディレクトリ構成はこの spec の design で決める。決定後に `/kiro-steering` で `tech.md` / `structure.md` へ反映することを推奨する

### フレームワークの変更（Next.js → TanStack Start）
- **Context**: 当初は `brief.md` / `roadmap.md` の前提どおり Next.js（App Router）で設計した。設計レビューで、開発者の希望により TanStack Start に変更することになった。要件（受け入れ基準）はフレームワークに依存しないため、変更の影響は design 以降に閉じる
- **Sources Consulted**:
  - `npm view`：`@tanstack/react-start` latest 1.169.1（engines: node >= 22.12.0、peer: vite >= 8、react >= 18）、`@tanstack/react-router` 1.170.44、vite 8.3.4
  - [TanStack Start: Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
  - [TanStack Start: Authentication](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)
  - パッケージの型定義（`@tanstack/start-client-core` 1.170.37 `createServerFn.d.ts`、`@tanstack/start-server-core` 1.169.42 `internal-request-response.d.ts`）
- **Findings**:
  - Server Function は `createServerFn({ method: 'GET' | 'POST' }).validator(fn).handler(fn)` で定義する（型定義上のメソッド名は `validator`）。呼び出しは `fn({ data })`。サーバー上（他の Server Function の中、SSR 中の `beforeLoad` / `loader`）では直接実行され、クライアント上ではビルド時に RPC スタブへ置き換わる
  - `POST` の Server Function は `FormData` を入力に取れる（`ValidateValidatorInput` が `FormData` を特別扱い）。関数には `url` プロパティがあり、`<form action={fn.url} method="post">` による JavaScript なしの送信も可能とされるが、その場合のリダイレクト挙動は公式ドキュメントで確認できなかった
  - ハンドラ内で `throw redirect({ to })`（`@tanstack/react-router`）を投げると、呼び出し元のルーターが遷移する。`notFound()` も同様
  - Cookie は `@tanstack/react-start/server` の `getCookie(name)` / `setCookie(name, value, options)` / `deleteCookie(name, options)` で扱う。リクエストのコンテキスト内（Server Function のハンドラ、サーバールート、SSR 中の処理）なら読み書きどちらも可能で、Next.js のような「描画中は書けない」制約はない
  - 公式の認証ガイドは、ルートルートの `beforeLoad` で現在ユーザーを取得してルーターコンテキストに入れ、保護したいルートをパスなしレイアウト（`_authed.tsx`）の `beforeLoad` でリダイレクトする構成を示している。ログイン状態が変わったら `router.invalidate()` で `beforeLoad` とローダーを再実行させる
  - 同ガイドは「`beforeLoad` のゲートは表示のためのもので、データの保護ではない。データを返す・変更する Server Function は自分で認可すること」と明記している
  - ユーザーごとに内容が変わるルートには `headers: () => ({ 'Cache-Control': 'private, no-store' })` を付ける
  - Server Function には同一オリジンを検査する CSRF ミドルウェア（`createCsrfMiddleware`）が既定で適用される。`src/start.ts` を自分で定義した場合は手動で追加が必要
  - React の `cache()` によるリクエスト内の重複除去に当たる仕組みはない。代わりにルーターコンテキストで 1 回の取得結果を子ルートへ渡す
- **Implications**:
  - 現在ユーザーの取得口（4.1）は Server Function として公開する。ルートの `beforeLoad`、コンポーネント、後続 spec の Server Function のどこから呼んでも同じ関数で済み、取得口が 1 つにまとまる
  - ゲート（3.1）はパスなしレイアウト `_app` の `beforeLoad` に置く。`beforeLoad` はクライアント遷移のたびに再実行されるため、Next.js のレイアウトのような「遷移時に再評価されない」問題はない
  - ユーザー選択（3.3, 3.5）は `POST` の Server Function で Cookie を書き、クライアント側で `router.invalidate()` してからトップへ遷移する

### インポート保護（サーバー専用コードの隔離）
- **Context**: DB 接続や Cookie の読み書きがクライアントバンドルに混入しないこと（4.6 の隠蔽を物理的にも担保する）
- **Sources Consulted**: [TanStack Start: Import Protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection)
- **Findings**:
  - クライアント環境では `**/*.server.*` に一致するファイルと `@tanstack/react-start/server` の import が既定で拒否される。ファイル先頭の `import '@tanstack/react-start/server-only'` でも同じ扱いにできる
  - 違反時の既定は dev が警告＋モック、build がエラー。型のみの import は対象外
  - `*.functions.ts`（`createServerFn` の定義）はクライアントから import してよい。ハンドラの中身はビルド時に RPC スタブへ置き換わる
- **Implications**: Next.js 用に予定していた `server-only` パッケージは使わず、サーバー専用ファイルを `*.server.ts` と命名する。`npm run build` が境界違反を検出する

### ビルドと実行
- **Context**: 1.1（手順どおりに起動できる）と E2E の実行方式
- **Sources Consulted**: [TanStack Start: Hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)、[Build from scratch](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch)、`npm view nitro dist-tags`（latest = 3.0.260903-beta）
- **Findings**:
  - 開発は `vite dev`、ビルドは `vite build`。Node.js で本番サーバーを動かす公式手順は Nitro（`nitro/vite` プラグイン）を使うが、Nitro 3 は `latest` タグもベータ版である
  - Vite 8 は `resolve.tsconfigPaths: true` で `tsconfig.json` の `paths` を解決できる（`vite-tsconfig-paths` は不要）
  - `src/router.tsx` の `getRouter()` と `src/routes/__root.tsx` が必須。`src/routeTree.gen.ts` は dev / build 時に生成される
- **Implications**: 本番デプロイは Non-Goal のため Nitro は導入しない。アプリの起動手順と E2E は `vite dev` を使い、`vite build` はインポート保護の検証のために実行する

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
- **Sources Consulted**: `npm view better-sqlite3@13 engines`（node >= 22）、`node -v`（ローカル: v20.19.4）、`mise` のグローバル設定（`node = "20"`、`idiomatic_version_file_enable_tools = ["node"]`）、Drizzle の node:sqlite ドキュメント
- **Findings**:
  - better-sqlite3 13 系は Node.js 22 以上、TanStack Start は 22.12 以上が必要。Node.js 20 は 2026 年 4 月に EOL 済み
  - `node:sqlite` は Node.js 22.5 以降で利用できるが、Drizzle の対応は 1.0 系（RC）側が中心
  - Vite の SSR は `node_modules` の依存を既定で外部化するため、ネイティブモジュールの better-sqlite3 はバンドルされずにそのまま読み込まれる
  - 開発者は mise を使っており、`.node-version` を Node.js のバージョン指定として読む設定になっている
- **Implications**: 実行環境を Node.js 24 LTS に定め（`.node-version` に `24`、`engines: >=22.12`）、ドライバは better-sqlite3 を使う。開発者のローカル Node.js の更新は mise がリポジトリに入った時点で自動で行われる

### ツールチェーン（型・Lint・フォーマット）
- **Context**: Next.js 用の `eslint-config-next` が使えなくなるため、Lint 構成を組み直す。あわせてフォーマッタを導入する（設計レビューで合意）
- **Sources Consulted**: `npm view`：typescript latest 7.0.2 / 6.0.3、typescript-eslint 8.71.2（peer: typescript >= 4.8.4 < 6.1.0、eslint ^8.57 || ^9 || ^10）、eslint 10.12.0、eslint-plugin-react-hooks 7.1.1、@tanstack/eslint-plugin-router 1.162.0、prettier 3.9.10、eslint-config-prettier 10.1.8、prettier-plugin-tailwindcss 0.8.1、@tailwindcss/vite 4.3.3
- **Findings**:
  - TypeScript の最新は 7.0（ネイティブ実装）だが、typescript-eslint は 6.0 系までしか対応していない
  - TanStack Router 向けの ESLint プラグインがあり、`createFileRoute` のオプション順序（型推論のため）などを検査する
  - Tailwind CSS 4 は Vite プラグイン（`@tailwindcss/vite`）で導入でき、PostCSS 設定は不要
- **Implications**: TypeScript は 6.0 系に固定する。ESLint 10（flat config）＋ typescript-eslint ＋ react-hooks ＋ TanStack Router プラグイン、フォーマットは Prettier（ESLint とは `eslint-config-prettier` で衝突を避ける）

### テストツール
- **Context**: 受け入れ基準の検証（特に 3.7, 3.8, 5.4 はブラウザでしか確認できない）
- **Sources Consulted**: `npm view`：vitest latest 5.0.4、@playwright/test latest 1.64.0
- **Findings**:
  - Vitest でリポジトリとシードを in-memory SQLite に対して検証できる。Playwright のブラウザコンテキストは Cookie を共有しないため、3.8（ブラウザごとの独立）を直接検証できる
  - Server Function のラッパー（`createServerFn`）はビルドプラグインによる変換とリクエストコンテキストを前提にするため、Vitest 単体では呼びにくい
- **Implications**: 判断のロジック（現在ユーザーの解決、選択時の検証）は Server Function から切り離した純粋な関数に置いて Vitest で検証し、Server Function・Cookie・ルーティングのつながりは Playwright で検証する

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 機能モジュール（深いモジュール）＋ ファイルベースルーティング | `src/identity/` に現在ユーザーとユーザー/ロールの知識を閉じ込め、`index.ts` だけを公開する。画面は `src/routes/` | 公開面が小さく、保持方法の差し替えが内部で完結する。APoSD の「深いモジュール」に合う | 公開面の外を import されると隠蔽が崩れる → ESLint で禁止する | 採用 |
| レイヤード（repositories/ services/ を横断配置） | 全機能で共通の層ディレクトリを持つ | 慣れた構成 | 1 つの関心（現在ユーザー）が複数ディレクトリに散り、変更理由が分散する | 不採用 |
| Hexagonal（ポート＋アダプタ） | 現在ユーザー保持をポート化し、Cookie 実装をアダプタにする | 差し替えが明示的 | 実装が 1 つしかない段階では間接層が過剰 | 不採用（公開関数のシグネチャがそのまま差し替え点になる） |
| リクエストミドルウェアでゲート | `createMiddleware` の request middleware で Cookie を見てリダイレクト | 全リクエストに一律に効く | Server Function の RPC やアセットにも掛かる。ゲート対象のルートの判定をミドルウェアが持つことになり、ルート定義と二重管理になる | 不採用（`_app` の `beforeLoad` で足りる） |

## Design Decisions

### Decision: フレームワークは TanStack Start（React）
- **Context**: `roadmap.md` は Next.js（App Router）を前提にしていたが、開発者が TanStack Start を試したいと希望した。要件はフレームワークに依存しないため、同等の設計が実現できるかを調査した
- **Alternatives Considered**:
  1. Next.js 16（App Router） — Server Components と Server Actions。当初案
  2. TanStack Start 1.x（Vite 8） — 型安全なファイルベースルーティング、Server Functions、同形のローダー
- **Selected Approach**: 2。`@tanstack/react-start` 1.169 系
- **Rationale**: 要件 3（選択・切替・維持・ゲート）と要件 4（単一の取得口）に必要な Cookie の読み書き、サーバー側のリダイレクト、ルート単位のゲートがすべて公式 API で実現できる。ゲートが遷移のたびに再評価される点は Next.js のレイアウトより扱いやすい
- **Trade-offs**: React Server Components を使わないため、画面のデータはローダーと Server Function 経由で取得する。本番の Node.js 実行は Nitro（ベータ）に依存するため今回は対象外とした。Next.js より情報が少ない
- **Follow-up**: `roadmap.md` と `brief.md` の技術前提を更新する。後続 spec の設計は本 design の規約（`src/routes/_app/` 配下に画面を置く、Server Function で認可する）に従う

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
  1. Cookie にユーザー ID — サーバー側で毎回 DB と照合
  2. Cookie に表示名・ロールも含める — DB 照合を省けるが、データが古くなり 3.9 を満たせない
  3. 暗号化セッション（iron-session 等） — 改ざん防止になるが、ローカル用で認証を持たない本 spec には過剰。秘密鍵の管理も増える
- **Selected Approach**: 1。Cookie 名 `current_user_id`、`httpOnly`、`sameSite: 'lax'`、`path: '/'`、`maxAge` 30 日、本番のみ `secure`
- **Rationale**: 真実の情報源を DB に一本化でき、3.9 が自然に満たされる
- **Trade-offs**: 現在ユーザーの取得ごとに 1 クエリ。画面表示ではルートルートの `beforeLoad` で 1 回だけ取得し、ルーターコンテキストで子ルートへ渡す
- **Follow-up**: 本格認証へ差し替えるときは `current-user-store.server.ts` と `select-user.functions.ts` だけを置き換える

### Decision: 取得口は Server Function の `getCurrentUser` / `requireCurrentUser` / `listUsersByRole`
- **Context**: 4.1〜4.7。TanStack Start ではローダーがサーバーとブラウザの両方で動くため、「サーバー専用の関数」だけを公開すると後続 spec がローダーから呼べない
- **Alternatives Considered**:
  1. サーバー専用の関数（`*.server.ts`）と、それを包む Server Function を両方公開 — 呼び出し場所で使い分けが必要になり、取得口が 2 つに見える
  2. Server Function だけを公開 — サーバー上では直接実行、ブラウザ上では RPC になり、どこからでも同じ関数を呼べる
  3. `getCurrentUser` のみ公開 — 後続 spec がリダイレクト先（`/select-user`）を知る必要があり、ルーティングの知識が漏れる
- **Selected Approach**: 2 に `requireCurrentUser` を加えた 3 関数。`getCurrentUser` は未選択を判別共用体で明示的に返し（4.2）、`requireCurrentUser` は未選択なら `redirect({ to: '/select-user' })` を投げる
- **Rationale**: 呼び出し場所を問わず 1 つの関数で済み、4.1 の「単一の取得口」がそのまま型と import に現れる。未選択時の扱いという複雑さを identity 側に引き下げる（pull complexity downwards）
- **Trade-offs**: ブラウザから呼ぶと HTTP 往復が 1 回増える。画面表示ではルーターコンテキストを使うため、往復はゲートの 1 回だけ
- **Follow-up**: 戻り値の `UserId`（ブランド型）が Server Function のシリアライズ可能性の型検査を通ることを最初の実装タスクで確認する（型定義上は `string` に代入できるため通る見込み）

### Decision: ユーザー選択はクライアントから Server Function を呼び、成功後に `router.invalidate()`
- **Context**: 3.3（選んだらトップへ）、3.5（切替後は新しいユーザーの視点）
- **Alternatives Considered**:
  1. `<form action={selectUser.url} method="post">` で JavaScript なしでも動かす — リダイレクト時の挙動が公式に文書化されていない
  2. ハンドラで `throw redirect({ to: '/' })` — 遷移はするが、キャッシュ済みのローダーデータ（前のユーザーの視点）が残る可能性がある
  3. ハンドラは結果を返し、クライアントが `router.invalidate()` → `router.navigate({ to: '/' })` を行う
- **Selected Approach**: 3
- **Rationale**: 公式の認証ガイドと同じ手順で、すべてのルートの `beforeLoad` とローダーを新しいユーザーで再実行させられる。未知のユーザー ID のときに画面へメッセージを出す余地も残る
- **Trade-offs**: ユーザー選択は JavaScript（ハイドレーション）が前提になる。ハイドレーション前はボタンを無効にして、押しても何も起きない状態を避ける

### Decision: ユーザー ID はシードで固定する文字列
- **Context**: 1.5（初期化を繰り返しても同一ユーザーとして識別）
- **Alternatives Considered**: 自動採番整数 ／ UUID ／ 固定の文字列 ID
- **Selected Approach**: `user-01` のような固定の文字列 ID を主キーにし、シードは主キーで upsert する
- **Rationale**: 再シードしても Cookie や後続 spec の外部キーが同じユーザーを指し続ける
- **Trade-offs**: ユーザー作成 UI ができたら ID 採番方式を再検討する（現時点ではスコープ外）

### Decision: スタイリングは Tailwind CSS v4
- **Context**: 共通レイアウトと後続 spec のフォーム画面
- **Alternatives Considered**: CSS Modules（追加依存なし） ／ Tailwind CSS v4（TanStack Start のテンプレートでも採用）
- **Selected Approach**: Tailwind CSS v4（`@tailwindcss/vite`）
- **Rationale**: 後続 spec でも同じ書き方で画面を足せ、スタイルの判断を毎回しなくて済む
- **Trade-offs**: 依存が 1 つ増える

### Decision: フォーマッタは Prettier
- **Context**: 設計レビューで導入に合意
- **Alternatives Considered**: Prettier ／ Biome（Lint とフォーマットを 1 つに統合できるが、TanStack Router の ESLint プラグインや react-hooks ルールが使えない）
- **Selected Approach**: Prettier 3 ＋ `prettier-plugin-tailwindcss`。ESLint とは `eslint-config-prettier` で衝突するルールを無効にする
- **Rationale**: Lint は ESLint のエコシステム（TanStack Router、react-hooks）を使い、整形は Prettier に任せて責務を分ける
- **Trade-offs**: ツールが 2 つになる

## Synthesis Outcomes
- **Generalization**: 「ユーザー選択画面の一覧（3.2）」と「ロール別一覧（4.3）」は同じ問い合わせの特殊化。内部では `findUsers(filter?: { role?: Role })` 1 本にし、公開面ではロール別一覧のみを出す。選択画面はアプリシェル向けの入口から全件一覧を使う
- **Build vs. Adopt**:
  - 採用：Drizzle（スキーマ・マイグレーション）、TanStack Start の Server Functions / `getCookie` / `setCookie`（保持と切替）、ルーターコンテキスト（1 回の取得結果を子ルートへ渡す）、インポート保護（サーバー専用コードの隔離）、Playwright のブラウザコンテキスト（3.8 の検証）
  - 自作：Cookie の読み書きと DB 照合の組み合わせ。認証ライブラリ（Better Auth、iron-session 等）はパスワードなし・ユーザー選択という要件に対して過剰で、スコープ外の本格認証を持ち込むため不採用
- **Simplification**:
  - 「現在ユーザー保持」のインターフェース（ポート）は作らない。実装が 1 つしかないため、公開関数の境界がそのまま差し替え点になる
  - ロールは別テーブルのマスタにせず、`user_roles.role` 列の CHECK 制約で 2 値に固定する（2.2）
  - Server Function の入力検証に zod 等は使わない（文字列 ID とロール名を手書きの検証関数で確かめれば十分）
  - グローバルナビゲーションは作らない（要件にない。後続 spec が必要に応じて追加）
  - 本番サーバー（Nitro）は導入しない（本番デプロイは Non-Goal）

## Consulted Skills
- `kiro-spec-design` の rules（design-principles / discovery-full / synthesis / review-gate）を適用
- UI 系スキル（artifact-design 等）は成果物が Web アプリ本体ではないため対象外。アクセシビリティは 5.4 に基づき、ネイティブ要素（`<a>`、`<button>`）を使う方針として設計に反映

## Risks & Mitigations
- ローカル Node.js が 20 系のままだと better-sqlite3 と TanStack Start のインストールに失敗する — `.node-version`（mise が読み取る）と `engines` で明示し、README のセットアップ手順の先頭に書く
- `src/identity/` の内部ファイルを後続 spec が直接 import して隠蔽が崩れる — ESLint の `no-restricted-imports` で禁止し、サーバー専用ファイルは `*.server.ts` にしてインポート保護でクライアントへの混入をビルドエラーにする
- `beforeLoad` のゲートはデータの保護にならない — 後続 spec の Server Function は自分で `requireCurrentUser()` を呼ぶ規約にする（公式ガイドの推奨どおり）
- ユーザー切替後に前のユーザーのローダーデータが残る — 選択成功後に `router.invalidate()` で全ルートを再実行させる
- TanStack Start は更新頻度が高い（パッチが週単位で出る） — マイナーバージョンまで固定し、更新は意図して行う
- TypeScript 7 へ上げると typescript-eslint が動かない — TypeScript は 6.0 系に固定する
- Drizzle 1.0 への移行で API が変わる — 0.45 系に固定し、移行は再検証トリガーとして扱う
- 開発サーバーの HMR で SQLite 接続が増える — 接続を `globalThis` にキャッシュするシングルトンにする

## References
- [TanStack Start: Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) — `createServerFn`、FormData、redirect、ファイル命名規約
- [TanStack Start: Authentication](https://tanstack.com/start/latest/docs/framework/react/guide/authentication) — `getCookie` / `setCookie`、`beforeLoad` によるゲート、`router.invalidate()`
- [TanStack Start: Import Protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection) — `*.server.*` の隔離、dev / build の挙動
- [TanStack Start: Hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting) — Node.js での本番実行は Nitro 経由
- [TanStack Start: Build from scratch](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch) — 必須ファイル、Vite 設定
- [Drizzle: Get started with SQLite](https://orm.drizzle.team/docs/get-started-sqlite) — better-sqlite3 / node:sqlite の接続方法
- [Drizzle latest releases](https://orm.drizzle.team/docs/latest-releases) — 1.0 RC の状況
- [Prisma ORM 7.3.0](https://www.prisma.io/blog/prisma-orm-7-3-0) — SQLite のドライバアダプタ必須化
- [Prisma SQLite docs](https://www.prisma.io/docs/orm/core-concepts/supported-databases/sqlite) — 比較対象
