# Agile Calendar - Miro スタンドアップスケジューラ

Miroボード上で、タスク、チームメンバー、トラック、スケジュールを直接管理し、アジャイルチームのスタンドアップミーティングを効率化するMiro Web SDKアプリケーションです。

## 概要

このアプリケーションは、アジャイル開発チームの日次スタンドアップ運用を効率的に管理します：

- PM、Designer、Dev参加モードを持つタスク管理
- 3ヶ月のローリングカレンダービューの作成・維持
- 開発者をトラック（ペアプログラミング単位）に編成
- 2フェーズのスタンドアップミーティング対応（Phase1: チーム全体、Phase2: 開発者のみ）
- 個人スケジュールと可用性の追跡
- 外部チームとの連携

## 機能

### 実装済み機能

#### ✅ Tasks タブ
- タスクの作成、編集、削除
- タスクステータスの設定（Draft、Planned、Scheduled、Done、Canceled）
- 日付と時間範囲の設定
- Dev参加モードの定義（No Dev、Tracks、All Dev）
- タスクへの外部リンク追加
- 必要なトラック数の指定

#### ✅ Calendar タブ
- Miroボード上に3ヶ月カレンダービューを生成
- 月間ナビゲーション（前月/次月）
- PM、Designer、Trackの行を持つカレンダーフレームを自動作成
- 適切なカレンダーセルにタスクを表示

#### ✅ Tracks & Devs タブ
- 開発者名簿の管理
- トラックの作成と管理（ペアプログラミング用に1トラック最大2人）
- トラックの有効化/無効化
- トラック容量とステータスの表示

#### ✅ Settings タブ
- カレンダー表示の基準月を設定
- 外部チーム定義の管理
- 現在の統計表示（開発者数、トラック数、外部チーム数）

### 予定機能（未実装）

- **Phase1 Standup タブ**: PM、Designer、Dev参加モード決定を含むチーム全体での計画
- **Phase2 Standup タブ**: トラック割り当てと競合解決のための開発者専用セッション
- **Daily Track Assignments**: 各日に特定の開発者をトラックに割り当て
- **Personal Schedules**: 終日休暇と部分的な時間ブロックの追跡
- **Conflict Detection**: 可用性に基づくスケジュール競合の検出
- **Task Placement**: 日付/時間に基づいてカレンダー上にタスクを自動配置

## 技術スタック

- **TypeScript** - 型安全な開発
- **React** - UIフレームワーク
- **Vite** - ビルドツールと開発サーバー
- **Miro Web SDK v2** - Miroボードとの統合

## プロジェクト構造

```
src/
├── components/
│   └── Tabs/
│       ├── TasksTab.tsx          # タスク管理UI
│       ├── CalendarTab.tsx       # カレンダー生成とナビゲーション
│       ├── TracksTab.tsx         # 開発者とトラック管理
│       └── SettingsTab.tsx       # アプリケーション設定
├── models/
│   └── types.ts                  # TypeScript型定義
├── services/
│   ├── settingsService.ts        # 設定の永続化
│   ├── tasksService.ts           # タスクCRUD操作
│   └── calendarLayoutService.ts  # カレンダーレンダリングロジック
├── App.tsx                       # メインアプリケーションコンポーネント
├── miro.ts                       # Miro SDK初期化
└── index.tsx                     # アプリケーションエントリーポイント
```

## はじめに

### 必要要件

- Node.js (v16以上)
- npmまたはyarn
- Miroアカウントとボード

### インストール

1. リポジトリをクローン:
   ```bash
   git clone https://github.com/satoshikosugi/agile-calender.git
   cd agile-calender
   ```

2. 依存関係をインストール:
   ```bash
   npm install
   ```

3. 開発サーバーを起動:
   ```bash
   npm run dev
   ```

4. プロダクション用ビルド:
   ```bash
   npm run build
   ```

### Miroアプリのセットアップ

このアプリをMiroで使用するには、以下が必要です：

1. [Miro Developer Portal](https://developers.miro.com/)で新しいMiroアプリを作成
2. Web SDK権限でアプリを設定
3. ホストされたアプリケーションを指すようにアプリURLを設定
4. Miroボードにアプリをインストール

詳細なMiroセットアップ手順は今後のアップデートで追加されます。

## データモデル

すべてのデータは、メタデータを使用してMiroボード上に直接保存されます：

- **Settings**: 不可視図形のメタデータに保存
- **Tasks**: 各タスクはメタデータ付き付箋
- **Calendar Frames**: 月表示はラベル付き行と列を持つMiroフレーム

詳細なデータモデル仕様については`develop.md`を参照してください。

## 使い方

1. **チームをセットアップ**: 
   - Tracks & Devsタブに移動
   - チームに開発者を追加
   - トラックを作成（通常Track1、Track2など）

2. **設定を構成**:
   - Settingsタブに移動
   - 基準月を設定
   - 必要に応じて外部チームを追加

3. **タスクを作成**:
   - Tasksタブに移動
   - 「New Task」をクリックしてタスクを作成
   - 日付、時間、Devモードなどの詳細を入力

4. **カレンダーを生成**:
   - Calendarタブに移動
   - 「Generate/Update Calendar」をクリックしてMiroボード上にカレンダーフレームを作成
   - ナビゲーションボタンを使用して月間を移動

## 開発ロードマップ

完全な詳細については`develop.md`の完全な仕様を参照してください。主な残りの機能：

- [ ] Phase1 Standupタブの実装
- [ ] Phase2 Standupタブの実装
- [ ] 日次トラック割り当てUI
- [ ] 個人スケジュール管理
- [ ] 競合検出と解決
- [ ] カレンダー上のタスク配置の強化
- [ ] トラック割り当てのローテーションアルゴリズム
- [ ] 外部タスク管理ツールとの統合（将来）

## コントリビューション

コントリビューションを歓迎します！詳細については、コントリビューションガイドラインを参照してください。

## ライセンス

ISC

## 関連情報

- [develop.md](develop.md) - 完全な技術仕様
- [Miro Web SDK ドキュメント](https://developers.miro.com/docs/web-sdk-reference)
