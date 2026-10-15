# Brief: receipt-management

## Problem
作業者は業務で立て替えた支出を精算するため、領収書の内容を記録しておく必要がある。記録手段がないと申請時に情報が揃わず、精算の手間や誤りが増える。

## Current State
app-foundation によりユーザーと現在ユーザー取得の仕組みがある前提。領収書を扱う機能は存在しない。

## Desired Outcome
- 作業者が自分の領収書を項目入力で登録・編集・削除・一覧表示できる
- 他人の領収書は見えず、操作もできない
- 申請に含まれている領収書は編集・削除できない（判定は expense-claim-workflow に委ねる）

## Approach
領収書を独立したドメインとして扱い、所有者（作業者）単位でアクセスを制御する。項目は日付・金額・支払先・費目・メモを基本とし、入力値の検証をこの spec 内で完結させる。申請との関係は持たず、編集可否はワークフロー側が公開する問い合わせに従う。

## Scope
- **In**: 領収書モデル、項目入力フォームと入力検証、自分の領収書一覧、編集・削除、所有者によるアクセス制御、費目の定義
- **Out**: 画像添付・OCR、申請の作成・状態管理、承認者向けの閲覧

## Boundary Candidates
- 領収書のデータモデルと入力検証
- 所有者単位のアクセス制御
- 領収書一覧・編集 UI

## Out of Boundary
- 申請の状態や、どの申請に含まれているかの管理（expense-claim-workflow が所有）
- ユーザー／ロールの管理（app-foundation が所有）

## Upstream / Downstream
- **Upstream**: app-foundation（現在ユーザー取得）
- **Downstream**: expense-claim-workflow（領収書を申請に束ねる、領収書の参照）

## Existing Spec Touchpoints
- **Extends**: なし
- **Adjacent**: expense-claim-workflow（ロック判定の境界に注意）

## Constraints
- 申請状態を直接解釈しない。ロック判定の依存方向は design で明確化する（依存の逆転などで receipt-management → workflow の循環を避ける）
- 金額は日本円・整数を前提とする
