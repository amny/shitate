# 顧客管理システム 要件定義書

本書は、顧客管理システムの**要件**を定義する。用語は*付録*を参照のこと。旧仕様の~~紙台帳運用~~は廃止する。
設定値は `max_customers` で変更できる。詳細は[社内Wiki](https://example.com/wiki)を参照。

## 背景と目的

### 現状の課題

- 顧客情報が部署ごとに分散している
  - 営業部：Excel管理
  - サポート部：独自データベース
    - 重複登録が月50件程度発生
- 問い合わせ履歴を横断して検索できない

### 目的

1. 顧客情報を一元管理する
2. 問い合わせ対応を効率化する
   1. 履歴の横断検索
   2. 担当者の自動割り当て
      - 地域別
      - 製品別
3. 経営層向けのレポートを自動作成する

## 機能一覧

| 機能ID | 機能名 | 優先度 | 工数（人日） |
|:-------|:------:|:------:|-------------:|
| F-01 | 顧客登録 | 高 | 5 |
| F-02 | 顧客検索 | 高 | 8 |
| F-03 | **履歴照会** | 中 | 3 |
| F-04 | レポート出力（`CSV`） | 低 | 2.5 |

#### 補足

> 優先度「低」の機能は、第2フェーズで実装する。
> 予算の状況により変更の可能性がある。

## システム構成

![システム構成図](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAKCAIAAAAy3EnLAAAAE0lEQVR42mPQ86olCTGMahiaGgBkuJkhmHXlqgAAAABJRU5ErkJggg==)

APIの呼び出し例：

```ts
const res = await fetch('/api/customers?q=山田');
const customers: Customer[] = await res.json();
```

---

以上
