# 配達業務管理アプリ

配達ドライバー向けの地図ルート管理 Web アプリです。支店（アカウント）ごとに顧客情報を管理し、道路に沿った配達ルートを地図上に表示します。

## 機能

- **アカウント管理** — メールアドレス＋パスワードで支店ごとにアカウントを作成。他の支店のデータは見えません。
- **顧客登録** — 名前・住所・商品情報を登録。住所から自動で位置情報を取得します。
- **配達順序番号** — 顧客ごとに自由に順序番号を設定できます。
- **道路ルート表示** — 順序番号順に OSRM を使って道路に沿ったルートを地図に描画します。
- **現在地表示** — ブラウザの位置情報を使って自分の現在地をマップ上に表示します。

---

## セットアップ手順

### 1. Firebase プロジェクトを作成する

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを新規作成
2. **Authentication** を有効化 → 「メール/パスワード」プロバイダーをオン
3. **Firestore Database** を作成 → 「本番モード」で開始
4. Firestore の **ルール** を以下に書き換えて保存:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /customers/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

5. プロジェクトの設定 → 「ウェブアプリを追加」 → 表示された設定値をコピー

### 2. 環境変数を設定する

```bash
cp .env.example .env
```

`.env` を開き、Firebase の設定値を貼り付けます:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 3. ローカルで起動する

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。

---

## GitHub Pages へのデプロイ手順

### 1. GitHub リポジトリを作成してプッシュ

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
git push -u origin main
```

### 2. GitHub Secrets に Firebase 設定を登録

リポジトリの **Settings → Secrets and variables → Actions** で以下を追加:

| シークレット名 | 値 |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase の API キー |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase の Auth ドメイン |
| `VITE_FIREBASE_PROJECT_ID` | Firebase のプロジェクト ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase のストレージバケット |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase の送信者 ID |
| `VITE_FIREBASE_APP_ID` | Firebase のアプリ ID |

### 3. GitHub Pages を有効にする

リポジトリの **Settings → Pages** → Source: **GitHub Actions** を選択

### 4. Firebase の承認済みドメインに追加

Firebase Console → Authentication → Settings → 承認済みドメイン に  
`<ユーザー名>.github.io` を追加してください。

デプロイ URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`

---

## 技術スタック

| 項目 | 採用技術 |
|---|---|
| フロントエンド | React + TypeScript + Vite |
| 認証・DB | Firebase Authentication + Firestore |
| 地図 | Leaflet.js + OpenStreetMap |
| 道路ルーティング | OSRM（無料・API キー不要） |
| ホスティング | GitHub Pages |
