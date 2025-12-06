# Agile Calendar Miro App デプロイガイド

このガイドでは、Agile CalendarアプリケーションをMiro Web SDKアプリとしてデプロイする方法を説明します。

## 前提条件

- Miroアカウント
- 静的ファイル用のホスティングソリューション（例：GitHub Pages、Vercel、Netlify、AWS S3）
- ビルドのためにローカルにNode.jsとnpmがインストールされていること

## ステップ1: アプリケーションのビルド

1. プロダクション用にアプリケーションをビルド:
   ```bash
   npm run build
   ```

2. ビルドされたファイルは`dist/`ディレクトリに格納されます。

## ステップ2: アプリケーションのホスティング

公開アクセス可能なHTTPS URLでビルドされたアプリケーションをホストする必要があります。以下にいくつかのオプションを示します：

### オプションA: GitHub Pages

1. リポジトリ設定でGitHub Pagesを有効化
2. ソースを`gh-pages`ブランチまたは`/docs`フォルダに設定
3. `dist/`の内容を選択した場所にデプロイ
4. アプリは`https://YOUR_USERNAME.github.io/agile-calender/`で利用可能になります

### オプションB: Vercel

1. Vercel CLIをインストール: `npm i -g vercel`
2. 実行: `vercel --prod`
3. プロンプトに従ってデプロイ
4. アプリは`https://your-project.vercel.app/`で利用可能になります

### オプションC: Netlify

1. Netlify CLIをインストール: `npm i -g netlify-cli`
2. 実行: `netlify deploy --prod --dir=dist`
3. アプリは`https://your-site.netlify.app/`で利用可能になります

### オプションD: カスタムサーバー

`dist/`ディレクトリの内容をWebサーバーにアップロードします。

**重要**: アプリはHTTPS経由で提供される必要があります。

## ステップ3: Miroアプリの作成

1. [Miro Developer Portal](https://developers.miro.com/)にアクセス
2. 「Create new app」をクリック
3. アプリの詳細を入力:
   - **App Name**: Agile Calendar
   - **Description**: アジャイルチーム向けスタンドアップスケジューラ
   - **App URL**: ステップ2でホストしたURL

## ステップ4: アプリ権限の設定

アプリ設定で以下を構成します：

### SDKスコープ
以下の権限を付与:
- `boards:read` - ボードコンテンツの読み取り
- `boards:write` - ボードコンテンツの変更

### アプリURL
- **Web-plugin**: `https://your-hosted-url/index.html`

### リダイレクトURI
- ホストしたURLを承認されたリダイレクトURIとして追加

## ステップ5: アプリのインストール

1. Miro Developer Portalで、アプリに移動
2. 「Install app and get OAuth token」をクリック
3. アプリをインストールするチームを選択
4. アプリを承認

## ステップ6: アプリの使用

1. Miroボードを開く
2. 左側のツールバーの3点メニュー（more）をクリック
3. インストール済みアプリから「Agile Calendar」を見つける
4. クリックしてパネルを開く

## 開発モード

ローカル開発の場合：

1. 開発サーバーを起動:
   ```bash
   npm run dev
   ```

2. アプリは`http://localhost:5173`で利用可能になります

3. Miroアプリ設定で、テスト用に一時的に`http://localhost:5173`をWeb-plugin URLとして使用できます

**注意**: Miroは本番環境でHTTP URLを許可しない場合があるため、ローカルテストにはHTTPSトンネリング（ngrokなど）を使用する必要があります：

```bash
# ngrokをインストール
npm i -g ngrok

# 開発サーバーを起動
npm run dev

# 別のターミナルでngrokを起動
ngrok http 5173

# ngrokからのHTTPS URLをMiroアプリ設定で使用
```

## アプリの更新

変更を加えた場合：

1. 新しいバージョンをビルド: `npm run build`
2. 更新された`dist/`ディレクトリをホスティングにデプロイ
3. ユーザーは次回ロード時に自動的に最新バージョンを取得します

## トラブルシューティング

### アプリがMiroに表示されない
- アプリがチームにインストールされていることを確認
- Web-plugin URLが正しいことを確認
- ホスティングでHTTPSが機能していることを確認

### 権限エラー
- 必要なすべてのSDKスコープが付与されていることを確認
- アプリを再インストールして権限を更新

### 読み込みの問題
- ブラウザコンソールでエラーを確認
- Miro SDKスクリプトが正しく読み込まれていることを確認
- ホストされたURLがアクセス可能であることを確認

### データが保持されない
- アプリに`boards:write`権限があることを確認
- メタデータ操作が正常に完了していることを確認
- ブラウザコンソールでエラーを探す

## セキュリティ上の考慮事項

- ホスティングには必ずHTTPSを使用
- 機密データやAPIキーをコミットしない
- Miroのセキュリティベストプラクティスを確認
- セキュリティパッチのため定期的に依存関係を更新

## サポート

以下に関する問題について：
- **このアプリ**: このリポジトリでイシューを作成
- **Miro SDK**: [Miro Developer Documentation](https://developers.miro.com/docs)を確認
- **ホスティング**: ホスティングプロバイダーのドキュメントを参照

## 追加リソース

- [Miro Web SDK ドキュメント](https://developers.miro.com/docs/web-sdk-reference)
- [Miro Developer コミュニティ](https://community.miro.com/developer-platform-and-apis-57)
- [Miro アプリ例](https://github.com/miroapp/app-examples)
