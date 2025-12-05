# Miro スタンドアップスケジューラ アプリ仕様（Copilot Coding Agent 用 Canvas）

## 0. コンセプト概要

Miro 上で、アジャイル開発チームの **日次スタンドアップ運用を効率化**するための専用アプリ（Web SDK ベースのサイドパネルアプリ）を実装する。

特徴:

* Miro ボード上に **3ヶ月分のカレンダー**を自動生成・表示
* **タスク登録〜前半スタンドアップ〜後半スタンドアップ**までを 1 つのパネル UI で一貫サポート
* Dev は **Track（ペア／ソロ）単位**でスケジューリングし、個人は日毎に Track に割り当て
* **個人予定（全休・時間単位のブロック）**を考慮したタスクアサイン
* PM / Designer / 他チーム（外部チーム）もロールとして扱い、時間固定の会議なども表現
* スタンドアップの限られた時間で、アサインと時間調整をできるだけ自動化・半自動化

実装ターゲット:

* Miro Web SDK (v2)
* パネル内 UI: React + TypeScript（想定）

---

## 1. 前提・用語

### 1.1 チーム構成の前提

* 役割:

  * **PM**（1 名想定）
  * **Dev**（人数可変。例: 5 名）
  * **Designer**（0〜複数名）
  * **External Teams（他チーム）**: プロダクトAチーム、インフラ、営業など（定義可能）

* Dev は **Track（トラック）** という作業ユニットに所属して作業する

  * 1 Track の最大人数 = **2 人（ペアプロ）**
  * Dev の人数が奇数の場合、1 Track が **ソロ（1 人）** になる
  * Track 数は可変（例: Dev5 人 → Track3 / Dev7 人 → Track4 など）

### 1.2 スタンドアップ運用フロー

1. **準備段階（いつでも）**

   * タスクを自由に登録・編集できる
   * 日付だけ決める / PM と 1 Track が必要なことだけ決める / 他チーム参加で時間固定済みなど、粒度は様々

2. **前半スタンドアップ（PM + チーム全体 + Designer）**

   * 対象: PM / Dev / Designer / 他チームが関わるタスク
   * 決めること:

     * タスクの参加ロール（PM / Designer / Dev モード / 他チーム）
     * Dev の参加形態（Dev なし / 何 Track 必要か / 全 Dev）
     * タスクの日付と時間帯の調整
   * この時点では **Track の中身（誰がどの Track か）は決めない**

3. **後半スタンドアップ（Dev のみ）**

   * 「今日の Track 編成」を決める

     * Dev 個人を、Track1 / Track2（ペア）/ Track3（ソロ）…に割り当て
   * 前半で Dev 枠が確保されたタスクについて:

     * どの Track が参加するかを決める
     * 個人予定（全休 / 一部時間ブロック）を考慮して時間調整する

---

## 2. ユースケース

### 2.1 準備段階のタスク登録

* PM やメンバーが、いつでもタスクをパネルから登録・更新できる
* 登録例:

  * 「来週水曜にやりたい API 設計レビュー」
  * 「PM + 1 Track が必要（どの Track かは未定）」
  * 「他チーム（プロダクトA）が参加、先方の会議枠で時間固定」

### 2.2 前半スタンドアップ

* タスク一覧を「今日」「今週」などでフィルタして表示
* 各タスクについて:

  * PM / Designer / Dev モード（Dev なし / Tracks / AllDev）の確認・変更
  * Dev が関わるタスクについては「必要 Track 数」を決める
  * 他チームの参加状況と時間固定フラグを確認
  * カレンダー上の空き枠を見ながら、日付・時間を決定
* この結果、タスクは **Phase1（Planned）** 状態になる

### 2.3 後半スタンドアップ

1. 「今日の Track 編成」タブ:

   * Dev の一覧を元に、Track1〜N に Dev を割り振る
   * 1 Track あたり最大 2 人の制約
   * 1 Dev が複数 Track に属さない制約
   * Dev 数から必要 Track 数を自動計算する「自動編成」ボタン
   * ローテーションロジック（簡易でよい）で日毎のペアを変えるオプション

2. 「Dev アサイン」タブ:

   * Phase1 で Dev 枠が確保されているタスクを表示
   * 各タスクについて:

     * Dev モードが Tracks の場合 → どの Track を割り当てるかを選択
     * AllDev の場合 → その時間帯の他タスクとの衝突をチェック
   * 個人予定（全休・時間ブロック）を考慮して、

     * Track に入っているメンバーがその時間帯に実際に動けるかを判定
     * 衝突している場合は警告表示（色・アイコンなど）
   * 必要であればタスク時間を微調整し、カレンダー上の位置を更新

---

## 3. データモデル（メタデータ設計）

### 3.1 Task（タスク）

各タスクは、Miro の付箋 or カードとして表現し、metadata に構造化データを持たせる。

#### Task メタデータ構造（案）

```jsonc
{
  "task": {
    "id": "task-uuid",           // 任意の一意ID
    "status": "Draft",           // Draft | Planned | Scheduled | Done | Canceled
    "title": "API仕様レビュー",
    "summary": "○○チームとの合同レビューで仕様確定",
    "externalLink": "https://...", // 外部ドキュメント / チケット等

    "date": "2025-12-10",       // YYYY-MM-DD（未定なら null）
    "time": {
      "start": "14:00",        // HH:MM（未定なら null）
      "end": "15:00"
    },

    "roles": {
      "pmId": "pm1",            // PM担当者ID（nullの可能性あり）
      "designerIds": ["des1"],  // 複数デザイナー対応
      "devPlan": {
        "phase": "Draft",       // Draft | Phase1Planned | Phase2Fixed
        "mode": "Tracks",       // NoDev | Tracks | AllDev
        "requiredTrackCount": 1,  // mode=Tracksのときに 1〜N
        "assignedTrackIds": []    // Phase2 で確定 ["t2", "t3"] など
      }
    },

    "externalParticipants": [
      {
        "teamId": "teamA",      // externalTeam.id
        "required": true,         // 参加必須かどうか
        "timeFixed": true         // そのチーム都合で時間固定か
      }
    ],

    "constraints": {
      "timeLocked": false,       // true の場合、時間変更禁止
      "rolesLocked": false,      // ロール変更禁止
      "externalFixed": false     // 外部要因で動かせない（情報として）
    }
  }
}
```

### 3.2 Dev（開発者）

```jsonc
{
  "devs": [
    { "id": "d1", "name": "佐藤" },
    { "id": "d2", "name": "鈴木" },
    { "id": "d3", "name": "山田" },
    { "id": "d4", "name": "木村" },
    { "id": "d5", "name": "中村" }
  ]
}
```

### 3.3 Track（トラック）

```jsonc
{
  "tracks": [
    {
      "id": "t1",
      "name": "Track1",
      "role": "Dev",
      "capacity": 2,      // 最大2人（ペアプロ）
      "active": true
    },
    {
      "id": "t2",
      "name": "Track2",
      "role": "Dev",
      "capacity": 2,
      "active": true
    },
    {
      "id": "t3",
      "name": "Track3",
      "role": "Dev",
      "capacity": 2,
      "active": true
    }
  ]
}
```

Track 数は可変。不要になった Track は `active=false` にして過去データは保持。

### 3.4 DailyTrackAssignments（日付ごとの Track 編成）

```jsonc
{
  "dailyTrackAssignments": {
    "2025-12-06": {
      "t1": ["d1", "d2"],  // ペア
      "t2": ["d3", "d4"],  // ペア
      "t3": ["d5"]          // ソロ
    },
    "2025-12-07": {
      "t1": ["d3", "d5"],
      "t2": ["d1", "d4"],
      "t3": ["d2"]
    }
  }
}
```

制約:

* 各 Track の人数 ≤ `capacity`（通常 2）
* 1 Dev は 1 日に 1 Track のみ
* Dev が増えた場合は Track を追加（active な Track を増やす）

### 3.5 ExternalTeams（外部チーム）

```jsonc
{
  "externalTeams": [
    { "id": "teamA", "name": "プロダクトAチーム" },
    { "id": "teamB", "name": "インフラチーム" },
    { "id": "teamC", "name": "営業チーム" }
  ]
}
```

### 3.6 PersonalSchedule（個人予定）

Dev 個人の予定（全休や一部時間ブロック）を表現する。

```jsonc
{
  "personalSchedules": {
    "d1": [
      {
        "date": "2025-12-06",
        "type": "fullDayOff",      // fullDayOff | partial
        "reason": "有給休暇"
      },
      {
        "date": "2025-12-07",
        "type": "partial",
        "start": "13:00",
        "end": "14:00",
        "reason": "自社ミーティング"
      }
    ],
    "d2": [
      {
        "date": "2025-12-06",
        "type": "partial",
        "start": "10:00",
        "end": "11:00",
        "reason": "プライベート"
      }
    ]
  }
}
```

これにより、タスクアサイン時に「その時間枠でその Dev（Track メンバー）が動けるか」を判定する。

### 3.7 Settings（ボード単位の設定）

すべての設定・マスタを 1 つの「設定用オブジェクト」としてまとめ、ボード上の見えないシェイプの metadata に保存するイメージ。

```jsonc
{
  "settings": {
    "baseMonth": "2025-12",         // カレンダー基準月（3ヶ月ウィンドウ）
    "viewSpanMonths": 3,
    "devs": [...],
    "tracks": [...],
    "externalTeams": [...],
    "personalSchedules": {...},
    "dailyTrackAssignments": {...}
  }
}
```

---

## 4. カレンダー＆ボード構造

### 4.1 カレンダー構造

* Miro ボード上に **月単位のフレーム**を生成

  * 例: `2025-12`, `2026-01`, `2026-02`
* 常に **3ヶ月分**のカレンダーを表示（`baseMonth -1, baseMonth, baseMonth +1`）
* パネルの「月移動」ボタンで `baseMonth` を前後させ、

  * 必要に応じて新しい月フレームを自動生成
  * viewport を該当フレームの中心に移動

### 4.2 カレンダーの中身

* 行: PM / Designer / Track1 / Track2 / Track3 ... （active な Track のみ）
* 列: 日付 or 時間枠（詳細実装は簡易で良い。最初は「日付単位」でもよい）
* タスク付箋は、該当する

  * 日付
  * 対象行（PM / Designer / Track） のマス領域に配置する

### 4.3 外部リンク表示

* タスク metadata に `externalLink` がある場合:

  * パネル上にリンクアイコンを表示
  * クリックで別タブで開く
  * Miro 上でも、関連するノート（Note）を生成し、そこに外部リンクを貼る

---

## 5. パネル UI 構成

### 5.1 タブ構成（案）

1. **Tasks（タスク登録／編集）タブ**
2. **Standup Phase1（前半スタンドアップ）タブ**
3. **Standup Phase2（後半スタンドアップ）タブ**
4. **Tracks & Devs（Track編成 & メンバー管理）タブ**
5. **Calendar（カレンダー生成 & 月移動）タブ**
6. **Settings（各種マスタ）タブ**（シンプルでよい）

### 5.2 Tasks タブ

* 機能:

  * タスク一覧（フィルタ:

    * 日付（今日 / 明日 / 今週 / 未定）
    * ステータス（Draft / Planned / Scheduled）
    * ロール（PMあり / Devあり / Designerあり / 他チームあり）
  * タスク詳細編集フォーム:

    * タスク名
    * 概要
    * 外部リンク
    * 日付 / 時間帯
    * PM 参加
    * Designer 参加
    * Dev モード（NoDev / Tracks / AllDev）
    * Tracks モード時の必要 Track 数
    * 他チーム参加（externalTeams から複数選択） + 必須 / 任意 + timeFixed
    * 制約フラグ（timeLocked, rolesLocked, externalFixed）

### 5.3 Standup Phase1 タブ

* 対象: 今日／今週のタスクのうち、`status != Done/Canceled`
* メインビュー:

  * タスク一覧（表形式）

    * タスク名
    * 日付 / 時間
    * PM / Designer / Dev モード
    * 他チーム
    * 制約（🔒アイコンなど）
  * 行クリック → 右側に詳細と編集フォーム
* サポート機能:

  * カレンダーと同期し、空き時間候補を表示
  * Dev の **Track 総数** と、タスクが要求する `requiredTrackCount` の合計から

    * 明らかに Dev キャパオーバーの時間帯を警告
  * 時間固定タスク（`timeLocked=true`）は時間編集UIを無効化

### 5.4 Standup Phase2 タブ

* 前提: "今日" の `dailyTrackAssignments` が設定済み
* 対象: `devPlan.phase == Phase1Planned` のタスク
* メインビュー:

  * 時間順に並んだタスク一覧
  * 各タスクの Dev モード（Tracks / AllDev）
  * Track 候補リスト（個人予定を加味した可/不可表示）
* 機能:

  * Tracks モード:

    * `requiredTrackCount` に応じて、割り当て可能な Track リストを表示
    * 個人予定を見て、その時間帯に Track メンバーが全員「available」か判定
    * 問題ない Track には✅、一部NGな Track には⚠️などを表示
  * AllDev モード:

    * その時間帯に Dev の誰かが personalSchedule でブロックされていないかチェック
  * 必要に応じてタスク時間移動（timeLocked でない場合のみ）
  * 割り当て完了後、`devPlan.phase = Phase2Fixed`, `assignedTrackIds = [...]` に更新

### 5.5 Tracks & Devs タブ

* Dev マスタ編集

  * Dev の追加 / 名前変更 / 有効・無効
* Track マスタ編集

  * Track の追加 / 名前変更 / active フラグ
  * capacity は原則 2 で固定（将来拡張余地として残しても良い）
* 「今日の Track 編成」

  * 日付選択（デフォルトは今日）
  * 各 Track 行に Dev を割当
  * 制約バリデーション:

    * 各 Track の人数 ≤ capacity
    * 1 Dev はその日 1 Track のみ
  * 「自動編成」「前日コピー」「ローテーション適用」ボタン

### 5.6 Calendar タブ

* 機能:

  * `baseMonth` を基準に 3ヶ月分のカレンダーをボード上に生成
  * 「前月」「次月」ボタンで `baseMonth` を前後させる
  * 必要に応じて新しい月フレームを生成
  * viewport を基準月フレームに移動

---

## 6. アサイン・時間調整ロジック（概要）

### 6.1 Dev 枠キャパシティの扱い

* 1 Track = capacity 2（Dev 2 人分）
* ある時間枠における Dev キャパシティ = `activeTrackCount * 1.0` （概念的には 1Track=1枠として扱う）
* Phase1 では **個人予定を考慮しない** 粗いチェックとして:

  * その時間枠における `sum(requiredTrackCount)` ≤ `activeTrackCount` を確認

### 6.2 個人予定を加味したチェック（Phase2）

* Track t のメンバー M（Dev ID の配列）と時間帯 [start,end) に対して:

  * 各 Dev の `personalSchedules` を参照
  * 該当日付に `fullDayOff` があれば NG
  * `partial` で時間帯が重なっていれば NG
* 全メンバーが OK なら、その Track はその時間帯に参加可能
* これを一覧上で可視化:

  * ✅利用可能 / ⚠️一部 Dev 不可 / ❌不可能

### 6.3 時間移動のガイド

* タスクの時間を変更する際:

  * `timeLocked` が true の場合 → 変更禁止
  * 他チーム参加で `timeFixed` の外部参加者がいる場合 → 警告
* Dev 側の都合で時間変更する時は、

  * PM / Designer / 他チームの他タスクとの衝突もチェック
  * 必要なら「要再調整」フラグをタスクに立てる（UI 上で分かるように）

---

## 7. 実装方針（技術的指定）

### 7.1 プロジェクト構成（例）

* 言語: TypeScript
* UI: React
* ビルド: Vite or CRA（好みでよいが、軽量な Vite 推奨）

ディレクトリ案:

```text
src/
  index.tsx           // Miro パネルエントリ
  miro.ts             // Miro Web SDK 初期化 & ヘルパ
  components/
    App.tsx
    Tabs/
      TasksTab.tsx
      Phase1Tab.tsx
      Phase2Tab.tsx
      TracksTab.tsx
      CalendarTab.tsx
      SettingsTab.tsx
    TaskList.tsx
    TaskForm.tsx
    TrackAssignmentEditor.tsx
    CalendarMiniView.tsx
  models/
    types.ts          // Task, Dev, Track, Settings などの型定義
    metadataMapper.ts // Miro item <-> 内部モデルの変換
  services/
    settingsService.ts        // 設定オブジェクトのロード/保存
    tasksService.ts           // タスク CRUD
    calendarLayoutService.ts  // カレンダー座標計算 & アイテム配置
    schedulingService.ts      // アサイン & コンフリクト判定ロジック
```

### 7.2 Miro Web SDK で使う主な機能

* `miro.board.ui.openPanel` でパネル起動
* `miro.board.get`, `miro.board.createStickyNote`, `miro.board.createFrame`, `miro.board.createShape`, `miro.board.viewport.*` など
* `item.setMetadata` / `item.getMetadata` でアプリ専用メタデータを読み書き
* 設定用の見えないシェイプを 1つ作って、そこに Settings を集約する（ID を metadata に保持）

### 7.3 優先度

1. Settings と Task モデルを実装し、Tasks タブで登録・編集できるようにする
2. Calendar タブで 3ヶ月カレンダーの生成 & 月移動ができるようにする
3. Tracks & Devs タブで日付ごとの Track 編成（dailyTrackAssignments）を編集できるようにする
4. Phase1 タブでタスクの Dev モード / requiredTrackCount / 時間調整ができるようにする
5. Phase2 タブで Track 割当と個人予定を考慮したコンフリクトチェックを実装する

---

## 8. 非機能要件・UI ポイント

* スタンドアップの時間が限られているため、**できるだけクリック数を減らす UI** を優先

  * タスク一覧から直接、主要なフィールド（Dev モード、必要Track数、時間帯）をインライン編集可能にする
  * コンフリクトはわかりやすいアイコン＆色で即座に表示
* エラーより「警告」を基本とし、最終判断は人間に委ねる
* データはすべて Miro ボードに永続化し、ブラウザを閉じても状態は保持

---

## 9. 今後の拡張余地（参考）

* Jira / GitHub Issues など外部タスク管理との同期
* タスクの実績記録（誰がどれだけ参加したか）
* ローテーションルールの高度化（全員が均等にペアを組むように最適化）
* チームごとのテンプレート（複数プロジェクトへの展開）

---

> Copilot Coding Agent への指示:
>
> 上記仕様に基づき、Miro Web SDK アプリとして実装してください。まずは最小限スコープとして、
>
> * Settings モデル & Task モデル
> * Tasks タブ（登録・編集）
> * Calendar タブ（3ヶ月カレンダー生成 & 月移動）
>
> を実装し、その後 Tracks & Devs タブ、Phase1 / Phase2 タブを順次実装する形で進めてください。
