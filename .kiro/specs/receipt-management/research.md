# Research & Design Decisions

## Summary
- **Feature**: `receipt-management`
- **Discovery Scope**: Extension（app-foundation の上に機能モジュールを 1 つ足す。Light discovery）
- **Key Findings**:
  - app-foundation の規約（`src/<feature>/` の機能モジュール、`*.functions.ts` は薄く `*.server.ts` に `db` と `user` を渡す、`MODULE_BOUNDARIES` による import 境界、`src/*/schema.ts` をグロブで拾うマイグレーション）にそのまま乗せられる。新しい外部依存は不要
  - 現在の `src/start.ts` は `createStart` で request middleware を独自に定義しているため、TanStack Start の既定の CSRF ミドルウェアが適用されていない（`createStartHandler.js` は `startInstance` があると既定の `defaultCsrfMiddleware` を使わない）。app-foundation の design は「既定の CSRF ミドルウェアに依存する」としており、実装と食い違っている。本 spec は変更系の Server Function（登録・更新・削除）を初めて足すため、これを前提条件とした。検討の結果、app-foundation の後追い修正として `src/start.ts` に `createCsrfMiddleware` を登録し、app-foundation の design.md も訂正した（ブランチ `fix/app-foundation-csrf`）。本 spec は `src/start.ts` を変更しない
  - ロック判定の依存方向は「receipt-management がロックの記録とその問い合わせを持ち、expense-claim-workflow がロックの付け外しを指示する」形にする。依存は workflow → receipts の一方向だけになり、実行時の登録（グローバルな可変状態）も不要になる

## Research Log

### 既存コードベースの規約
- **Context**: app-foundation が実装済みのため、その規約と公開契約に合わせる
- **Sources Consulted**: `.kiro/specs/app-foundation/design.md`、`.kiro/steering/{tech,structure}.md`、`src/identity/*`、`src/db/*`、`src/routes/*`、`eslint.config.js`、`drizzle.config.ts`、`vitest.config.ts`、`playwright.config.ts`、`e2e/*.spec.ts`
- **Findings**:
  - 現在ユーザーは `@/identity` の `requireCurrentUser()`（Server Function）で得る。未選択なら `/select-user` へのリダイレクトを投げる。`User.roles` は `readonly [Role, ...Role[]]` で、操作可否は返さない（可否は各機能が判断する）
  - `_app` 配下のルートはコンテキストに `user: User` を持つ。ルーターは `defaultPreload: false`、`defaultGcTime: 0`
  - テーブル定義は `src/<feature>/schema.ts` に置けば `drizzle.config.ts` のグロブが拾う。ユーザーへの外部キーは `text(...).references(() => users.id).$type<UserId>()`
  - テストは `createTestDatabase()` と `seedUsers(db)`、`SEED_USERS` を使う。`user-01`/`user-02` は作業者のみ、`user-03`/`user-04` は承認者のみ、`user-05` は両方
  - import 境界は `eslint.config.js` の `MODULE_BOUNDARIES` に機能モジュールごとの制限パターンを 1 件足して守る
  - コンポーネントのテストは `renderToString` による HTML の検証（環境は `node`）
  - E2E の DB（`data/e2e.db`）は実行のたびに `db:setup` されるが、削除はされない。前回の実行で作ったデータが残る
- **Implications**:
  - 機能モジュール `src/receipts/` を新設し、`index.ts`（クライアントからも使える公開面）、`schema.ts`（外部キー参照用）、`ui`（画面部品）、`api.server.ts`（下流のサーバーコード向け）を公開面にする
  - E2E は実行ごとに一意な支払先名を使い、前回のデータに依存しない検証にする。空の一覧表示はコンポーネントのテストで確かめる

### CSRF ミドルウェアの適用状況
- **Context**: 本 spec で初めて状態を変更する Server Function（POST）を作る。app-foundation の design は「TanStack Start の既定の CSRF ミドルウェアに依存する」と書いている
- **Sources Consulted**: `node_modules/@tanstack/start-server-core/dist/esm/createStartHandler.js`、`node_modules/@tanstack/start-client-core/dist/esm/createCsrfMiddleware.d.ts`、`src/start.ts`
- **Findings**:
  - `createStartHandler` は `requestMiddleware: startInstance ? startOptions.requestMiddleware : isServerFnRequest ? [defaultCsrfMiddleware] : undefined` としている。`src/start.ts` で `startInstance` を定義すると、既定の CSRF ミドルウェアは適用されない
  - 開発時は CSRF ミドルウェアがないと `console.warn` で警告し、`createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })` を `requestMiddleware` に足すよう案内する
  - `createCsrfMiddleware` は `@tanstack/react-start` から export されている。既定では `Sec-Fetch-Site: same-origin` を要求し、ヘッダーがなければ `Origin`、`Referer` の順に確かめる
- **Implications**:
  - `src/start.ts` の `requestMiddleware` に CSRF ミドルウェアを追加する。当初は本 spec のタスクで 1 回限りの追随修正として引き受ける案だったが、`src/start.ts` は app-foundation の所有で、ユーザー選択の Server Function もすでに無防備だったため、app-foundation の後追い修正として先に入れる形に改めた（Cache-Control の修正と同じ扱い）
  - ブラウザからの同一オリジンの RPC と Playwright（実ブラウザ）は影響を受けない

### ロック判定の依存方向
- **Context**: brief と roadmap は、「申請に含まれている領収書は編集・削除できない」というルールの判断を expense-claim-workflow に置き、receipt-management は申請状態を解釈せずに従うこと、receipt-management → workflow の循環を避けることを求めている
- **Sources Consulted**: `.kiro/steering/roadmap.md`、`.kiro/specs/receipt-management/brief.md`、`.kiro/specs/expense-claim-workflow/brief.md`、TanStack Start の Server Function の読み込み方式（`createStartHandler.js` の serverFn マニフェストによる遅延読み込み）
- **Findings**:
  - workflow は receipt-management を参照する（領収書を申請に束ねる、内容を表示する）ため、workflow → receipts の依存は必ずある。receipts が workflow のコードを呼ぶ形にすると循環する
  - 依存性逆転（receipts がポートを定義し、workflow が実装を登録する）は循環を避けられるが、登録をどこで行うかが問題になる。TanStack Start は Server Function のハンドラをマニフェスト経由で必要になったときに読み込むため、workflow のモジュールが読み込まれる前に領収書の更新が呼ばれうる。登録を確実にするには合成点（composition root）が要るが、`src/start.ts` は `src/` のモジュールに依存しない方針である
  - workflow の状態遷移（提出・差し戻し・承認）はすべて workflow のドメイン層を通る。遷移のトランザクション内で「この領収書をロックする／解く」を receipts に指示すれば、ロックの判断は workflow に残したまま、receipts は自分のデータだけを見て判定できる
- **Implications**: 「ロックの記録」を receipts が持ち、workflow が付け外しを指示する方式を採る（Design Decisions 参照）

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A. ロックの記録を receipts が持ち、workflow が付け外しを指示する | receipts が `receipt_locks` と `lockReceipts` / `unlockReceipts` を公開。更新・削除時は自分のテーブルだけを見る | 依存が workflow → receipts の一方向。実行時の登録が不要で、読み込み順に左右されない。ロック中の削除を外部キー（RESTRICT）でも防げる。workflow 未実装時はロックがない＝正しい既定 | workflow の申請状態とロックの記録が二重になる。workflow が付け外しを忘れると食い違う | 採用。食い違いは workflow の状態遷移のトランザクション内で付け外しすることと、workflow のテストで防ぐ |
| B. receipts がポートを定義し、workflow が実装を実行時に登録する | `registerReceiptLockChecker(checker)`。未登録なら「ロックなし」 | 情報源が workflow の 1 か所だけ | 登録のタイミングが Server Function の遅延読み込みに左右される。登録漏れが無言で「ロックなし」になる。グローバルな可変状態 | 不採用。合成点を作るには app-foundation の `start.ts` の方針変更が要る |
| C. receipts が workflow の問い合わせ関数を直接 import する | `@/claims` の `isReceiptLocked` を呼ぶ | 単純 | receipts → workflow → receipts の循環。roadmap の制約に反する | 不採用 |
| D. 静的な合成モジュール（例：`src/composition/`）で両者をつなぐ | receipts の Server Function が合成モジュール経由で workflow の実装を受け取る | 実行時の登録が不要 | モジュールの依存グラフ上で receipts → composition → workflow → receipts の循環が残る | 不採用 |

## Design Decisions

### Decision: ロックは receipts が記録し、workflow が付け外しを指示する
- **Context**: 要件 7（ロック中の領収書の保護）と roadmap の境界（receipts は申請状態を解釈しない、循環を作らない）
- **Alternatives Considered**: 上の表の B・C・D
- **Selected Approach**:
  - receipts が `receipt_locks`（領収書 ID を主キーとする行の有無）を持つ。行があればロック中
  - receipts は更新・削除のトランザクション内でロックの有無を確かめ、ロック中なら拒否する
  - サーバー側の公開面 `@/receipts/api.server` に `lockReceipts(db, ids)` / `unlockReceipts(db, ids)` を置く。いつ呼ぶか（どの申請状態でロックするか）は workflow が決める
  - workflow が存在しない間は誰も `lockReceipts` を呼ばないので、すべての領収書がロックされていない（要件 7.6）
- **Rationale**: 依存方向を roadmap の dependency order（workflow は receipt-management に依存する）と一致させたまま、ロックの判断を workflow に残せる。receipts から見たロックは「理由を知らない保留」であり、申請の状態名を一切持たない
- **Trade-offs**: 状態の二重化を受け入れる代わりに、実行時の登録・読み込み順・グローバル状態をなくした。二重化の整合は、workflow の状態遷移と同じトランザクションで付け外しすることで保つ（better-sqlite3 は単一接続の同期 API なので、workflow が `db.transaction(() => { ... })` の中で同じ `db` を渡せば同じトランザクションに入る）
- **Follow-up**: expense-claim-workflow の design で、提出・再提出時に `lockReceipts`、差し戻し時に `unlockReceipts` を呼ぶこと、承認済みはロックを解かないことを定め、遷移ごとにロックの有無をテストする

### Decision: 下流が `receipts.id` を参照する外部キーは ON DELETE CASCADE にする
- **Context**: 要件 5.2 は、ロックされていない領収書の削除が成功することを求める。workflow の下書きの申請に含まれる領収書はロックされない
- **Selected Approach**: 下流のテーブルが `receipts.id` を参照するときは `ON DELETE CASCADE` にする契約を design.md に書く。ロック中の領収書の削除は、receipts のドメインの判定に加えて `receipt_locks` の外部キー（`ON DELETE RESTRICT`）でも防ぐ
- **Rationale**: 下流の外部キーが RESTRICT だと、ロックされていない領収書の削除が SQLite のエラーになり、要件 5.2 と 8.5 の区別がつかなくなる
- **Trade-offs**: 下書きの申請から領収書が黙って外れる。下書きはロックされていない＝作業者が自由に変更できる状態なので、要件と矛盾しない

### Decision: 入力検証は「形の検証（Server Function の validator）」と「項目の検証（ドメイン）」に分ける
- **Context**: 要件 1.3・2・4.3 は項目ごとのエラー表示を求める。steering の規約では `.validator(parseXxxInput)` は不正な形を Error として投げる
- **Selected Approach**:
  - `parseReceiptFormInput` などの validator は「各項目が文字列か」だけを確かめ、不正なら Error を投げる（正規の UI からは発生しない）
  - `validateReceiptForm(form)` が項目ごとの規則を判定し、`{ ok: true, draft }` か `{ ok: false, errors }` を返す。Server Function は後者を `{ status: 'invalid', errors }` として返し、画面が項目ごとに表示する
  - 登録と更新で同じ `validateReceiptForm` を使う（要件 2.10）
- **Rationale**: 利用者の入力の誤りは例外ではなく結果として扱い、型で網羅的に表示させる。app-foundation の `SelectUserResult` と同じ「判別共用体の結果」の作法に揃う
- **Trade-offs**: クライアント側の即時検証はしない（送信時にサーバーが判定）。ローカル開発のみのアプリなので往復の遅延は問題にならない

### Decision: 作業者ロールの判定は receipts の `canManageReceipts(user)` に集約する
- **Context**: 要件 6.1・6.2・8.4。app-foundation は可否の判定を返さず、各機能が判断する
- **Selected Approach**: `@/receipts` から純粋関数 `canManageReceipts(user)` を公開する。サービス層（データの保護）、画面（役割が足りないことの表示）、トップ画面の導線が同じ関数を使う
- **Rationale**: 「領収書を管理できるのは作業者」という規則を 1 か所に置く

### Decision: ロールが足りない場合と他人の領収書の扱い
- **Selected Approach**:
  - ロールが足りない：Server Function は `{ status: 'forbidden' }` を返し、画面は「領収書を管理するには作業者ロールが必要です」と表示する（要件 6.2）
  - 他人の領収書：存在しない領収書と同じ `{ status: 'not-found' }` を返す（要件 6.3）。他人の領収書 ID の存在を推測させない
- **Rationale**: 要件どおり。ロールの不足は利用者が自分で状況を理解できる必要があるが、他人の領収書の存在は知らせる必要がない

### Decision: 金額の上限・文字数の上限・費目
- **Context**: brief は「金額は日本円・整数」とだけ定める。要件で検証規則を具体化した
- **Selected Approach**: 金額 1〜9,999,999 円（半角数字のみ、桁区切りなし）、支払先 1〜100 文字（前後の空白を除いて数える）、メモ 0〜500 文字、費目は 7 種類の固定リスト（コードは英字、表示ラベルは日本語）
- **Rationale**: 個人の立替精算の 1 枚の領収書として十分な範囲で、表示の崩れを防げる上限にした。費目はマスタ管理を持たない（roadmap の Out of Scope「承認ルートのマスタ管理」と同様に、管理画面を作らない）
- **Trade-offs**: 全角数字や桁区切り付きの金額は受け付けない。エラーメッセージで「半角数字」と案内する

### Decision: 日付は `YYYY-MM-DD` の文字列で保存する
- **Selected Approach**: 入力は `<input type="date">`（値は `YYYY-MM-DD`）。保存も同じ文字列（TEXT）にし、並べ替えは文字列の降順で正しく日付順になる。実在しない日付（`2026-02-30` など）は検証で拒否する。未来の日付は拒否しない（要件にない）
- **Rationale**: 時刻帯の変換を持ち込まない。日付は「領収書に書かれた日」であり、時刻を持たない

## Synthesis Outcomes

### Generalization
- 登録と更新は同じ「領収書の項目」を受け取り、同じ検証を通す。`ReceiptFormInput`（生の文字列）→ `ReceiptDraft`（検証済み）という 1 つの変換を両方で使う
- 画面も登録・編集で同じ `ReceiptForm` コンポーネントを使い、初期値と送信先だけを変える
- ロック・所有者・ロールの拒否は、Server Function の結果の判別共用体（`forbidden` / `not-found` / `locked` / `invalid`）として統一し、画面は網羅的に分岐する

### Build vs. Adopt
- 入力検証ライブラリ（zod 等）は採用しない。app-foundation と同じく、検証対象が単純で、項目ごとのメッセージを日本語で直接書くほうが見通しがよい
- 金額の表示は `Intl.NumberFormat('ja-JP')` を使う（標準 API）
- 一意な ID は `crypto.randomUUID()`（Node.js 標準）を使う
- 削除の確認は `window.confirm` ではなく画面内の確認領域にする。キーボード・支援技術で扱いやすく、E2E でダイアログ処理を要さない

### Simplification
- 楽観ロック（版番号）は持たない。同じ作業者が 2 つのタブで同時に編集した場合は後勝ちとする。所有者は 1 人だけで、競合しても失うのは自分の入力だけのため
- 下流向けのテスト用ユーティリティは `@/receipts/test-fixtures.server`（`createTestReceipt` / `updateTestReceipt` / `deleteTestReceipt`）の 3 関数に限る。当初は「下流のテストは `@/receipts/schema` で直接行を入れられる」として作らない方針だったが、spec 横断のレビューで、下流のテストが `receipts` に直接書き込むと NOT NULL 列の追加のたびに下流のテストが壊れ、`receipts` の真実の情報源が分散することが指摘されたため改めた。identity の `seed.server` と同じくテストファイル専用（`eslint.config.js` の `testOnly`）とし、リポジトリの上に作って SQL を持たせない
- ロックの記録に「誰がロックしたか」は持たない。1 つの領収書は同時に 1 つの申請にしか含まれない（expense-claim-workflow の制約）ため、付け外しは領収書 ID だけで足りる
- 役割が足りない利用者のための専用ルートやレイアウトは作らない。各画面が `canManageReceipts` の結果または Server Function の `forbidden` を見て同じ表示部品を出す

## Risks & Mitigations
- workflow がロックの付け外しを忘れ、申請中の領収書が編集できてしまう — design.md の Downstream Contract で付け外しの時機を明記し、workflow の design とテストで遷移ごとのロック状態を検証させる
- CSRF ミドルウェアが app-foundation に入る前に本 spec を実装してしまう — 本 spec の実装は app-foundation の CSRF 修正（ブランチ `fix/app-foundation-csrf`）の取り込みを前提とし、最後の検証で別オリジンからの POST が 403 になることを確かめる
- E2E の DB にデータが残る — 実行ごとに一意な支払先名を使い、自分が作った行だけを検証する
- 下流が `receipts.id` を RESTRICT で参照し、削除が失敗する — Downstream Contract に CASCADE を明記する。違反した場合も削除の失敗は「処理が完了しなかった」表示になり、成功と誤認させない（要件 8.5）

## References
- `.kiro/specs/app-foundation/design.md` — 現在ユーザーの取得口、DB、import 境界の契約
- `.kiro/steering/structure.md`、`.kiro/steering/tech.md` — 配置・命名・テストの規約
- `node_modules/@tanstack/start-server-core/dist/esm/createStartHandler.js` — 既定の CSRF ミドルウェアが適用される条件
- [TanStack Start: Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) — `createServerFn`、`validator`、`notFound()`
