# expt-sdd-expense-tracker

Kiro スタイルの Spec-Driven Development (SDD) を、AI エージェント主導の開発フローで試すための実験リポジトリです。題材として、小さな経費精算 Web アプリを作ります。

> [!NOTE]
> 現在は discovery を終えた段階で、アプリケーションコードはまだありません。

## 作るもの

作業者が自分の領収書を登録し、複数の領収書をまとめて経費精算を申請します。申請時に指定した承認者が承認すると、精算完了になります。

- 簡易的なユーザー切替（ログインなし）と、作業者／承認者のロール
- 領収書の登録・編集・削除・一覧（日付・金額・支払先・費目・メモ）
- 複数の領収書を束ねた申請の作成と、承認者を指定しての提出
- 承認者による承認／差し戻し（コメント付き）と、差し戻し後の再申請
- 承認をもって精算完了とし、以後は変更不可

本格的な認証、領収書画像の添付・OCR、多段階承認、支払処理、通知はスコープ外です。

## 技術スタック（予定）

- Next.js (App Router) + TypeScript のフルスタック構成
- RDB（ローカル開発は SQLite）。ORM は `app-foundation` の design で選定します

## Spec 構成

責務を「誰が（ユーザー／ロール）」「何を（領収書）」「どう流すか（申請ワークフロー）」で分け、3 つの spec に分割しています。依存は一方向です。

```
app-foundation  ──▶  receipt-management  ──▶  expense-claim-workflow
```

| Spec | 内容 |
| --- | --- |
| [`app-foundation`](.kiro/specs/app-foundation/brief.md) | Next.js 基盤、DB/ORM、ユーザーとロールの簡易切替、現在ユーザー取得インターフェース |
| [`receipt-management`](.kiro/specs/receipt-management/brief.md) | 作業者による自分の領収書の登録・編集・削除・一覧 |
| [`expense-claim-workflow`](.kiro/specs/expense-claim-workflow/brief.md) | 申請の作成・提出、承認／差し戻し／再申請と状態遷移 |

申請の状態遷移（下書き → 申請中 → 差し戻し → 申請中 … → 承認済）の知識は `expense-claim-workflow` だけに閉じ込めます。分割の理由と境界の注意点は [roadmap](.kiro/steering/roadmap.md) を参照してください。

## 開発の進め方

Claude Code 上で、`.claude/skills/kiro-*` のスキルを使って進めます。各フェーズで人間がレビューしてから次へ進みます。

1. **Discovery**: `/kiro-discovery` で roadmap と brief を作る（完了）
2. **Specification**: 要件 → 設計 → タスク の順に spec を作る
   - `/kiro-spec-requirements {feature}`
   - `/kiro-spec-design {feature}`
   - `/kiro-spec-tasks {feature}`
   - 複数 spec をまとめて作るなら `/kiro-spec-batch`
3. **Implementation**: `/kiro-impl {feature}` で実装し、`/kiro-validate-impl {feature}` で検証する

進捗は `/kiro-spec-status {feature}` で確認できます。

## ディレクトリ

```
.kiro/
├── steering/   # プロジェクト全体の方針（roadmap など）
├── specs/      # 機能ごとの spec（brief / requirements / design / tasks）
└── settings/   # spec と steering のテンプレート
.claude/skills/ # SDD ワークフローのスキル群
```
