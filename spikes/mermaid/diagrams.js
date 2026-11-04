// Diagrams typical of system specification documents, with Japanese labels.
export const DIAGRAMS = {
  flowchart: `flowchart TD
  A[利用者がログイン] --> B{認証に成功?}
  B -- はい --> C[ダッシュボードを表示する]
  B -- いいえ --> D[エラーメッセージを表示して再入力を求める]
  C --> E((終了))`,
  sequence: `sequenceDiagram
  participant U as 利用者
  participant W as Webサーバー
  participant D as データベース
  U->>W: 検索条件を送信
  W->>D: SELECT 実行
  D-->>W: 結果（最大100件）
  W-->>U: 一覧画面を返す
  Note over W,D: タイムアウトは30秒`,
  class: `classDiagram
  class 注文 {
    +String 注文番号
    +Date 注文日
    +確定() void
  }
  class 顧客 {
    +String 氏名
  }
  顧客 "1" --> "*" 注文 : 発注する`,
  state: `stateDiagram-v2
  [*] --> 下書き
  下書き --> 申請中 : 申請
  申請中 --> 承認済み : 承認
  申請中 --> 下書き : 差し戻し
  承認済み --> [*]`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : "発注する"
  ORDER ||--|{ ORDER_ITEM : "含む"
  CUSTOMER {
    string id PK "顧客ID"
    string name "氏名"
  }`,
  gantt: `gantt
  title 開発スケジュール
  dateFormat YYYY-MM-DD
  section 設計
  要件定義 :a1, 2026-11-01, 10d
  基本設計 :after a1, 14d
  section 実装
  実装とテスト :2026-11-25, 30d`,
  pie: `pie title 工数の内訳
  "設計" : 30
  "実装" : 45
  "テスト" : 25`,
  mindmap: `mindmap
  root((システム))
    画面
      ログイン
      一覧
    バッチ
      日次集計`,
  invalid: `flowchart TD
  A --> `,
};
