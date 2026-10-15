# Brief: app-foundation

## Problem
経費精算アプリの各機能（領収書管理・申請ワークフロー）は「今操作しているのは誰で、どのロールか」と「データをどこに永続化するか」に依存する。これらが機能ごとにバラバラに実装されると、責務が漏れ出し一貫性が失われる。

## Current State
リポジトリはまっさらで、アプリケーションコードは存在しない。

## Desired Outcome
- TanStack Start + TypeScript のプロジェクトが起動し、DB に接続できる
- ユーザー（作業者／承認者のロールを持つ）が定義され、画面上で操作ユーザーを簡易に切り替えられる
- 他 spec が「現在のユーザー」と「ユーザー一覧（ロール別）」を単一のインターフェースで取得できる

## Approach
ログイン機能は持たず、シードされたユーザーから選択して切り替える方式とする。現在ユーザーの保持方法（Cookie 等）はこの spec 内に隠蔽し、利用側には「現在ユーザーを返す」関数のみを公開する。ORM と DB スキーマ管理の方式もここで決定する。

## Scope
- **In**: プロジェクト初期構築、DB/ORM とマイグレーション、ユーザーとロールのモデル、シードデータ、ユーザー切替 UI、現在ユーザー取得インターフェース、共通レイアウト
- **Out**: パスワード・OAuth 等の本格認証、ユーザーの作成・編集画面、領収書や申請のドメインモデル

## Boundary Candidates
- ユーザー／ロールのモデルと参照インターフェース
- 現在ユーザーの保持・切替（実装詳細を隠蔽）
- アプリ基盤（DB 接続、レイアウト、ツールチェーン）

## Out of Boundary
- 領収書・申請のデータと画面
- ロールに基づく個別機能の権限判定（各機能 spec が現在ユーザーのロールを見て判断する）

## Upstream / Downstream
- **Upstream**: なし
- **Downstream**: receipt-management, expense-claim-workflow

## Existing Spec Touchpoints
- **Extends**: なし
- **Adjacent**: receipt-management, expense-claim-workflow（現在ユーザー取得インターフェースの利用者）

## Constraints
- TanStack Start（React）+ TypeScript、SQLite（ローカル）
- 将来本格認証に差し替えても利用側が変わらないよう、現在ユーザー取得の口を一つに絞る
