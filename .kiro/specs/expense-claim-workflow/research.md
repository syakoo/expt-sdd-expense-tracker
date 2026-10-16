# Research & Design Decisions: expense-claim-workflow

## Summary
- **Feature**: `expense-claim-workflow`
- **Discovery Scope**: Extension（app-foundation の機能モジュール方式に新しいモジュール `src/claims/` を足し、receipt-management の下流契約を使う）。新しい外部依存はないため、軽量ディスカバリーで行った
- **Key Findings**:
  - receipt-management の `@/receipts/api.server`（`findReceiptsByIds` / `listReceiptsByOwner` / `lockReceipts` / `unlockReceipts`）と `ON DELETE CASCADE` の外部キー規則で、本 spec の要件はすべて満たせる。上流の契約の変更は不要
  - Drizzle 0.45 の better-sqlite3 ドライバは `db.transaction` を better-sqlite3 のネイティブなトランザクションで実装しており、外側のトランザクションの中で再び `db.transaction` を呼ぶと SAVEPOINT として入れ子になる。workflow の状態遷移のトランザクションの中で `lockReceipts` を呼べば、ロックも同じトランザクションに入る
  - app-foundation は承認者候補の絞り込み（申請者本人を除く）を workflow 側の責務としている。`@/identity` の公開面にはサーバー側で `db` を受け取るユーザー検索がないため、Server Function のハンドラで `listUsersByRole` を呼び、結果をサービスに渡す

## Research Log

### 上流（receipt-management）の下流契約
- **Context**: 申請と領収書の紐付け、ロック、表示に使える入口を確かめる
- **Sources Consulted**: `.kiro/specs/receipt-management/design.md`（Boundary Commitments、ReceiptsDownstreamApi、Downstream Contract、Data Models）、`.kiro/specs/receipt-management/tasks.md`
- **Findings**:
  - `findReceiptsByIds(db, ids: readonly string[])` は未検証の文字列 ID を受け取り、引数の順で返し、存在しない ID を除く。所有者で絞らないため、権限の確認は workflow が行う
  - `listReceiptsByOwner(db, ownerId)` は一覧画面と同じ順（日付降順 → 作成降順）
  - `lockReceipts` は冪等で、存在しない ID があれば Error を投げて何もロックしない。`unlockReceipts` は冪等で、存在しない ID を無視する
  - `receipt_locks.receipt_id` は `receipts.id` を `ON DELETE RESTRICT` で参照するため、ロック中の領収書は DB 上も削除できない
  - 下流のテーブルは `receipts.id` を `ON DELETE CASCADE` で参照する。ロックされていない領収書の削除で、紐付けの行が自動で消える
  - 表示には `@/receipts` の `RECEIPT_CATEGORY_LABELS`、`@/receipts/ui` の `formatYen` / `formatReceiptDate` を使ってよい
  - import 境界：`@/receipts/**` のうち `schema`、`ui`、`api.server` は外から使える
  - app-foundation が `src/start.ts` で明示的に登録している CSRF ミドルウェアが、本 spec の変更系 Server Function も保護する
- **Implications**:
  - 申請の状態とロックの対応（申請中・精算完了はロック、下書き・差し戻しはロックしない）は本 spec のドメインモデルに置き、receipts には状態を渡さない
  - 紐付けのテーブルは `receipts.id` を `ON DELETE CASCADE` で参照する。要件 2.5（下書き・差し戻しの申請の領収書が削除されたら外れる）はこの外部キーで満たせる
  - ロックの前に、申請に含まれる領収書がすべて存在することを同じトランザクションで確かめる（カスケードで紐付けが消えるため、紐付けにある ID は存在する）

### トランザクションの入れ子
- **Context**: 状態の変更・履歴・ロックを 1 つのトランザクションにまとめられるか（要件 6.6）
- **Sources Consulted**: `node_modules/drizzle-orm/better-sqlite3/session.js`（0.45 系）、better-sqlite3 の `Database#transaction` の仕様
- **Findings**:
  - `BetterSQLiteSession.transaction` は `this.client.transaction(fn)[behavior](tx)` で、better-sqlite3 のネイティブなトランザクション関数を使う
  - better-sqlite3 のトランザクション関数は、既にトランザクション中なら SAVEPOINT として入れ子になる。内側で例外が起きれば内側だけが巻き戻り、例外は外側に伝わる
  - トランザクション関数は同期でなければならない（Promise を返すと better-sqlite3 が例外を投げる）
- **Implications**:
  - workflow のサービスは `db.transaction(() => { ... })` の中で、引数の `db`（コールバックの `tx` ではない）をリポジトリと `@/receipts/api.server` に渡す。単一接続の同期 API のため、すべて同じトランザクションに入る
  - 非同期の処理（`listUsersByRole` の呼び出し）はトランザクションの前、ハンドラで済ませる

### 承認者候補と表示名の取得
- **Context**: 承認者ロールのユーザーの一覧（要件 4.1, 4.5, 4.7）と、一覧・履歴に出すユーザーの表示名（要件 8.1, 9.1, 10.1, 10.2）
- **Sources Consulted**: `src/identity/index.ts`、`src/identity/users.functions.ts`、`.kiro/specs/app-foundation/design.md`（Out of Boundary：「承認者候補の絞り込み（例：申請者本人を除く）は `listUsersByRole` の結果を workflow 側で絞り込む」）、`.kiro/steering/structure.md`
- **Findings**:
  - `@/identity` の公開面は Server Function（`getCurrentUser` / `requireCurrentUser` / `listUsersByRole`）と型だけ。`findUsers` などのリポジトリは内部
  - `@/identity/schema` の import は外部キー参照のためだけと決まっており、`users` を結合して表示名を読むのは規約違反
  - すべてのユーザーは 1 つ以上のロールを持つため、`listUsersByRole('worker')` と `listUsersByRole('approver')` の和集合が全ユーザーになる
  - receipts の Server Function が `requireCurrentUser()` を呼ぶのと同じく、Server Function のハンドラから別の Server Function を呼べる
- **Implications**:
  - ハンドラで 2 つのロールの一覧を取り、純粋な `UserDirectory`（ID → ユーザー、承認者候補の算出）に組み立ててサービスに渡す。サービスは `db`・`user`・`directory` を引数で受け取り、Vitest から `SEED_USERS` で作ったディレクトリでテストできる
  - 承認者の妥当性（承認者ロールを持つ、本人でない）は提出のたびに `UserDirectory` で確かめる。承認・差し戻しの時点でも、現在ユーザーが承認者ロールを持つことを確かめる

### 画面とルーティング
- **Context**: 申請の詳細を作業者・承認者で共有し、編集画面を別に持つ
- **Sources Consulted**: `src/routes/` の既存構成、receipt-management の design（`$receiptId.edit.tsx`）、TanStack Router のファイルベースルーティングの命名規則
- **Findings**:
  - `$claimId.tsx` と `$claimId.edit.tsx` を並べると、前者が後者の親（レイアウト）になる。ディレクトリ `$claimId/` の下に `index.tsx` と `edit.tsx` を置けば、兄弟のルートになる
  - ルーターは `defaultGcTime: 0`、`defaultPreload: false` で、ユーザー切替後の遷移でローダーが再実行される
- **Implications**: 詳細は `/claims/$claimId`、編集は `/claims/$claimId/edit`、作業者の一覧は `/claims`、作成は `/claims/new`、承認者の一覧は `/approvals`

### 日時の表示
- **Context**: 一覧と操作履歴に日時を出す（要件 8.1, 9.1, 10.2）
- **Findings**: SSR とハイドレーションでタイムゾーンが違うと表示がずれ、ハイドレーションの不一致になる
- **Implications**: `Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', ... })` でタイムゾーンを固定し、`YYYY/MM/DD HH:mm` で表示する

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 遷移表を持つ純粋なドメインモジュール + トランザクションスクリプトのサービス | 状態・操作・操作者の種類・ロックの効果・履歴の種類を 1 つの遷移表に書き、サービスは表の判断を DB に反映するだけ | 遷移規則が 1 ファイルに閉じ、画面の「許される操作」も同じ表から導ける。DB なしで網羅的にテストできる | 表とサービスの対応（効果の適用漏れ）はサービスのテストで確かめる必要がある | 採用 |
| 状態ごとのクラス（State パターン） | `DraftClaim`、`SubmittedClaim` などのクラスにメソッドを持たせる | 型で不正な遷移を防げる | シリアライズできる値と DB の行との変換が増える。4 状態・4 遷移には過剰 | 不採用 |
| ステートマシンのライブラリ（XState など） | 遷移をライブラリの定義で書く | 可視化・検証の道具がある | 新しい依存。4 状態の規則に対して学習・保守のコストが勝つ | 不採用（Build vs Adopt 参照） |
| サービスの中に if 文で規則を書く | 操作ごとの関数が自分で状態を確かめる | 素直 | 規則が操作ごとに散り、画面の「許される操作」と食い違う | 不採用 |

## Design Decisions

### Decision: 遷移規則を `claim-rules.ts` の遷移表 1 つに集める
- **Context**: brief の制約「状態遷移の判断を UI や他 spec に漏らさない」、要件 6.2, 10.4
- **Alternatives Considered**:
  1. サービスの各操作に規則を書く
  2. 遷移表を 1 つ持ち、操作の可否・遷移先・ロックの効果・履歴の種類・画面の「許される操作」をそこから導く
- **Selected Approach**: 2。`decideClaimCommand(snapshot, actor, command)` が判断を返し、`listAvailableActions(snapshot, actor)` が同じ表から画面向けの操作の一覧を返す
- **Rationale**: 規則を 1 か所で読め、画面とサーバーで判断が食い違わない（深いモジュール）
- **Trade-offs**: 編集（update）と削除（delete）は状態を変えない操作だが、同じ表で「どの状態で許すか」を表す
- **Follow-up**: 遷移表の全組合せ（4 状態 × 5 操作 × 操作者の種類）を単体テストで網羅する

### Decision: 楽観的な排他に `revision` を使う
- **Context**: 要件 6.4, 6.5。承認者が画面を開いた後に差し戻し → 再提出で内容が変わっても、古い表示のまま承認できてはいけない
- **Alternatives Considered**:
  1. 送信時に状態だけを確かめる
  2. 申請に `revision`（変更のたびに増える整数）を持たせ、変更系の要求は表示時の `revision` を送る
- **Selected Approach**: 2。トランザクションの中で `revision` が一致しなければ `conflict` を返し、画面は最新の状態を読み直す
- **Rationale**: 状態だけでは「差し戻し → 再提出で中身が変わった申請中」を区別できない。整数 1 つで、表示した内容に対する操作であることを保証できる
- **Trade-offs**: 領収書の内容の変更（receipt-management 側）は `revision` を増やさない。ただし申請中・精算完了の領収書はロック中で変えられないため、承認の対象の内容は変わらない
- **Follow-up**: 同じ `revision` での承認と差し戻しの連続要求で、後者が `conflict` になることをテストする

### Decision: 承認者は提出のたびに指定し、申請に現在の承認者を 1 人だけ持つ
- **Context**: brief「承認者は提出時に作業者が承認者ロールのユーザーから指定」、要件 4.2–4.4
- **Selected Approach**: 下書きは承認者を持たない。提出・再提出の要求に承認者を含め、`claims.approver_id` を上書きする。再提出の初期選択は直前の承認者。履歴の提出・再提出のイベントに、そのときの承認者を記録する
- **Rationale**: 承認者を提出の入力にすると、承認者の記録と状態の変更が同じ操作で起こり、「申請中なのに承認者がいない」状態を作らない（CHECK 制約でも保証する）
- **Trade-offs**: 再提出で承認者を変えると、前の承認者の一覧からその申請は消える（現在の承認者だけが見える）。要件 9.1, 11.3 と整合する

### Decision: 表示名と承認者候補は `UserDirectory` としてサービスに渡す
- **Context**: Research Log「承認者候補と表示名の取得」
- **Alternatives Considered**:
  1. `@/identity/schema` の `users` を結合して表示名を読む（規約違反）
  2. app-foundation に `db` を受け取るユーザー検索の公開を求める（上流の変更）
  3. ハンドラで `listUsersByRole` を 2 回呼び、純粋な `UserDirectory` にしてサービスに渡す
- **Selected Approach**: 3
- **Rationale**: 上流の契約を変えず、app-foundation の design が想定する使い方（`listUsersByRole` の結果を workflow が絞り込む）に沿う。サービスは純粋な値を受け取るだけでテストしやすい
- **Trade-offs**: 要求ごとにユーザーの一覧を 2 回読む。シードは 5 人で、ローカル開発のみのため問題にならない

### Decision: 申請と領収書の紐付けは `receipt_id` を主キーにする
- **Context**: brief の制約「1 つの領収書は同時に 1 つの申請にしか含められない」、要件 2.2
- **Selected Approach**: `claim_receipts(receipt_id PRIMARY KEY, claim_id)`。サービスでも事前に確かめて理由を表示し、DB の一意性は最後の防衛線にする
- **Rationale**: 状態に関わらず 1 申請だけ（精算完了の領収書を別の申請で再び精算させない）を DB で保証できる

### Decision: 差し戻しのコメントは任意、承認には確認を挟む
- **Context**: brief「差し戻し時はコメントを付けられる」、要件 5.3, 12.6
- **Selected Approach**: コメントは任意（500 文字以内）。承認は取り消せないため、確認領域で「承認する」をもう一度押させる。差し戻しはコメント欄と「差し戻す」ボタンの組で、確認を挟まない（再提出で戻せるため）

## Synthesis Outcomes

### Generalization
- 提出と再提出は「承認者を指定して申請中にする」同じ操作で、遷移元（下書き／差し戻し）と履歴の種類だけが違う。Server Function は `submitClaim` 1 つにし、遷移表が履歴の種類（`submitted` / `resubmitted`）を決める
- 変更系の 6 操作（作成を除く）は、すべて「読み込み → 可視性 → 操作者 → revision → 遷移表 → 入力の検証 → 反映」の同じ骨組みで判断できる。サービス内部の 1 つの手順（`runClaimCommand`）にまとめる
- 画面の「許される操作」（要件 10.4）は、サーバーの判断と同じ遷移表から導く

### Build vs Adopt
- ステートマシンのライブラリは採らない。4 状態・4 遷移と 2 つの状態内操作（編集・削除）で、遷移表は 20 行程度に収まる。新しい依存は steering の方針（app-foundation が導入済みのものだけを使う）にも反する
- 日時の書式は `Intl.DateTimeFormat`、金額の書式は `@/receipts/ui` の `formatYen` を使う

### Simplification
- 申請のメモ・承認時のコメントは持たない（要件にない）
- 通知・取り下げ・差し戻し後の削除・承認者の変更依頼は持たない
- `@/claims/schema` は公開しない。現時点で外部キーで申請を参照する下流がないため。将来必要になれば公開面を足す
- 一覧の合計金額・件数は、申請ごとの集計テーブルを持たず、表示のたびに `findReceiptsByIds` の結果から計算する（ローカルの小規模なアプリ）

## Risks & Mitigations
- **上流 receipt-management が未実装** — 本 spec の実装は receipt-management の実装完了（`drizzle/0001_receipts.sql`、`@/receipts/api.server`、`@/receipts/test-fixtures.server`）と、app-foundation の CSRF ミドルウェアを前提とする。タスクの最初で前提を確かめる
- **マイグレーションの番号の衝突** — receipt-management が `0001_receipts` を作った後に `npm run db:generate -- --name claims` を実行し、`0002_claims` とする。生成順を守る
- **ロックと状態の食い違い** — 状態の変更と `lockReceipts` / `unlockReceipts` を同じトランザクションで呼び、外側をロールバックしたときにロックも残らないことを統合テストで確かめる
- **`src/routes/_app/index.tsx`、`eslint.config.js`、`.kiro/steering/structure.md` を receipt-management も変更する** — 本 spec の実装は receipt-management の実装後に行うため、同時編集にはならない。差分は追記に限る。例外は `src/routes/_app/index.tsx` の導線で、receipt-management の「領収書を管理する」リンクと申請の 2 つのリンクを 1 つの `<nav aria-label="機能">` の `<ul>` にまとめるため、既存のリンクの置き場所だけを本 spec が組み直す（文言・リンク先・表示条件は変えない）
- **承認者のロールが提出後に外れる** — 承認・差し戻しの時点でロールを確かめ、外れていれば存在しない申請と同じ応答にする（シードは固定のため実際には起きない）

## Upstream Contract Assessment（receipt-management）
- 本 spec の要件を満たすのに、receipt-management の本番向けの契約の変更は不要と判断した。テストのための公開面（`@/receipts/test-fixtures.server`）の追加と、`findReceiptsByIds` の引数の型の明確化は、下記の提案として上流で採用された
- **Finding（上流への改善提案、上流で採用済み）**: 当初、receipt-management は下流のテスト向けに領収書を用意する公開面を持たず、本 spec はテスト専用のフィクスチャ `src/claims/test-receipts.server.ts` で `receipts` に直接行を入れる案（Downstream Contract 4 のテスト専用の例外）としていた。spec 横断のレビューを受け、receipt-management が identity の `seed.server` と同じ testOnly の公開面 `@/receipts/test-fixtures.server`（`createTestReceipt(db, ownerId, overrides?)` / `updateTestReceipt(db, id, patch)` / `deleteTestReceipt(db, id)`。Lint がテストファイル以外からの import を禁じる）を用意することになった。本 spec はこれを使い、`test-receipts.server.ts` と Downstream Contract 4 の例外は廃止した
- **Finding（上流の契約の明確化、上流で採用済み）**: `findReceiptsByIds(db, ids: readonly string[])` は未検証の文字列 ID を受け取り、存在しない ID は返さない。本 spec は利用者の入力をブランド型にキャストせずにそのまま渡し、`lockReceipts` / `unlockReceipts`（`readonly ReceiptId[]`）には返された `Receipt` の ID か `claim_receipts` から読んだ ID だけを渡す
- 確認した前提（変わった場合は本 spec の再検証が必要）
  - `lockReceipts` / `unlockReceipts` が呼び出し側の `db.transaction` の中で入れ子として動くこと
  - `findReceiptsByIds` が所有者で絞らないこと（承認者が他人の領収書を表示するため。所有者の確認は本 spec が行う）、未検証の文字列 ID を受け取り存在しない ID を返さないこと
  - `@/receipts/test-fixtures.server` の `createTestReceipt` / `updateTestReceipt` / `deleteTestReceipt` の入出力と、テストファイルからだけ import できること
  - app-foundation が `src/start.ts` で明示的に登録している CSRF ミドルウェアが、すべての Server Function の呼び出しに効いていること（本 spec は `src/start.ts` を変更せず、これに依存する）
  - ロック中の領収書が `ON DELETE RESTRICT` で削除できないこと（申請中・精算完了の申請から領収書が消えない前提）
  - `ReceiptId` / `Receipt` / `RECEIPT_CATEGORY_LABELS` / `formatYen` / `formatReceiptDate` の形

## References
- `.kiro/specs/receipt-management/design.md` — Downstream Contract、ReceiptsDownstreamApi
- `.kiro/specs/app-foundation/design.md` — `listUsersByRole` と承認者候補の絞り込みの責務
- `.kiro/steering/structure.md` — Server Function を薄くする規約、import 境界
- `node_modules/drizzle-orm/better-sqlite3/session.js` — `transaction` の実装（ネイティブなトランザクション関数）
