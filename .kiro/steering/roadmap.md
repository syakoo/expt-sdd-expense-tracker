# Roadmap

## Overview
作業者が自分の領収書を登録し、複数の領収書をまとめて経費精算を申請する。申請時に指定された承認者が承認すると精算完了となる、経費精算 Web アプリを構築する。

TanStack Start（React）によるフルスタック構成で、認証は持たず簡易的なユーザー切替でアクター（作業者／承認者）を表現する。ドメインの核である「申請の状態遷移」を独立した spec に閉じ込め、その上下に土台（ユーザー・基盤）と領収書管理を配置する。

## Approach Decision
- **Chosen**: 3 spec 分割（app-foundation → receipt-management → expense-claim-workflow）
- **Why**: 申請の状態遷移（下書き→申請中→差し戻し／承認済）の知識を expense-claim-workflow 一箇所に集約でき、深いモジュールとして設計できる。依存が一方向で、各 spec を独立にレビュー・実装できる
- **Rejected alternatives**:
  - 単一 spec: タスク数・レビュー範囲が大きく、状態遷移という核が埋もれる
  - 2 spec（土台を領収書側に含める）: ユーザー／ロールの責務が領収書 spec に混入し、承認ワークフローからの依存が不自然になる

## Scope
- **In**:
  - 簡易ユーザー切替（ログインなし）と作業者／承認者ロール
  - 領収書の項目入力による登録・編集・削除・一覧（日付・金額・支払先・費目・メモ等）
  - 複数領収書を束ねた申請の作成と提出（提出時に承認者を指定）
  - 承認者による承認／差し戻し、差し戻し後の修正・再申請
  - 承認をもって「精算完了」とする
- **Out**:
  - 本格的な認証・認可（パスワード、OAuth、セッション管理）
  - 領収書画像の添付、OCR による自動入力
  - 多段階承認、承認ルートのマスタ管理
  - 実際の支払・振込処理、会計システム連携
  - 通知（メール・Slack 等）

## Constraints
- TanStack Start（React）+ TypeScript のフルスタック単一リポジトリ
- 永続化は RDB（ローカル開発は SQLite 想定）。ORM の選定は app-foundation の design で行う
- Spec-Driven Development の実験プロジェクトであり、健全で見通しのよい設計を速度より優先する

## Boundary Strategy
- **Why this split**: 「誰か（ユーザー／ロール）」「何を（領収書）」「どう流すか（申請ワークフロー）」で責務を分け、変更理由ごとに spec を独立させる。状態遷移ルールは expense-claim-workflow だけが知る
- **Shared seams to watch**:
  - 現在ユーザーの取得インターフェース（app-foundation が提供し、他 2 spec が利用）
  - 「申請に含まれている領収書は編集・削除できない」というルールの所有者。状態は expense-claim-workflow が持ち、receipt-management は workflow が公開する問い合わせ（ロック判定）に従う形とし、receipt-management が申請状態を直接解釈しないこと
  - 承認者候補の一覧（app-foundation のユーザー／ロール情報を workflow が参照）

## Specs (dependency order)
- [ ] app-foundation -- TanStack Start 基盤、DB/ORM、ユーザーとロール（作業者／承認者）の簡易切替. Dependencies: none
- [ ] receipt-management -- 作業者による自分の領収書の登録・編集・削除・一覧. Dependencies: app-foundation
- [ ] expense-claim-workflow -- 複数領収書の申請、承認者指定、承認／差し戻し／再申請と状態遷移. Dependencies: app-foundation, receipt-management
